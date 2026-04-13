# Backend Architecture — Field Play

## Overview

Field Play uses Supabase (Postgres + Auth + Edge Functions + RLS) as its backend.
This document describes the data model, the conflict-resolution strategy for
overlapping court units, and the transactional booking flow.

---

## 1. Physical Slot Model (Business Rule)

A physical field has **6 slots** (S1–S6). These compose into bookable units:

```
┌─────────────────────────────────────────────────────┐
│                    F11 (full field)                  │
│  S1 ──── S2 ──── S3 ──── S4 ──── S5 ──── S6       │
│  ├─ F7_1 ─┤  ├─ F7_2 ─┤  ├─ F7_3 ─┤               │
│  │C1│ │C2│  │C3│ │C4│  │C5│ │C6│                    │
└─────────────────────────────────────────────────────┘

F11 = 6 slots = 3 F7 = 6 F5
F7  = 2 slots = 2 F5
F5  = 1 slot
```

**Key invariant:** Booking any unit locks its physical slots. An F7_1 booking
(S1+S2) prevents any F5/C1 (S1) or F5/C2 (S2) or F11 (S1–S6) from being
booked in the same time range.

---

## 2. Schema Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User accounts (linked to `auth.users`) |
| `clubs` | Venues with operating hours |
| `fields` | Physical courts belonging to a club |
| `field_units` | Bookable units (F11/F7/F5) with `slot_ids[]` |
| `field_unit_conflicts` | **NEW** — Materialized conflict graph between overlapping units |
| `pricing_rules` | Per-club, per-field-type pricing config |
| `bookings` | Reservations (with status, price, time range) |
| `blocks` | Admin-created time blocks (maintenance, events) |
| `block_units` | Maps blocks → affected field_units |

### Conflict Graph (`field_unit_conflicts`)

This table materializes which units overlap. For a `versatile_full` layout:

```
F11 conflicts with: F7_1, F7_2, F7_3, C1, C2, C3, C4, C5, C6
F7_1 conflicts with: F11, C1, C2
F7_2 conflicts with: F11, C3, C4
F7_3 conflicts with: F11, C5, C6
C1 conflicts with: F11, F7_1
...
```

The graph is **auto-maintained** by a trigger on `field_units`. When units are
inserted, updated, or deleted, the trigger recomputes all conflict pairs for
that field using the `&&` (array overlap) operator on `slot_ids`.

---

## 3. What Moved from Frontend to Backend

| Concern | Before (frontend-only) | After (backend RPC) |
|---------|----------------------|---------------------|
| Conflict detection | `availability.ts` checks slot overlap in-memory | `field_unit_conflicts` table + `rpc_check_availability` |
| Double-booking prevention | Exclusion constraint on same `field_unit_id` only | Advisory lock per field + cross-unit conflict check |
| Available time slots | `getAvailableTimeSlots()` client-side | `rpc_get_available_time_slots()` |
| Unit options | `getUnitOptions()` client-side | `rpc_get_unit_options()` |
| Price calculation | Client computes `(hours × price_per_hour)` | `rpc_calculate_price()` validates rules |
| Booking creation | Direct `.insert()` on `bookings` table | `rpc_create_booking()` — atomic check+insert |
| Find available unit | `findAvailableUnit()` client-side | `rpc_find_available_unit()` |

### What stays in the frontend

- UI state management (selected slots, step navigation)
- Optimistic display of availability (can still use client-side helpers for instant UI feedback)
- Email notification trigger (Edge Function call after booking confirmation)
- Layout template logic (`buildFieldUnits`) — runs only on admin field creation

---

## 4. Transactional Booking Flow

```
Client                          Supabase (Postgres)
  │                                    │
  ├─ rpc_calculate_price() ───────────►│ validate duration, return price
  │◄─ {total_price, ...} ─────────────┤
  │                                    │
  ├─ rpc_create_booking() ────────────►│
  │                                    ├─ pg_advisory_xact_lock(field)
  │                                    ├─ rpc_check_availability()
  │                                    │   ├─ get_conflicting_unit_ids()
  │                                    │   ├─ check bookings on ALL conflicting units
  │                                    │   └─ check blocks on ALL conflicting units
  │                                    ├─ INSERT INTO bookings
  │                                    └─ COMMIT (releases lock)
  │◄─ {booking JSON} ─────────────────┤
  │                                    │
  ├─ send-booking-received-email ─────►│ Edge Function → Resend
```

### Why advisory locks?

The existing `no_overlapping_bookings` exclusion constraint only checks the
same `field_unit_id`. Cross-unit conflicts (F11 vs F5, F7 vs F5) are NOT
caught by it. Rather than building a complex multi-row constraint, we:

1. Lock the entire field (advisory lock keyed on `field_id`)
2. Check all conflicting units in a single query
3. Insert if available, raise exception if not

This serialises concurrent booking attempts for the same physical field,
which is the correct granularity — you can still book different fields
concurrently.

---

## 5. API / RPC Reference

### `rpc_check_availability(field_unit_id, date, start_time, end_time) → boolean`
- Checks if a specific unit is bookable, considering all conflicting units
- Used internally by other RPCs and can be called directly for UI validation

### `rpc_create_booking(user_id, club_id, field_unit_id, field_type, date, start_time, end_time, total_price, notes?) → jsonb`
- **The only safe way to create bookings**
- Acquires advisory lock, checks availability, inserts atomically
- Raises `BOOKING_CONFLICT` exception if unavailable
- Returns the created booking as JSON

### `rpc_get_available_time_slots(field_id, field_type, date) → jsonb`
- Returns array of 30-min slots with `{start, end, available, availableUnits, totalUnits}`
- Respects club operating hours
- Replaces `getAvailableTimeSlots()` from `availability.ts`

### `rpc_get_unit_options(field_id, field_type, date, start_time, end_time) → jsonb`
- Returns array of units with `{id, type, name, slot_ids, available}`
- Replaces `getUnitOptions()` from `availability.ts`

### `rpc_calculate_price(club_id, field_type, start_time, end_time) → jsonb`
- Validates duration against `minimum_minutes` and `increment_minutes`
- Returns `{price_per_hour, duration_minutes, total_price, ...}`

### `rpc_find_available_unit(field_id, field_type, date, start_time, end_time) → jsonb`
- Returns the first available unit (ordered by name), or null
- Used for auto-assignment when user doesn't pick a specific court

---

## 6. Frontend Integration Guide

### Calling RPCs from Supabase JS client

```typescript
// Check availability
const { data: available } = await supabase.rpc('rpc_check_availability', {
  p_field_unit_id: unitId,
  p_date: '2026-04-15',
  p_start_time: '18:00',
  p_end_time: '19:00',
});

// Create booking (transactional)
const { data: booking, error } = await supabase.rpc('rpc_create_booking', {
  p_user_id: userId,
  p_club_id: clubId,
  p_field_unit_id: unitId,
  p_field_type: 'F7',
  p_date: '2026-04-15',
  p_start_time: '18:00',
  p_end_time: '19:00',
  p_total_price: 6000,
  p_notes: null,
});

if (error?.message?.includes('BOOKING_CONFLICT')) {
  // Show "slot no longer available" toast, reload availability
}

// Get time slots for a day
const { data: slots } = await supabase.rpc('rpc_get_available_time_slots', {
  p_field_id: fieldId,
  p_field_type: 'F5',
  p_date: '2026-04-15',
});

// Calculate price
const { data: pricing } = await supabase.rpc('rpc_calculate_price', {
  p_club_id: clubId,
  p_field_type: 'F7',
  p_start_time: '18:00',
  p_end_time: '19:30',
});
```

### Migration path (incremental)

1. **Phase 1 (now):** Deploy migration SQL. Existing frontend continues to work unchanged.
2. **Phase 2:** Replace `createBooking()` in `AppDataContext` to call `rpc_create_booking` instead of direct `.insert()`.
3. **Phase 3:** Replace availability helpers to call server RPCs (optionally keep client-side as optimistic cache).
4. **Phase 4:** Replace client-side price calculation with `rpc_calculate_price`.

---

## 7. Security Model

- **RLS** is enabled on all tables. Policies use `auth.uid()` and `is_club_admin()`.
- **RPCs** use `security definer` to bypass RLS internally (they enforce their own auth checks).
- **Advisory locks** are scoped to the transaction and released on commit/rollback.
- **Price validation** is currently trust-but-verify. Phase 2 should enforce server-calculated prices.

---

## 8. Known Limitations & Next Steps

| Item | Status | Notes |
|------|--------|-------|
| Cross-unit conflict prevention | ✅ Done | Via conflict graph + advisory locks |
| Server-side availability | ✅ Done | RPCs ready to call |
| Server-side price validation | ⚠️ Partial | RPC exists but booking RPC trusts client price |
| Recurring bookings | ❌ Not yet | Need `booking_series` table |
| Payment integration | ❌ Not yet | Need `payments` table + webhook |
| Waitlist / notifications | ❌ Not yet | Need `waitlist_entries` table |
| Multi-field venues | ✅ Supported | Each field has independent slots/units |
| Time-based pricing (peak/off-peak) | ❌ Not yet | Needs `pricing_time_ranges` table |
| Cancellation policies | ❌ Not yet | Need `cancellation_rules` table |
| Supabase Realtime subscriptions | ❌ Not yet | For live availability updates |

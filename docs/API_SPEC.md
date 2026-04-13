# API / RPC Specification — Field Play

All endpoints are Supabase Postgres RPCs called via `supabase.rpc()`.
Parameters use the `p_` prefix convention.

---

## 1. `rpc_check_availability`

**Purpose:** Check if a specific field unit can be booked at the given time.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `p_field_unit_id` | `uuid` | Yes | The bookable unit to check |
| `p_date` | `date` | Yes | Booking date (YYYY-MM-DD) |
| `p_start_time` | `time` | Yes | Start time (HH:MM) |
| `p_end_time` | `time` | Yes | End time (HH:MM) |

**Returns:** `boolean` — `true` if available, `false` if blocked by a booking or block on this or any conflicting unit.

**Example:**
```typescript
const { data } = await supabase.rpc('rpc_check_availability', {
  p_field_unit_id: 'uuid-here',
  p_date: '2026-04-15',
  p_start_time: '18:00',
  p_end_time: '19:00',
});
// data === true | false
```

---

## 2. `rpc_create_booking`

**Purpose:** Atomically check availability and create a booking. This is the **only safe way** to create bookings — never use direct `.insert()` on the `bookings` table in production.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `p_user_id` | `uuid` | Yes | Booking user |
| `p_club_id` | `uuid` | Yes | Club/venue |
| `p_field_unit_id` | `uuid` | Yes | Unit to book |
| `p_field_type` | `text` | Yes | `'F5'`, `'F7'`, or `'F11'` |
| `p_date` | `date` | Yes | Booking date |
| `p_start_time` | `time` | Yes | Start time |
| `p_end_time` | `time` | Yes | End time |
| `p_total_price` | `numeric` | Yes | Total price in RD$ |
| `p_notes` | `text` | No | Optional notes |

**Returns:** `jsonb` — The created booking object:
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "club_id": "uuid",
  "field_unit_id": "uuid",
  "field_type": "F7",
  "date": "2026-04-15",
  "start_time": "18:00:00",
  "end_time": "19:00:00",
  "total_price": 6000,
  "status": "confirmed",
  "notes": null,
  "created_at": "2026-04-15T10:00:00Z"
}
```

**Errors:**
| Error message | Cause |
|---------------|-------|
| `BOOKING_CONFLICT: The requested time slot is not available...` | Another booking or block exists on a conflicting unit |
| `end_time must be after start_time` | Invalid time range |
| `Invalid field_type: X` | Not F5/F7/F11 |
| `Field unit not found or inactive: X` | Bad unit ID or deactivated |

**Frontend handling:**
```typescript
const { data, error } = await supabase.rpc('rpc_create_booking', { ... });
if (error?.message?.includes('BOOKING_CONFLICT')) {
  toast.error('Este horario ya no está disponible');
  await reload(); // refresh availability
  return;
}
```

---

## 3. `rpc_get_available_time_slots`

**Purpose:** Get the full day's availability grid for a field + type. Replaces `getAvailableTimeSlots()` from `availability.ts`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `p_field_id` | `uuid` | Yes | Physical field |
| `p_field_type` | `text` | Yes | `'F5'`, `'F7'`, or `'F11'` |
| `p_date` | `date` | Yes | Date to check |

**Returns:** `jsonb` — Array of 30-minute time slots:
```json
[
  { "start": "08:00", "end": "08:30", "available": true, "availableUnits": 6, "totalUnits": 6 },
  { "start": "08:30", "end": "09:00", "available": true, "availableUnits": 6, "totalUnits": 6 },
  { "start": "18:00", "end": "18:30", "available": true, "availableUnits": 4, "totalUnits": 6 },
  ...
]
```

---

## 4. `rpc_get_unit_options`

**Purpose:** Get which specific units are available for a time range. Replaces `getUnitOptions()` from `availability.ts`. Used by `FieldSlotsBoard`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `p_field_id` | `uuid` | Yes | Physical field |
| `p_field_type` | `text` | Yes | `'F5'`, `'F7'`, or `'F11'` |
| `p_date` | `date` | Yes | Date |
| `p_start_time` | `time` | Yes | Start time |
| `p_end_time` | `time` | Yes | End time |

**Returns:** `jsonb` — Array of unit options:
```json
[
  { "id": "uuid-1", "type": "F5", "name": "C1", "slot_ids": ["S1"], "available": true },
  { "id": "uuid-2", "type": "F5", "name": "C2", "slot_ids": ["S2"], "available": false },
  ...
]
```

---

## 5. `rpc_calculate_price`

**Purpose:** Server-side price calculation with validation against pricing rules.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `p_club_id` | `uuid` | Yes | Club |
| `p_field_type` | `text` | Yes | `'F5'`, `'F7'`, or `'F11'` |
| `p_start_time` | `time` | Yes | Start time |
| `p_end_time` | `time` | Yes | End time |

**Returns:** `jsonb`
```json
{
  "price_per_hour": 6000,
  "duration_minutes": 90,
  "total_price": 9000,
  "minimum_minutes": 60,
  "increment_minutes": 30
}
```

**Errors:**
- `No active pricing rule found for club X and type Y`
- `Duration (X min) is below minimum (Y min)`
- `Duration (X min) must be a multiple of Y min`

---

## 6. `rpc_find_available_unit`

**Purpose:** Auto-assign the first available unit of a type. Replaces `findAvailableUnit()` from `availability.ts`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `p_field_id` | `uuid` | Yes | Physical field |
| `p_field_type` | `text` | Yes | `'F5'`, `'F7'`, or `'F11'` |
| `p_date` | `date` | Yes | Date |
| `p_start_time` | `time` | Yes | Start time |
| `p_end_time` | `time` | Yes | End time |

**Returns:** `jsonb` — Single unit object or `null`:
```json
{ "id": "uuid", "type": "F7", "name": "F7_1", "slot_ids": ["S1", "S2"] }
```

---

## Supabase JS Call Pattern

All RPCs follow the same calling pattern:

```typescript
const { data, error } = await supabase.rpc('rpc_name', {
  p_param1: value1,
  p_param2: value2,
});

if (error) {
  // Handle error — check error.message for specific codes
  console.error(error.message);
}

// data contains the return value (boolean, jsonb, etc.)
```

---

## Migration from Current Frontend Pattern

### Before (direct table operations + client-side logic):
```typescript
// AppDataContext.tsx — createBooking()
const { data } = await supabase.from('bookings').insert({ ... }).select('*').single();

// availability.ts — getAvailableTimeSlots()
const slots = getAvailableTimeSlots(date, fieldType, field, bookings, blocks);
```

### After (RPC calls):
```typescript
// Availability check via RPC
const { data: slots } = await supabase.rpc('rpc_get_available_time_slots', {
  p_field_id: fieldId, p_field_type: 'F5', p_date: date,
});

// Transactional booking via RPC
const { data: booking, error } = await supabase.rpc('rpc_create_booking', {
  p_user_id: userId, p_club_id: clubId, p_field_unit_id: unitId,
  p_field_type: 'F7', p_date: date, p_start_time: '18:00',
  p_end_time: '19:00', p_total_price: 6000,
});
```

### Files to modify:
1. `src/contexts/AppDataContext.tsx` — Replace `createBooking()` with `rpc_create_booking` call
2. `src/pages/BookingFlow.tsx` — Use `rpc_get_available_time_slots` and `rpc_get_unit_options`
3. `src/components/TimeSlotPicker.tsx` — Accept server-provided slot data
4. `src/components/FieldSlotsBoard.tsx` — Accept server-provided unit options
5. `src/lib/availability.ts` — Keep as fallback/optimistic cache, but authority is server

# Field Play — Sports Booking Platform

## Product
Field Play is a modular sports field booking platform (soccer/fútbol) for the Dominican Republic market. Club admins configure physical fields that can be subdivided into different playing formats (F11, F7, F5). Clients browse clubs, check availability, and book time slots. UI is in Spanish.

## Architecture
- **Frontend:** React 18 + TypeScript + Vite (SWC)
- **Styling:** Tailwind CSS + shadcn/ui (Radix primitives)
- **State:** React Context (`AuthContext`, `AppDataContext`) — no Redux/Zustand
- **Backend:** Supabase (Postgres + Auth + Edge Functions + RLS)
- **Routing:** React Router v6
- **Forms:** React Hook Form + Zod
- **Email:** Supabase Edge Functions + Resend API

## Key Domain Concepts

### Physical Slot Model
A physical field has 6 "slots" (S1–S6). These slots compose into playing units:
- **F11** (full field): uses all 6 slots (S1–S6)
- **F7** (half field): uses 2 adjacent slots (S1+S2, S3+S4, S5+S6) → 3 possible F7 courts
- **F5** (mini court): uses 1 slot each → 6 possible F5 courts

**Business rule:** 1 F11 = 3 F7 = 6 F5. Each F7 contains exactly 2 F5 (the two stacked slots in its column — e.g., F7_1 = S1 + S4, and contains F5 C1 + C4). Booking any unit locks its physical slots, preventing conflicting bookings.

### Court Configuration Layouts
Fields can be created with one of four layouts:
- `full_11`: Solo F11
- `three_7`: 3x F7 courts
- `six_5`: 6x F5 courts
- `versatile_full`: All combinations (F11 + 3 F7 + 6 F5) — most flexible

### Terminology (Spanish UI)
| Internal       | Manager-facing              | Player-facing               |
|---------------|-----------------------------|-----------------------------|
| Club          | Club / Centro deportivo     | Club                        |
| Field         | Cancha física               | Cancha                      |
| FieldUnit     | Modalidad de juego          | Espacio disponible          |
| Slot (S1–S6)  | Zona física                | (hidden)                    |
| Layout        | Configuración de cancha     | (hidden)                    |
| Block         | Bloqueo / Reserva interna  | No disponible               |

### Admin Court Setup IA
The field configuration flow in AdminDashboard follows this hierarchy:
1. **Club** (venue) — name, location, hours, base pricing
2. **Cancha física** (physical court) — name, surface, layout preset
3. **Modalidades** (playable units) — auto-generated from layout, shown as visual preview
4. **Precios** — per field-type per club, editable inline

The `CourtLayoutPreview` component provides an interactive visual showing how
physical zones map to F11/F7/F5 units, helping non-technical owners understand
the subdivision model.

## Directory Structure
```
src/
├── pages/           # Route pages (AdminDashboard, BookingFlow, Home, etc.)
├── components/      # UI components
│   ├── CourtLayoutPreview.tsx  # Visual field layout with zone highlighting
│   ├── FieldConfigPanel.tsx    # Admin config: units, conflicts, toggles
│   ├── VenueScheduleEditor.tsx # Weekly operating hours editor
│   ├── FieldSlotsBoard.tsx     # Booking-flow slot grid
│   ├── TimeSlotPicker.tsx      # Time slot selector
│   ├── FieldModeSelector.tsx   # F5/F7/F11 type picker
│   └── ui/                     # shadcn/ui primitives
├── contexts/        # AuthContext, AppDataContext (global state + Supabase CRUD)
├── lib/
│   ├── availability.ts   # Availability logic (v1 + v2 with venue config)
│   ├── courtConfig.ts    # Court configuration logic (conflicts, templates, validation)
│   ├── supabase.ts       # Supabase client
│   └── bookingEmail.ts   # Email notifications
├── types/
│   ├── index.ts          # Core domain types
│   └── courtConfig.ts    # Court config types (VenueConfig, CourtTemplate, etc.)
├── data/            # Mock data (mockData.ts)
├── hooks/           # Custom hooks
└── test/            # Vitest + Playwright tests
```

## Database
Schema in `base de datos.sql`. Key tables: `profiles`, `clubs`, `fields`, `field_units`, `bookings`, `blocks`, `block_units`, `pricing_rules`. All have RLS. Bookings use exclusion constraints (btree_gist) to prevent double-booking at the DB level.

### Migration: Conflict Graph + Transactional RPCs
`supabase/migrations/001_conflict_graph_and_booking_rpcs.sql` adds:
- `field_unit_conflicts` table — materialized conflict graph (auto-maintained by trigger)
- `rpc_create_booking` — atomic check+insert with advisory lock (prevents cross-unit double-booking)
- `rpc_check_availability`, `rpc_get_available_time_slots`, `rpc_get_unit_options` — server-side availability
- `rpc_calculate_price`, `rpc_find_available_unit` — server-side helpers

See `docs/BACKEND_ARCHITECTURE.md` and `docs/API_SPEC.md` for full details.

## Conventions
- UI text is in **Spanish** (Dominican locale `es-DO`)
- Currency: **RD$** (Dominican Peso)
- Time format: 24h (e.g., "18:00")
- Field type badges use CSS classes: `field-badge-5`, `field-badge-7`, `field-badge-11`
- Toast notifications via Sonner
- Supabase client in `src/lib/supabase.ts`

## Running
```bash
npm run dev      # Dev server
npm run build    # Production build
npm run test     # Vitest
npm run lint     # ESLint
```

## Environment
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Player-Side Reservation UX — Improvement Roadmap

### Implemented
- CourtLayoutPreview component (reusable) — can be embedded in BookingFlow step 4
  to show the player which physical zones their unit occupies

### Ready to Implement
1. **Show court visual in BookingFlow step 4 (unit selection)**
   - Import CourtLayoutPreview into BookingFlow.tsx
   - Pass `units={field.units}` and `highlightType={selectedFieldType}`
   - This replaces the abstract slot grid with a soccer-field-like visual
   - File: `src/pages/BookingFlow.tsx`, step 4 section

2. **Real-time availability indicators on FieldModeSelector**
   - Show "X de Y disponibles" under each F5/F7/F11 card
   - Requires passing `availableUnits` count from parent
   - File: `src/components/FieldModeSelector.tsx`

3. **Price display on mode selector cards**
   - Show "desde RD$ X/hora" on each card so player sees cost upfront
   - Requires passing `pricingRules` for the selected club
   - File: `src/components/FieldModeSelector.tsx`

4. **Conflict explanation for players**
   - When a unit is unavailable, show tooltip: "Esta cancha comparte espacio con una reserva activa"
   - Uses `getConflictingUnitIds` from `src/lib/courtConfig.ts`
   - File: `src/components/FieldSlotsBoard.tsx`

5. **Mobile-optimized unit picker**
   - Current FieldSlotsBoard uses a 6-col grid; on mobile, use swipeable cards instead
   - File: `src/components/FieldSlotsBoard.tsx`

### Future (Larger Scope)
- Calendar heatmap showing busy/free days before date selection
- "Quick book" flow — skip type selection when only one type is available
- Favorite courts / repeat booking shortcuts

## Migration Path from MVP

### What's Done (Frontend)
1. **Domain types** (`src/types/courtConfig.ts`): `VenueConfig`, `CourtTemplate`, `DaySchedule`, `ConflictPair`, `FieldConfigSummary`
2. **Config logic** (`src/lib/courtConfig.ts`): conflict detection, template validation, dynamic time slot generation, capacity helpers
3. **Availability v2** (`src/lib/availability.ts`): `getAvailableTimeSlotsV2`, `resolveTimeSlots`, `getFieldTypeAvailability` — all backward-compatible
4. **Admin UI**: New "Configuración" section with `VenueScheduleEditor`, `FieldConfigPanel`, `CourtLayoutPreview`
5. **Context**: `venueConfigs` state, `getVenueConfig`, `updateVenueConfig`, `toggleFieldUnit` methods
6. **VenueConfig persistence**: localStorage bridge (until DB table created)

### What Needs Backend/Database Work
1. **`venue_configs` table**: Store `VenueConfig` per club (week_schedule JSONB, slot_duration_minutes INT)
2. **`field_unit_conflicts` materialized table**: Auto-populated from `field_units.slot_ids` overlap
3. **RPC `rpc_create_booking`**: Atomic check+insert with advisory lock for conflict-safe booking
4. **Migrate `getAvailableTimeSlotsV2` calls**: Switch BookingFlow from v1 to v2 once venue configs are in DB
5. **RLS policies** for venue_configs table

### Migration Steps
1. Create `venue_configs` table in Supabase
2. Migrate localStorage data to DB (one-time)
3. Update `AppDataContext.reload()` to fetch venue_configs from Supabase
4. Switch `BookingFlow.tsx` to use `getAvailableTimeSlotsV2` with venue config
5. Remove localStorage bridge code

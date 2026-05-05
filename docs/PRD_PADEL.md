# PRD — Habilitar Pádel en Field Play

> Estado: Borrador · Owner: producto
> Última edición: 2026-05-05

## 1. Contexto y objetivo

Field Play hoy es una plataforma monodeporte (fútbol, modelo F11/F7/F5 con
slots físicos). El objetivo de este PRD es habilitar **pádel** como segundo
deporte sin romper la lógica existente de fútbol y permitiendo que un mismo
club ofrezca **ambos deportes** en simultáneo.

### Decisiones de producto (alineadas con stakeholder)

| Decisión | Valor |
|---|---|
| Multi-deporte por club | **Sí** — un club puede tener canchas de fútbol y pádel a la vez |
| Subdivisión de cancha de pádel | **No** — cada cancha de pádel es una unidad jugable única |
| Visualización en calendario | **Cada cancha de pádel = una columna independiente** |
| Duración de slot | **60 minutos** (igual que fútbol, sin cambios al config global) |
| Tipos de cancha de pádel | **Plano: un solo tipo `PADEL`** (indoor/outdoor son metadata informativa, no afectan booking) |

## 2. Alcance

### Dentro
- Modelo de datos para deporte (`sport`) y tipo de cancha `PADEL`
- Admin: crear/editar canchas de pádel, configurar precios, verlas en calendario
- Jugador: filtrar clubes por deporte, reservar cancha de pádel
- Pricing por cancha de pádel (RD$/hora, igual estructura que fútbol)
- Reportes con desglose por deporte

### Fuera (por ahora)
- Torneos / ligas de pádel
- Match-making / búsqueda de pareja
- Equipamiento (raquetas, bolas) como add-on
- Walls/glass damage tracking
- Reservas recurrentes específicas de pádel (entran al roadmap general)

## 3. Modelo de dominio

### Cambios mínimos al modelo actual

**Concepto clave:** una cancha de pádel = **1 `field`** con **1 `field_unit`** de tipo `PADEL`. El `field_unit` no comparte slots físicos con nadie (su `slot_ids` es vacío), por lo que el grafo de conflictos no genera entradas — cada cancha de pádel es totalmente independiente.

### Tabla `fields`

Agregar columna:
```sql
sport text not null default 'soccer'
  check (sport in ('soccer', 'padel'))
```

### Tabla `field_units`

Expandir el `check` de `type` para aceptar `'PADEL'`:
```sql
check (type in ('F11', 'F7', 'F5', 'PADEL'))
```

### Tabla `bookings`

Expandir el `check` de `field_type`:
```sql
check (field_type in ('F11', 'F7', 'F5', 'PADEL'))
```

### Tabla `pricing_rules`

Igual: aceptar `field_type = 'PADEL'`. El `unique (club_id, field_type)` ya garantiza un precio por deporte/club.

### Layout nuevo en `lib/courtConfig.ts`

```ts
{
  id: 'padel_single',
  name: 'Cancha de pádel',
  description: 'Una cancha individual de pádel (no se subdivide)',
  sport: 'padel',
  units: [
    { type: 'PADEL', name: 'Pádel', slotIds: [], parentIndex: null }
  ]
}
```

Los layouts de fútbol (`full_11`, `three_7`, `six_5`, `versatile_full`) reciben `sport: 'soccer'`. El admin solo ve los layouts del deporte que eligió al crear la cancha.

### Tipos TypeScript

```ts
// types/index.ts
export type Sport = 'soccer' | 'padel';
export type FieldType = 'F11' | 'F7' | 'F5' | 'PADEL';

// Field gana sport
export interface Field {
  // ...existente
  sport: Sport;
}
```

## 4. Cambios de UI/UX

### 4.1 Home (jugador)

**Nuevo:** chips de filtro de deporte arriba del listado de clubes.
- `Todos` (default) · `Fútbol` · `Pádel`
- El filtro se cruza con los filtros existentes (ubicación, tipo F5/F7/F11).
- Si el usuario selecciona `Pádel`, los chips F5/F7/F11 se ocultan (no aplican).

**ClubCard:**
- Mostrar badges con los deportes que ofrece el club (ej. `Fútbol · Pádel`).
- "Próxima disponibilidad" considera todos los deportes del club a menos que haya filtro activo.

### 4.2 BookingFlow (jugador)

Detección al entrar al club:
- **Solo fútbol** → flujo actual sin cambios.
- **Solo pádel** → saltar paso de modalidad (no hay F5/F7/F11). Flujo: fecha → hora → cancha disponible.
- **Ambos** → primer paso del flujo es seleccionar deporte (chips grandes con icono).

`FieldModeSelector` se queda solo para fútbol. Para pádel el flujo va directo al selector de cancha (`FieldSlotsBoard` ya soporta listar unidades como columnas).

`CourtLayoutPreview`: agregar render de pádel como un rectángulo único con red al medio (visual distinto al campo de fútbol). Útil cuando el club tiene múltiples canchas y el jugador quiere ver cuál seleccionó.

### 4.3 Admin — creación de cancha

`FieldConfigPanel` — al crear una nueva cancha física:

1. **Selector de deporte primero** (radio: Fútbol / Pádel).
2. Selector de **layout** filtrado por deporte:
   - Fútbol → `full_11`, `three_7`, `six_5`, `versatile_full`
   - Pádel → `padel_single` (único disponible, pre-seleccionado)
3. Resto del flujo (nombre, superficie, etc.) sin cambios.

Para pádel, los conceptos de "modalidad" y "zonas físicas (S1–S6)" se ocultan completamente en la UI — solo se muestra el preview visual de la cancha individual.

### 4.4 Admin — calendario diario (`AdminDailyCalendar`)

Sin cambios estructurales: cada cancha de pádel ya aparecerá como columna porque cada `field_unit` se renderiza como columna. Solo hay que:

- Agregar tinte / icono distinto al header de columna cuando `field_unit.type === 'PADEL'` (raqueta en lugar de pelota de fútbol).
- Considerar scroll horizontal: si un club tiene 8 canchas de pádel + 2 canchas de fútbol, son 10+ columnas. Necesitamos `overflow-x-auto` con sticky time-axis (probablemente ya está, validar).
- Filtro por deporte arriba del calendario (chips: `Todos` · `Fútbol` · `Pádel`) para reducir columnas.

### 4.5 Admin — pricing

`pricing_rules` ya soporta `field_type` único por club. Agregar fila editable para `PADEL` cuando el club tiene al menos una cancha de ese deporte. Si no hay canchas de pádel, no se muestra la fila.

### 4.6 Admin — creación manual de reserva

`AdminCreateBookingDialog` ya filtra unidades por club. Agregar:
- Filtro de deporte en el primer paso (si club tiene ambos deportes).
- Cuando se selecciona deporte=pádel, ocultar el selector F5/F7/F11.

### 4.7 Reportes

- KPI nuevo: "Reservas por deporte" (donut: fútbol vs pádel).
- Breakdown de ingresos por deporte.
- Filtro de exportación Excel/PDF: opción "Solo fútbol / Solo pádel / Ambos".

## 5. Cambios de backend

### Migración SQL `014_enable_padel.sql`

1. `alter table fields add column sport text not null default 'soccer' check (sport in ('soccer','padel'))`
2. `alter table field_units drop constraint ...; add constraint check type in (F11,F7,F5,PADEL)`
3. `alter table bookings drop constraint ...; add constraint check field_type in (F11,F7,F5,PADEL)`
4. `alter table pricing_rules` — mismo cambio en `field_type`
5. Ningún cambio a `field_unit_conflicts` — el trigger sigue funcionando porque PADEL tiene `slot_ids = []` y no genera pares.

### RPCs

- `rpc_create_booking`, `rpc_check_availability`, `rpc_get_unit_options`, `rpc_calculate_price`: aceptar `'PADEL'` en validaciones de `field_type`.
- `rpc_get_available_time_slots`: ya itera por `field_units`, debería funcionar sin cambios siempre que el RPC acepte el nuevo tipo.

### RLS

Sin cambios. `sport` no afecta visibility.

## 6. Plan por fases

### Fase 1 — Fundación (1–2 días)
- [ ] Migración SQL 014
- [ ] Actualizar tipos TS (`Sport`, `FieldType`)
- [ ] Agregar layout `padel_single` a `courtConfig.ts`
- [ ] Actualizar formatters (`formatFieldType` para `'PADEL'` → "Pádel")
- [ ] Actualizar RPCs en SQL para aceptar 'PADEL'

### Fase 2 — Admin (2–3 días)
- [ ] `FieldConfigPanel` — selector de deporte + filtrado de layouts
- [ ] `CourtLayoutPreview` — render visual de cancha de pádel
- [ ] Pricing — fila para PADEL cuando aplique
- [ ] `AdminDailyCalendar` — icono raqueta y filtro deporte
- [ ] `AdminCreateBookingDialog` — filtro deporte
- [ ] Crear primera cancha de pádel de prueba en un club

### Fase 3 — Jugador (2–3 días)
- [ ] `Home.tsx` — chips de filtro deporte
- [ ] `ClubCard` — badges de deportes ofrecidos
- [ ] `BookingFlow` — branch para pádel (saltar paso modalidad)
- [ ] `FieldSlotsBoard` — soporte visual para múltiples canchas de pádel
- [ ] Test E2E: reservar cancha de pádel completa

### Fase 4 — Reportes y pulido (1–2 días)
- [ ] Reportes: donut por deporte, filtros de exportación
- [ ] Email de confirmación: terminología correcta para pádel ("tu cancha de pádel" en lugar de "tu cancha")
- [ ] Validaciones de pricing: bloquear crear cancha de pádel si no hay precio configurado

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Clubes existentes asumen fútbol | Default `sport='soccer'` en migración, no migración manual necesaria |
| Confusión en UI cuando club tiene ambos | Filtro de deporte siempre visible en home y en calendario admin |
| Conflict graph trigger podría fallar con slot_ids vacío | Validar que el trigger no inserta nada cuando un unit tiene slot_ids vacío (debería ser no-op) |
| Calendario con muchas columnas | Filtro deporte + scroll horizontal con header sticky |
| `FieldType` se vuelve confuso (F11 es fútbol, PADEL no) | Considerar renombrar a futuro `CourtType` o `UnitType`; por ahora documentar y seguir |

## 8. Métricas de éxito

- ≥1 club ofreciendo pádel en producción al lanzar
- ≥10 reservas de pádel completadas en la primera semana
- 0 incidentes de double-booking entre canchas de pádel y fútbol del mismo club
- Tiempo de configuración admin de cancha de pádel ≤ 2 minutos

## 9. Preguntas abiertas

- ¿Necesitamos diferenciar precio peak/off-peak en pádel desde V1, o reusamos pricing único como en fútbol?
- ¿La cancelación con política de 24h aplica igual? (asumimos sí)
- ¿Mostrar "indoor/outdoor" como tag visual en la cancha aunque no afecte booking?
- ¿Email de notificación tiene branding distinto para reservas de pádel?

---

## Apéndice A — Mapeo terminológico

| Término genérico | Fútbol | Pádel |
|---|---|---|
| Cancha física | Cancha | Cancha / Pista |
| Tipo de juego | F5 / F7 / F11 | (no aplica — solo `Pádel`) |
| Modalidad | Sí | No |
| Subdivisión de slot | Sí (S1–S6) | No |
| Jugadores típicos | 10–22 | 4 (dobles) |
| Duración típica | 60 min | 60 min (forzado por config global) |

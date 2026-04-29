# PRD — MVP Field Play (Reservas)

**Versión:** 1.1
**Fecha:** 2026-04-29
**Owner:** Cristian Gómez
**Estado del producto:** Frontend y migraciones MVP completados. Pendiente: aplicar SQL y desplegar Edge Functions (ver `docs/DEPLOYMENT_RUNBOOK.md`).

---

## Decisiones tomadas (sprint MVP)

- **Política de cancelación:** reembolso si se cancela con más de 24h de anticipación; no reembolso con menos de 24h o no-shows.
- **Antelación máxima:** 60 días.
- **Comprobante incorrecto:** el cliente puede re-subirlo mientras la reserva esté `pending`; el admin puede rechazar con motivo en cualquier momento.
- **Destinatario admin:** correo de `clubs.owner_id`.

## Cambios entregados en este sprint

### Base de datos
- `supabase/migrations/004_mvp_completion.sql`:
  - Columnas nuevas en `bookings`: `cancellation_reason`, `cancelled_by`, `cancelled_at`, `rejection_reason`, `rejected_at`, `confirmed_at`, `proof_replaced_at`.
  - Columna `closed_dates` en `venue_configs` + actualización de `get_venue_config_for_date` para honrarlas.
  - RPCs nuevas: `rpc_confirm_booking`, `rpc_reject_booking`, `rpc_cancel_booking`, `rpc_replace_payment_proof`.

### Edge Functions
- `send-admin-booking-alert` — notifica al dueño del club al recibir una reserva pendiente.
- `send-booking-confirmed-email` — confirma al cliente cuando el admin valida el pago.
- `send-booking-cancelled-email` — notifica al cliente en cancelaciones y rechazos.

### Frontend
- `Profile.tsx` — formulario editable (nombre, apellido, teléfono, cédula).
- `MyBookings.tsx` — re-subida de comprobante, ver comprobante, motivos de rechazo/cancelación, modal de cancelación con política de 24h.
- `AdminDashboard.tsx`:
  - Modal de validación con vista previa del comprobante (imagen embebida o iframe PDF).
  - Acciones "Confirmar pago" / "Rechazar comprobante" con motivo obligatorio.
  - Cancelación de reservas confirmadas con motivo opcional.
  - Editor de "Días cerrados puntuales" (feriados).
- `BookingFlow.tsx` — selector de fecha con scroll horizontal a 60 días, deshabilita días cerrados, muestra política de cancelación en el resumen.
- `TimeSlotPicker.tsx` — UX rediseñado (hora de inicio + duración).
- Nuevos componentes: `ClosedDatesEditor.tsx`.

### Código de soporte
- `AppDataContext` ahora expone: `confirmBooking`, `rejectBooking`, `cancelBooking(id, reason?)`, `replacePaymentProof`, `evaluateCancellation`.
- `AuthContext` expone `updateProfile`.
- `bookingEmail.ts` con tres helpers nuevos para invocar las Edge Functions.

---

## 1. Visión

Field Play permite a clubes deportivos en RD subdividir sus canchas físicas en modalidades F11/F7/F5, y a clientes reservar espacios pagando por transferencia bancaria. El MVP debe cerrar el **ciclo completo de reserva**: cliente reserva → sube comprobante → admin valida → cliente recibe confirmación.

## 2. Objetivo del MVP

Que un cliente real pueda reservar una cancha de principio a fin, y que un dueño de club pueda gestionar su negocio sin intervención manual del equipo de Field Play.

**Criterio de aceptación global:** un cliente nuevo puede registrarse, encontrar un club, reservar un horario, pagar por transferencia y recibir confirmación por correo, todo sin que un humano de soporte toque nada.

---

## 3. Estado actual

### Ya funciona
- Auth (cliente / club_admin) con roles
- Gestión de clubes, canchas físicas y modalidades F11/F7/F5
- Motor de disponibilidad con detección de conflictos (F11 bloquea F7/F5 que comparten zona)
- Flujo de reserva del cliente: modalidad → fecha → horario → unidad → comprobante
- Subida de comprobante a Supabase Storage (`booking-proofs`)
- Vista admin de reservas pendientes con badge "no visto"
- Confirmar / cancelar reserva desde el panel admin
- Página "Mis reservas" para el cliente (con cancelación)
- Emails de bienvenida + reserva recibida (Edge Functions)
- RPC transaccional `rpc_create_booking` con advisory lock (anti doble-booking)

### Bloqueadores conocidos
- Bucket `booking-proofs` no creado en producción (error "Bucket not found")
- Migraciones 002 y 003 no aplicadas en el proyecto Supabase activo
- `venue_configs` aún vive en localStorage en algunos flujos

---

## 4. Lo que falta (priorizado)

### P0 — Bloqueantes para el lanzamiento

#### 4.1 Aplicar migraciones a producción
**Por qué:** sin ellas el bucket de comprobantes no existe, no hay RPC de reserva atómica, y no hay configuración de horarios.
**Acciones:**
- Ejecutar `001_conflict_graph_and_booking_rpcs.sql`
- Ejecutar `002_venue_configs_and_schedule_aware_availability.sql`
- Ejecutar `003_bank_transfer_booking_flow.sql`
- Verificar bucket `booking-proofs` con RLS policies activas
- Verificar RPCs disponibles: `rpc_create_booking`, `rpc_check_availability`, `rpc_get_available_time_slots`, `rpc_get_unit_options`, `rpc_calculate_price`

**Aceptación:** un cliente puede subir comprobante sin error de Storage; `createBooking` no cae al fallback de INSERT directo.

#### 4.2 Email al admin cuando llega una reserva nueva
**Por qué:** sin esto, el admin no sabe que tiene que validar un pago. El badge "no visto" solo se ve si abre el dashboard.
**Acciones:**
- Crear Edge Function `send-admin-booking-alert`
- Disparar desde `AppDataContext.createBooking` después del INSERT exitoso
- Email contiene: cliente, fecha, hora, modalidad, monto, link al comprobante (signed URL), botón "Validar en panel"
- Destinatario: `profiles.email` del owner del club (campo `clubs.admin_id` o equivalente)

**Aceptación:** al crear una reserva en cualquier club, el admin recibe el correo en menos de 1 minuto.

#### 4.3 Email al cliente cuando el admin confirma el pago
**Por qué:** hoy el cliente solo ve el cambio de estado si abre la app. Necesita confirmación de que su reserva está garantizada.
**Acciones:**
- Crear Edge Function `send-booking-confirmed-email`
- Disparar desde `updateBookingStatus` cuando pasa de `pending` → `confirmed`
- Email contiene: club, fecha, hora, modalidad, espacio, total, dirección del club, política de cancelación

**Aceptación:** cliente recibe correo en menos de 1 minuto tras la confirmación del admin.

#### 4.4 Email al cliente cuando se cancela una reserva
**Por qué:** misma razón. Si el admin rechaza el pago o cancela, el cliente debe enterarse.
**Acciones:**
- Edge Function `send-booking-cancelled-email` (puede ser variante de la anterior)
- Disparar desde `updateBookingStatus` y `cancelBooking` en transición a `cancelled`
- Incluir motivo (campo opcional `cancellation_reason` a agregar a `bookings`)

**Aceptación:** cliente recibe notificación con motivo cuando su reserva se cancela.

#### 4.5 Migrar `venue_configs` de localStorage a Supabase
**Por qué:** hoy los horarios y duración de slot del club se guardan en el navegador del admin. Si cambia de máquina, se pierden. Y la disponibilidad mostrada al cliente depende de esto.
**Acciones:**
- En `AppDataContext.reload()`, leer de la tabla `venue_configs` (ya existe en migración 002)
- En `updateVenueConfig`, hacer UPSERT a la tabla en lugar de localStorage
- Eliminar el bridge de localStorage
- Migración one-shot: si hay datos en localStorage, subirlos en el primer login del admin

**Aceptación:** un admin puede configurar horarios desde un dispositivo y verlos en otro.

#### 4.6 UI de configuración de horarios y días cerrados
**Por qué:** la lógica `VenueScheduleEditor` existe pero falta:
- Editor visible en AdminDashboard sección "Configuración"
- Marcar días cerrados (feriados puntuales — ej. 25 de diciembre)
- Definir duración de slot (30 / 60 min) por club

**Acciones:**
- Pulir UI del componente `VenueScheduleEditor` y enlazarlo en AdminDashboard
- Agregar `closed_dates: date[]` o usar `week_schedule[day].is_closed = true` por excepción
- Validar que la disponibilidad mostrada al cliente respete días cerrados

**Aceptación:** un admin marca el 25 de diciembre como cerrado, y un cliente que intenta reservar ese día no ve horarios disponibles.

---

### P1 — Importantes pero no bloqueantes

#### 4.7 Edición de perfil del cliente
**Por qué:** hoy `Profile.tsx` es solo lectura. El cliente no puede actualizar teléfono o cédula.
**Acciones:**
- Formulario editable en `Profile.tsx` (nombre, teléfono, cédula)
- Método `updateProfile` en `AppDataContext`
- Email no editable (cambio de email = flujo separado de Auth)

#### 4.8 Política y motivo de cancelación
**Por qué:** hoy se puede cancelar pero no hay reglas claras. Antes de habilitar dinero real necesitamos política.
**Acciones:**
- Definir política (sugerencia: cancelable hasta 24h antes sin penalización)
- Agregar `cancellation_reason` y `cancelled_by` a `bookings`
- Mostrar política en el flujo de reserva antes del pago
- Para pagos por transferencia: si se cancela antes de que el admin confirme, no hay devolución a procesar (el cliente nunca pagó realmente). Si se cancela después de confirmar, el club debe contactar al cliente para reembolso (manual en el MVP).

#### 4.9 Validación visual del comprobante para el admin
**Por qué:** hoy el admin ve un link al PDF/imagen pero confirma "a ciegas".
**Acciones:**
- Modal con vista previa del comprobante (PDF embed / imagen)
- Datos lado a lado: monto que dice el comprobante vs. monto esperado
- Botones grandes: "Confirmar" / "Rechazar con motivo"

#### 4.10 Vista del cliente: detalle de la reserva con comprobante subido
**Por qué:** el cliente debería poder ver el comprobante que subió, por si necesita re-subir.
**Acciones:**
- Botón "Ver comprobante" en `MyBookings.tsx`
- Si está en estado `pending`, permitir "Re-subir comprobante"

#### 4.11 Recordatorio al admin de reservas pendientes
**Por qué:** si el admin no abre la app por horas, los clientes esperan sin saber.
**Acciones:**
- Cron en Supabase (`pg_cron`) o Edge Function que cada 4 horas revisa reservas con `status='pending'` y `admin_seen_at IS NULL` con > 2h de antigüedad
- Envía email recordatorio al admin

---

### P2 — Polish post-lanzamiento

- Visual del campo en BookingFlow paso 4 (CourtLayoutPreview ya existe, falta wirearlo)
- Disponibilidad real-time en `FieldModeSelector` ("X de Y disponibles")
- Precios en `FieldModeSelector` ("desde RD$ X/h")
- Tooltip de conflicto cuando una unidad no está disponible
- Mobile: cambiar grid de unidades a swipeable cards
- Heatmap calendario para ver días libres antes de elegir fecha
- Reseñas / ratings (campo `rating` ya existe en `clubs`)
- Reservas recurrentes
- Lista de espera para horarios ocupados

---

## 5. Fuera del alcance del MVP

Explícitamente NO en este MVP:
- Pagos con tarjeta / Stripe / Mercado Pago (solo transferencia bancaria)
- SMS / WhatsApp (solo email)
- App móvil nativa
- Multi-idioma (solo español)
- Multi-moneda (solo RD$)
- Multi-zona horaria (todo en hora local del club)
- Sistema de membresías o suscripciones
- Torneos / ligas
- Marketplace de árbitros / equipos

---

## 6. Métricas de éxito del MVP

- **Tasa de finalización del flujo de reserva:** ≥ 60% de quienes inician llegan a "Reserva enviada"
- **Tiempo promedio de validación admin:** < 6 horas en horario de oficina
- **Tasa de rechazo de comprobante:** < 10% (proxy de UX clara)
- **Reservas confirmadas / semana:** ≥ 20 con 3 clubes activos en el primer mes
- **Tickets de soporte por reserva:** < 5%

---

## 7. Plan de implementación sugerido

| Sprint | Foco | Salida |
|--------|------|--------|
| 1 (semana) | P0.1, P0.2, P0.3 | Migraciones aplicadas, alertas por correo funcionando |
| 2 (semana) | P0.4, P0.5, P0.6 | Cancelaciones notificadas, configuración persistida en DB |
| 3 (semana) | P1.7, P1.8, P1.9 | Perfil editable, política de cancelación, validación visual |
| 4 (semana) | P1.10, P1.11, polish | Re-subida de comprobante, recordatorios, QA end-to-end |

**Lanzamiento:** fin de sprint 4 con 1-2 clubes piloto.

---

## 8. Riesgos

- **Email deliverability:** Resend a Gmail/Hotmail puede caer en spam. Mitigación: SPF/DKIM/DMARC configurados, dominio propio para envío.
- **Disputa de pago:** cliente sube comprobante falso o equivocado. Mitigación: el admin valida; agregar log de auditoría de transiciones de estado.
- **Doble-booking en condiciones de carrera:** cubierto por `rpc_create_booking` con advisory lock. Validar bajo carga antes de lanzar.
- **Volumen de comprobantes en Storage:** 10MB × N reservas se acumula. Definir política de retención (¿borrar comprobantes 90 días después de confirmar?).

---

## 9. Preguntas abiertas

1. ¿Quién recibe el email de admin? ¿Hay un solo dueño por club o múltiples admins?
2. ¿Cuánto tiempo de antelación máxima se puede reservar? (¿14 días?)
3. ¿Política de cancelación con devolución? Si la respuesta es "no hay devolución porque pagaron por transferencia y el club ya tiene el dinero", debe quedar explícito en el flujo.
4. ¿Cómo se maneja el caso de "el cliente subió el comprobante equivocado"? ¿Re-subida o cancelar y volver a empezar?
5. ¿El admin puede crear bloqueos manuales? (entrenamientos, mantenimiento) — Hay tabla `blocks` pero no UI clara.

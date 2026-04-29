# Runbook de Despliegue MVP

**Última actualización:** 2026-04-29

Pasos para llevar a producción los cambios del cierre del MVP. Ejecuta en este orden — cada bloque depende del anterior.

---

## 1. Aplicar migraciones SQL

Ve al **SQL Editor** de tu proyecto Supabase y ejecuta, en este orden, el contenido completo de cada archivo:

1. `supabase/migrations/001_conflict_graph_and_booking_rpcs.sql`
2. `supabase/migrations/002_venue_configs_and_schedule_aware_availability.sql`
3. `supabase/migrations/003_bank_transfer_booking_flow.sql` *(crea bucket `booking-proofs` — soluciona "Bucket not found")*
4. `supabase/migrations/004_mvp_completion.sql` *(nuevos campos de booking, RPCs de confirmación/rechazo/cancelación, `closed_dates`)*

Verifica al terminar:

```sql
-- Debe devolver 6 RPCs
select proname from pg_proc
where proname in (
  'rpc_create_booking',
  'rpc_check_availability',
  'rpc_get_available_time_slots',
  'rpc_confirm_booking',
  'rpc_reject_booking',
  'rpc_cancel_booking',
  'rpc_replace_payment_proof'
);

-- Debe existir el bucket
select id from storage.buckets where id = 'booking-proofs';

-- Debe tener las columnas nuevas
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'bookings'
  and column_name in ('cancellation_reason', 'rejection_reason', 'confirmed_at', 'proof_replaced_at');

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'venue_configs'
  and column_name = 'closed_dates';
```

---

## 2. Configurar variables de entorno (Edge Functions)

En el dashboard de Supabase → **Project Settings → Edge Functions → Secrets**, asegúrate de tener:

| Secret | Valor |
|--------|-------|
| `RESEND_API_KEY` | API key de Resend para enviar emails |
| `BOOKING_EMAIL_FROM` | Remitente verificado (ej. `Field Play <reservas@tudominio.com>`) |

---

## 3. Desplegar Edge Functions

Desde la raíz del repo, con la CLI de Supabase logueada:

```bash
supabase functions deploy send-welcome-email
supabase functions deploy send-registration-email
supabase functions deploy send-booking-received-email
supabase functions deploy send-admin-booking-alert        # NUEVA
supabase functions deploy send-booking-confirmed-email    # NUEVA
supabase functions deploy send-booking-cancelled-email    # NUEVA
```

Verifica con:

```bash
supabase functions list
```

---

## 4. Pruebas de humo (smoke tests)

Una vez aplicado todo:

### 4.1 Flujo de reserva completa

1. Inicia sesión como cliente nuevo.
2. Reserva una cancha en cualquier club (paso 1 → 4 del flujo).
3. **Verifica**: el cliente recibe el correo "Recibimos tu reserva".
4. **Verifica**: el dueño del club (`clubs.owner_id`) recibe "Reserva pendiente · …".
5. Inicia sesión como ese admin.
6. Abre la reserva → ve la vista previa del comprobante embebida en el modal.
7. Pulsa **Confirmar pago y reserva**.
8. **Verifica**: el cliente recibe "Reserva confirmada".

### 4.2 Flujo de rechazo

1. Crea otra reserva como cliente.
2. Como admin, abre la reserva y pulsa **Rechazar comprobante** → escribe motivo → enviar.
3. **Verifica**: cliente recibe "No validamos tu pago" con el motivo.
4. Como cliente, ve a "Mis reservas" → debe verse el motivo en rojo.

### 4.3 Re-subida de comprobante

1. Como cliente, crea una reserva.
2. En "Mis reservas", pulsa **Re-subir** y elige otro archivo.
3. **Verifica**: el badge "Nueva" reaparece para el admin (porque `admin_seen_at` se resetea).
4. **Verifica**: el modal del admin muestra "El cliente reemplazó el comprobante el …".

### 4.4 Cancelación con política de 24h

1. Crea reserva para mañana (>24h).
2. Cancela desde "Mis reservas" → debe mostrar "calificas para reembolso".
3. Crea otra para hoy (<24h, si tu club sigue abierto).
4. Cancela → debe mostrar "no son reembolsables".
5. **Verifica**: cliente recibe correo de cancelación en ambos casos.

### 4.5 Días cerrados (feriados)

1. Como admin, ve a **Configuración** → club → "Días cerrados puntuales" → añade una fecha próxima.
2. Como cliente, intenta reservar ese día → la fecha aparece deshabilitada en el selector.
3. Si fuerzas el flujo, el RPC retorna `VENUE_CLOSED`.

### 4.6 Edición de perfil

1. Ve a **Mi perfil** → pulsa "Editar".
2. Cambia teléfono y cédula → guardar.
3. **Verifica**: refresca la página, los cambios persisten.

---

## 5. Frontend

```bash
npm run build    # validar
# Despliegue del SPA según tu plataforma (Vercel/Netlify/etc.)
```

No se requieren variables nuevas en el frontend — todo se cablea vía `supabase.rpc(...)` y `supabase.functions.invoke(...)`.

---

## 6. Rollback

Si algo se rompe:

- **Edge Functions**: re-deploy de la versión anterior.
- **Migración 004**: cada bloque es idempotente excepto la sobrescritura de `get_venue_config_for_date`. Si necesitas revertir, vuelve a aplicar el bloque correspondiente de la migración 002.
- **Bucket**: no eliminar — los comprobantes en producción están ahí.

---

## 7. Después del despliegue

- Quitar el fallback de INSERT directo en `AppDataContext.createBooking` y `cancelBooking` una vez confirmes que las RPCs funcionan en producción (próximo sprint).
- Configurar política de retención de comprobantes (ej. borrar a los 90 días post-confirmación) — pendiente de definir.

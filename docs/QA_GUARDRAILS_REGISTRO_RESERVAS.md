# QA / Guardrails de especificación — registro, reservas, pagos y estados

## Alcance revisado
Se revisaron `CLAUDE.md`, `src/contexts/AuthContext.tsx`, `src/contexts/AppDataContext.tsx`, `src/pages/Register.tsx`, `src/pages/BookingFlow.tsx`, `src/pages/AdminDashboard.tsx`, `src/pages/MyBookings.tsx`, `src/lib/bookingEmail.ts`, `supabase/functions/send-booking-received-email/index.ts`, `base de datos.sql` y migraciones de Supabase.

## Resumen ejecutivo
Hoy el sistema sí tiene:
- registro básico de usuario cliente,
- creación de reservas,
- correo al cliente cuando la reserva es recibida,
- gestión administrativa básica de estado,
- cancelación desde "Mis reservas".

Pero **no cubre todavía** los 4 requerimientos pedidos como producto completo. Hay además una inconsistencia crítica: **la UX/correo hablan de validación pendiente, pero la reserva hoy se crea como `confirmed`**.

---

## 1) Correo de registro de profesional

### Estado actual
- El registro (`Register.tsx` + `AuthContext.register`) solo crea cuentas de tipo `client`.
- `AuthContext.tsx` fuerza `role: 'client'` y no existe un rol "professional".
- No hay campos de registro específicos de profesional.
- No existe Edge Function/correo para alta de profesional.
- En `supabase/functions` solo existe `send-booking-received-email`.

### Gap actual
- No hay modelo de datos ni flujo para "profesional".
- No hay trigger ni envío de correo al completar ese registro.
- No hay copy/UI para aprobación, revisión o activación de profesionales.

### Criterios de aceptación
- Debe existir una forma explícita de identificar que el registro es de profesional.
- Al completar el registro profesional, debe dispararse un correo específico de registro profesional.
- El correo debe incluir al menos: nombre, correo y siguiente paso esperado (pendiente de revisión, activación o confirmación).
- El flujo no debe reutilizar el correo de reservas.
- Si el envío del correo falla, el registro no debe quedar en un estado engañoso para el usuario; debe definirse si:
  - el registro sigue exitoso con reintento/log, o
  - se revierte / se marca para reproceso.

### Casos borde
- Correo duplicado.
- Profesional registrado sin teléfono o documento, si esos datos son obligatorios para ese flujo.
- Reintento del registro después de crear la cuenta pero antes de enviar el correo.
- Usuario creado pero no confirmado por email de Auth.

### Validación manual obligatoria
- Registrar un profesional real y verificar que llega el correo correcto.
- Confirmar asunto, remitente, contenido y acentos en español.
- Confirmar comportamiento si Resend/Edge Function falla.

---

## 2) Reserva con instrucciones de pago y carga de comprobante

### Estado actual
- `BookingFlow.tsx` termina con mensaje **"¡Reserva confirmada!"**.
- `AppDataContext.createBooking()` usa `rpc_create_booking` y el RPC inserta la reserva con `status = 'confirmed'`.
- El correo `send-booking-received-email` dice que la reserva fue enviada para validación y que se confirmará en 1 a 24 horas.
- No existen campos de pago/comprobante en UI, tipos TS ni tabla `bookings`.
- No existe tabla `payments`, storage bucket, upload, URL de archivo ni estado de verificación.
- `docs/BACKEND_ARCHITECTURE.md` ya marca Payment integration como **no implementado**.

### Gap actual
- No hay instrucciones de pago en el flujo.
- No hay carga de comprobante.
- No hay persistencia del comprobante.
- No hay revisión administrativa del pago.
- La reserva queda confirmada de inmediato, lo cual contradice el correo y el requerimiento.

### Criterios de aceptación
- Al crear una reserva que requiere pago manual, el estado inicial debe ser consistente con el negocio (normalmente `pending`, no `confirmed`).
- La pantalla posterior a reservar debe mostrar instrucciones de pago claras.
- Debe permitirse cargar comprobante desde el flujo definido.
- El comprobante debe quedar asociado a la reserva correcta.
- Debe existir forma de distinguir entre:
  - reserva creada,
  - comprobante no enviado,
  - comprobante enviado,
  - pago validado,
  - reserva confirmada,
  - reserva cancelada.
- El admin debe poder ver el comprobante y tomar decisión.
- El cliente no debe ver "confirmada" antes de que el negocio la confirme realmente.

### Casos borde
- Usuario crea reserva pero abandona antes de subir comprobante.
- Sube archivo no permitido o demasiado pesado.
- Sube comprobante de otra reserva / archivo duplicado.
- Intenta reemplazar un comprobante ya validado.
- Dos admins revisan el mismo comprobante al mismo tiempo.
- Reserva expira por falta de pago.
- El precio mostrado al cliente no coincide con el persistido.

### Validación manual obligatoria
- Crear reserva y verificar el estado inicial correcto.
- Verificar que la UI muestre instrucciones de pago correctas.
- Subir comprobante válido e inválido.
- Confirmar que el admin puede ver el comprobante asociado a la reserva correcta.
- Confirmar que el usuario recibe el mensaje correcto antes y después de validación.

---

## 3) Notificación al admin por nueva reserva

### Estado actual
- Solo existe notificación por correo al cliente (`send-booking-received-email`).
- No hay correo, webhook, tabla ni campana de notificaciones para admin.
- El panel admin lista reservas, pero no hay evidencia de aviso activo cuando entra una nueva.

### Gap actual
- No existe mecanismo de notificación al admin al crear una reserva nueva.
- Tampoco existe diferenciación entre "reserva nueva pendiente" y reservas ya atendidas.

### Criterios de aceptación
- Al crearse una nueva reserva, al menos un administrador debe recibir notificación.
- Debe definirse el canal: correo, WhatsApp, notificación interna o combinación.
- La notificación debe incluir identificadores mínimos: cliente, club, fecha, hora, modalidad y estado.
- Debe evitar duplicados por reintentos técnicos.
- Debe quedar claro si la notificación se dispara al crear la reserva o al subir el comprobante.

### Casos borde
- Múltiples admins para un mismo club.
- Reintento del mismo envío por timeout.
- Reserva creada y cancelada inmediatamente.
- Reserva pendiente sin comprobante todavía.
- Club sin correo/admin configurado.

### Validación manual obligatoria
- Crear una reserva nueva y confirmar que el admin recibe aviso.
- Verificar que no se envían duplicados en refresh/reintentos.
- Verificar destinatarios correctos cuando hay más de un admin.

---

## 4) Regla: una reserva confirmada no puede volver a cambiarse desde controles rápidos; solo puede cancelarse desde detalle

### Estado actual
- En `AdminDashboard.tsx`, tanto en móvil como en desktop, **todas** las reservas muestran botones rápidos `Confirmar` y `Cancelar`.
- `updateBookingStatus()` en `AppDataContext.tsx` hace un update directo sin validar transición ni estado previo.
- El modal `Detalle de reserva` es solo informativo; no contiene acción exclusiva de cancelación.
- La política RLS de `bookings` permite update por dueño o admin sin restringir transición de estado.
- En `MyBookings.tsx`, el cliente puede cancelar reservas `confirmed` desde su listado.

### Gap actual
- No existe bloqueo de transición para reservas ya confirmadas.
- No existe distinción entre acciones rápidas permitidas y acciones solo desde detalle.
- No existe guardrail backend para impedir cambios inválidos si alguien llama la API directamente.

### Criterios de aceptación
- Los controles rápidos solo deben permitir las transiciones autorizadas por negocio.
- Si una reserva ya está `confirmed`, no debe poder volver a `confirmed` ni moverse a otro estado desde controles rápidos.
- Si la regla de negocio es que una confirmada solo puede cancelarse desde detalle, entonces:
  - el botón rápido `Cancelar` no debe aparecer para reservas `confirmed`,
  - la acción de cancelación debe existir dentro del detalle,
  - el backend debe rechazar intentos de cancelación por la ruta rápida si no corresponde.
- Debe validarse la transición también en backend/RPC/política, no solo en UI.
- Debe definirse explícitamente si el cliente final aún puede cancelar por su cuenta desde `Mis reservas`; hoy sí puede.

### Casos borde
- Doble clic o doble submit en confirmar/cancelar.
- Dos admins intentando cambiar el mismo estado al mismo tiempo.
- Reserva ya cancelada que recibe otro update.
- Cliente intentando actualizar su propia reserva vía API aprovechando la policy abierta.
- Reserva confirmada con pago validado que luego intenta modificarse.

### Validación manual obligatoria
- Verificar que una `pending` pueda confirmarse por control rápido si así se decide.
- Verificar que una `confirmed` no muestre acciones rápidas inválidas.
- Verificar que una `confirmed` solo pueda cancelarse desde detalle.
- Intentar forzar el cambio por API y confirmar que backend lo rechaza.

---

## Riesgos / inconsistencias ya detectadas
- **Inconsistencia funcional crítica:** reserva creada como `confirmed`, pero email dice "enviada para validación".
- **Riesgo de integridad:** `bookings_user_update_own_or_admin` permite updates amplios sobre reservas propias o admin; hoy no hay guardas de transición a nivel backend.
- **Cobertura funcional faltante:** no hay estructura para pagos, comprobantes ni notificaciones al admin.
- **Modelo incompleto para profesionales:** solo existen roles `client` y `club_admin`.

## Recomendación QA
Antes de implementar UI nueva, conviene cerrar primero estas definiciones de negocio:
1. estado inicial real de una reserva con pago manual,
2. modelo exacto de "profesional",
3. canal y destinatarios de notificación admin,
4. matriz de transiciones permitidas (`pending -> confirmed`, `confirmed -> cancelled`, etc.),
5. si el cliente puede o no cancelar una reserva confirmada.

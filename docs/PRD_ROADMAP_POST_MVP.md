# PRD — Roadmap Post-MVP

**Fecha:** 2026-05-01
**Owner:** Cristian
**Estado:** Vivo — se actualiza tras cada item completado

---

## Cómo usar este documento

Cada item es **autocontenido**: se puede trabajar de forma independiente sin que el orden de implementación rompa nada. Tomamos uno a la vez, lo cerramos, y volvemos al doc.

**Estructura por item:**
- **Por qué** — problema o motivación
- **Alcance** — qué se construye
- **Criterios de aceptación** — cómo sabemos que está listo
- **Esfuerzo** — estimado en sesiones (1 sesión ≈ 1-2 horas)
- **Dependencias** — qué debe estar antes
- **Decisiones abiertas** — preguntas que requieren input del owner

Convenciones de prioridad:
- 🔴 **Producción baseline** — no debería ir live sin esto
- 🟡 **Alto impacto operativo** — mejora retención, ventas o eficiencia
- 🟢 **Polish y conveniencia** — pulen el producto, no son críticos
- ⚪ **Futuro / grande** — escalabilidad, mercados nuevos

---

# FASE 1 — 🔴 Producción Baseline

## 1.1 Real-time updates con Supabase Realtime

**Por qué.** Hoy cada acción dispara `reload()` que recarga 9 tablas. Si el staff confirma una reserva en otra pestaña, el admin no ve el cambio hasta que refresca manualmente. Con Realtime se actualiza al instante en todas las sesiones abiertas.

**Alcance.**
- Suscribirse a `bookings`, `blocks`, `block_units`, `field_units`, `clubs`, `pricing_rules`, `venue_configs`, `club_images` desde `AppDataContext`.
- En cada `INSERT` / `UPDATE` / `DELETE`, actualizar el state localmente sin recargar todo (parche quirúrgico al array correspondiente).
- Mantener `reload()` como fallback explícito (uso en pull-to-refresh, etc.).

**Criterios de aceptación.**
- Abrir el admin en dos pestañas. Confirmar reserva en una → la otra refleja el cambio en <2s.
- Crear bloqueo en una → aparece en la otra.
- El badge "Pendientes nuevas" del sidebar baja en tiempo real cuando se valida.

**Esfuerzo.** 1 sesión.

**Dependencias.** Ninguna. Supabase Realtime ya está disponible.

**Decisiones abiertas.**
- ¿Suscribirse globalmente o solo cuando el usuario está activo (visibilitychange)? Recomiendo siempre activo, gasto despreciable.
- ¿Toast cuando llega una reserva nueva? "Nueva reserva pendiente" + sonido opcional.

---

## 1.2 Monitoreo de errores con Sentry

**Por qué.** Sin observabilidad en producción, si algo falla nos enteramos cuando un cliente reclama. Sentry tiene tier gratis con 5k errores/mes (más que suficiente para arrancar).

**Alcance.**
- Crear cuenta Sentry → proyecto React + Vite.
- Instalar `@sentry/react`, configurar DSN vía `VITE_SENTRY_DSN`.
- Capturar errores no manejados + capturar manualmente en bloques `try/catch` críticos (`createBooking`, `uploadClubImage`, etc.).
- Excluir errores de desarrollo (configurar `enabled: import.meta.env.PROD`).

**Criterios de aceptación.**
- Generar un error de prueba en producción → llega a Sentry con stack trace + URL + user ID.
- Errores típicos (400 de Supabase, fallo de Resend, etc.) aparecen agrupados por mensaje.

**Esfuerzo.** 0.5 sesión.

**Dependencias.** Cuenta Sentry creada.

**Decisiones abiertas.**
- ¿Usar también `Sentry.replayIntegration()` (graba sesiones cuando hay error)? Útil para debug pero consume quota más rápido. Recomiendo activar solo cuando hace falta debugging.

---

## 1.3 Audit de `/profile`

**Por qué.** No se sabe si la página de perfil del cliente funciona al 100% — algunos campos podrían no editarse, password change podría no estar.

**Alcance.**
- Revisar `Profile.tsx` y verificar que permite:
  - Editar nombre, apellido, teléfono, cédula
  - Cambiar correo electrónico (con re-verificación)
  - Cambiar contraseña (formulario propio o link al flow de recovery)
  - Ver email actual
  - Eliminar cuenta (soft delete) — opcional
- Para staff/admin: además mostrar su rol/club, posibilidad de logout
- Sin errores TypeScript ni de UX

**Criterios de aceptación.**
- Cliente edita nombre → se persiste en `profiles.first_name`
- Cliente cambia password → re-login funciona con la nueva
- Email no editable (Supabase requiere flow especial) o editable con re-verificación

**Esfuerzo.** 0.5 sesión (más si el cambio de email queda en alcance).

**Dependencias.** Ninguna.

**Decisiones abiertas.**
- ¿Permitir cambio de email? Es flow complicado (re-verificación). Probablemente **no** en este sprint.
- ¿Permitir borrar cuenta? Implica cancelar reservas activas + tombstone. **No** en este sprint.

---

# FASE 2 — 🟡 Alto Impacto Operativo

## 2.1 Recordatorios automáticos por email

**Por qué.** Reducir no-shows. Un email 24h antes baja la tasa de incomparecencia significativamente.

**Alcance.**
- Edge Function `send-booking-reminders` que:
  - Selecciona `bookings` con `status='confirmed'` y `date = today + 1 day`
  - Filtra los que aún no tienen `reminder_sent_at`
  - Envía email vía Resend con detalles de la reserva
  - Marca `reminder_sent_at = now()` para no duplicar
- Cron de Supabase (`pg_cron` o Edge Function programada via Supabase Cron) que dispara la función diariamente a las 10:00 AM.
- Migración 013: agregar `bookings.reminder_sent_at timestamptz null`.
- Template de email con branding RealPlay (similar al de verificación).

**Criterios de aceptación.**
- Reserva creada para mañana → al día siguiente a las 10am llega el email
- El mismo recordatorio NO se envía dos veces aunque el cron corra varias veces

**Esfuerzo.** 1 sesión.

**Dependencias.** Resend ya configurado. Hay que activar `pg_cron` o Supabase Cron en el dashboard.

**Decisiones abiertas.**
- ¿Solo email o también WhatsApp? Empezar con email (lo simple). WhatsApp en item 4.x.
- ¿También recordatorio 1h antes? Recomiendo **no** por ahora — agrega ruido y sube costos de Resend.

---

## 2.2 Walk-in rápido (cliente sin registro)

**Por qué.** El admin recibe walk-ins con frecuencia. Hoy `AdminCreateBookingDialog` solo permite clientes ya registrados → admin tiene que pedirle al walk-in que se registre primero, o pierde la venta.

**Alcance.**
- Edge Function `quick-create-client` que recibe `{ email, first_name, last_name, phone }`, verifica caller es admin/staff, llama `auth.admin.createUser` con password aleatoria, marca `email_confirmed_at`, y devuelve el `user_id`.
- En `AdminCreateBookingDialog`, agregar tab "Nuevo cliente" o botón "+ Crear cliente sobre la marcha" en el selector de clientes.
- Form simple: email + nombre + apellido + teléfono → submit → cliente creado → reserva continúa con ese `user_id`.
- El cliente recibe email con su contraseña inicial (similar al staff invite).

**Criterios de aceptación.**
- Admin crea reserva para email nuevo → cliente queda registrado y puede loguearse después con la password generada
- Si el email ya existe, devuelve error claro o usa el cliente existente (decidir UX)

**Esfuerzo.** 1 sesión.

**Dependencias.** Edge Function `invite-staff` como referencia. Ninguna otra.

**Decisiones abiertas.**
- ¿Generar password automática y mostrársela al admin (como hicimos con staff)? Recomiendo sí.
- ¿Auto-confirmar email del cliente o que confirme después? Auto-confirmar para que pueda loguearse de una.

---

## 2.3 Reservas recurrentes

**Por qué.** Equipos amateur reservan "todos los lunes 8pm-10pm por 3 meses". Hoy tienen que crear cada reserva una por una. Con recurrencia se crean en una sola operación.

**Alcance.**
- Migración 014: agregar `bookings.booking_batch_id uuid null` (índice).
- En el booking flow del cliente:
  - Toggle "¿Es una reserva recurrente?"
  - Si sí: selector de día(s) de la semana + fecha fin + frecuencia (semanal default)
  - Vista previa: "Se crearán 12 reservas (Lun 5 may, Lun 12 may, ...)"
  - El sistema valida disponibilidad de TODAS antes de crear cualquiera
  - Si alguna no está disponible, ofrece skip + crear las demás, o cancelar
- Igual flow disponible en `AdminCreateBookingDialog`
- En `MyBookings` y admin, mostrar badge "Recurrente · 1 de 12" para identificar
- Cancelar una recurrente: opción "solo esta" / "esta y futuras" / "todas"

**Criterios de aceptación.**
- Cliente crea reserva recurrente lunes 8pm × 12 semanas → se crean 12 filas con el mismo `booking_batch_id`
- En la lista, aparecen las 12 con un indicador de grupo
- Cancelar el grupo entero borra todas las del batch

**Esfuerzo.** 2 sesiones (1 backend + UI de creación, 1 UI de manejo del grupo).

**Dependencias.** El concepto ya está probado con `block_batch_id` en migración 008.

**Decisiones abiertas.**
- ¿Pago único de todas o por reserva? Recomiendo por reserva — más justo si una se cancela.
- ¿Permitir saltar fechas específicas en el rango? "lunes excepto 15 may". Más complejo. **No** en MVP.

---

## 2.4 Política de cancelación visible al cliente

**Por qué.** Hoy la lógica de "24h = reembolso" existe en backend pero el cliente no la ve clara. Genera disputas.

**Alcance.**
- En `MyBookings`, cada reserva muestra:
  - Si faltan ≥24h: "✓ Cancelación gratuita hasta DD/MM HH:MM"
  - Si faltan <24h: "⚠ Cancelar ahora no califica para reembolso"
  - Si está cancelada: el motivo + si fue con/sin reembolso
- Confirmación de cancelación: dialog que muestra `evaluateCancellation` results — "Vas a cancelar. Esto SÍ/NO califica para reembolso. ¿Continuar?"
- Email post-cancelación: incluye estatus de reembolso ("Tu reembolso de RD$ X será procesado en N días" o "Esta cancelación no aplica para reembolso por la política de 24h").

**Criterios de aceptación.**
- Cliente ve countdown claro antes de cancelar
- El email post-cancelación deja claro si recibirá reembolso o no
- Admin puede ver en el detalle de booking cancelado: motivo + si tuvo reembolso aplicable

**Esfuerzo.** 0.5 sesión.

**Dependencias.** Función `evaluateCancellation` existe.

**Decisiones abiertas.**
- ¿El reembolso es manual (admin lo procesa) o automático? Para tarjeta sería automático (necesitamos pasarela), para efectivo/transferencia es manual. Por ahora manual = solo el aviso.

---

# FASE 3 — 🟢 Polish y Conveniencia

## 3.1 Notas internas visibles en detalle de booking

**Por qué.** Las notas se editan en `EditBookingDialog` pero no se muestran cuando admin abre el detalle. Pierde valor.

**Alcance.**
- En el detalle del booking del admin, mostrar `booking.notes` en una sección "Notas internas" (si tiene contenido).
- Estilo: caja amarilla suave para que destaque.
- Editable inline o reabrir el EditBookingDialog.

**Criterios de aceptación.**
- Admin agrega nota en EditBookingDialog → se guarda → al reabrir el detalle, la nota aparece.

**Esfuerzo.** 0.25 sesión.

**Dependencias.** Ninguna.

---

## 3.2 Sugerencia de slots alternativos

**Por qué.** Cliente intenta reservar a una hora ocupada → recibe error sin opción. Mejor sugerirle alternativas cercanas.

**Alcance.**
- En el booking flow, si la unidad/hora seleccionada está ocupada al intentar continuar:
  - Buscar slots libres ±30min, ±60min, mismas horas en cancha contigua
  - Mostrar 3 sugerencias con un click para auto-seleccionar
- Mensaje: "Esa hora está ocupada. ¿Te sirve alguna de estas?"

**Criterios de aceptación.**
- Slot ocupado → cliente ve sugerencias con disponibilidad real
- Click en una sugerencia → cambia date/time/unit en un solo paso

**Esfuerzo.** 0.5 sesión.

**Dependencias.** Lógica `getUnitOptions` ya existe.

---

## 3.3 Bundle splitting del admin

**Por qué.** El bundle JS pesa 1.27MB. Los clientes regulares (que ni entran al admin) descargan código que nunca usan. Lazy-loading mejora el primer load.

**Alcance.**
- `React.lazy()` para `AdminDashboard` en `App.tsx` con `<Suspense fallback={<LoadingScreen />}>`.
- Adicional: lazy-load secciones internas pesadas (Reports con recharts, Calendar con tabs).
- Verificar bundle: el chunk principal debe bajar a ~600-700KB y el admin chunk a ~500KB.

**Criterios de aceptación.**
- `npm run build` muestra dos chunks claramente separados
- Cliente regular en Home solo descarga el chunk principal (medible en Network tab)

**Esfuerzo.** 0.5 sesión.

**Dependencias.** Ninguna.

---

## 3.4 Búsqueda global

**Por qué.** Admin con 100+ reservas necesita filtrar/buscar rápido. Hoy hay que scrollear.

**Alcance.**
- Barra de búsqueda en el header del admin (debajo del título de sección).
- Busca en: nombre/email del cliente, ID de reserva, nombre del club/cancha.
- Resultados como dropdown con click → navega al detalle correspondiente.
- Solo busca dentro de la sección actual (Reservas / Clubes / Equipo / etc.) o globalmente.

**Criterios de aceptación.**
- Admin escribe "carlos" → ve todos los clientes/reservas que mencionan "carlos"
- Click en resultado → abre el detalle

**Esfuerzo.** 1 sesión.

**Dependencias.** Ninguna.

**Decisiones abiertas.**
- ¿Búsqueda contextual (por sección) o global? Recomiendo global con tabs.

---

## 3.5 Onboarding del admin nuevo

**Por qué.** Admin recién registrado entra a un panel vacío sin saber por dónde empezar. Tasa de abandono alta.

**Alcance.**
- Banner en `/admin/overview` que detecta estado vacío:
  - Sin clubes → "Crea tu primer club" (botón directo)
  - Con club sin canchas → "Configura las canchas"
  - Con canchas sin precios → "Define precios por modalidad"
  - Sin fotos → "Sube fotos para que se vea profesional"
  - Sin venue config → "Configura horarios"
- Cada paso tiene CTA + link directo. Una vez completado, el banner pasa al siguiente.
- Cuando todos están listos, banner desaparece y aparece uno breve de "¡Listo para recibir reservas!".

**Criterios de aceptación.**
- Admin nuevo crea cuenta → ve checklist guiado, no panel vacío
- Cada paso tiene un CTA que abre la sección/dialog correcto

**Esfuerzo.** 1 sesión.

**Dependencias.** Ninguna.

---

# FASE 4 — ⚪ Futuro / Grande

## 4.1 WhatsApp para confirmaciones y recordatorios

**Por qué.** En RD se usa más WhatsApp que email. Mucho mejor open rate.

**Alcance.**
- Integrar Twilio o WATI o Builderbot.
- Enviar confirmación de reserva, recordatorio 24h, validación de pago, cancelación.
- Usuarios deben tener teléfono válido (ya lo tienen).
- Opt-in en perfil: "Quiero recibir recordatorios por WhatsApp".

**Esfuerzo.** 2-3 sesiones (más por integración del proveedor).

**Dependencias.** Cuenta de proveedor + número aprobado por WhatsApp Business.

---

## 4.2 Reviews / ratings post-reserva

**Por qué.** Hoy el rating del club es hardcoded a 5. Sin sistema real, no tiene credibilidad.

**Alcance.**
- Tabla `reviews (id, booking_id, user_id, club_id, rating int, comment, created_at)`.
- Email post-reserva pidiendo review.
- Vista pública del club con promedio + lista de reviews.
- Admin puede responder.

**Esfuerzo.** 2 sesiones.

---

## 4.3 Pagos online (tarjeta)

**Por qué.** Reduce fricción, habilita reservas 24/7 sin tener que ir a la oficina.

**Alcance.**
- Integrar Azul (RD) o CardNet (RD) o Stripe.
- Token de pago por reserva.
- Refunds automáticos en cancelaciones que califiquen.

**Esfuerzo.** 3-5 sesiones (depende del proveedor).

**Decisiones abiertas.**
- ¿Cuál proveedor? Azul es más común en RD. Stripe es más fácil de integrar pero requiere cuenta business RD.

---

## 4.4 Internacionalización (i18n)

**Por qué.** Solo si planeas expandir fuera de RD.

**Alcance.**
- `i18next` + `react-i18next`.
- Extracción de strings hardcoded a archivos `.json` por idioma.
- Selector de idioma en perfil.
- Locale switcher para fechas y monedas.

**Esfuerzo.** 2 sesiones para setup + extracción inicial. Crece según strings.

---

## 4.5 PWA / Push notifications

**Por qué.** Convertir la web en app instalable + push notifications para nuevas reservas / recordatorios.

**Alcance.**
- Manifest + service worker con Vite PWA plugin.
- Web Push API para notificaciones (con permiso del usuario).
- Backend que envía push (`web-push` library en Edge Function).

**Esfuerzo.** 2 sesiones.

---

# Fuera de alcance del PRD

Cosas que mencionamos pero no incluyo aquí porque ya están hechas o no son prioridad:

- ✅ Tests del motor de conflictos (hechos por el owner)
- ✅ "Olvidé mi contraseña"
- ✅ Métodos de pago en oficina (cash + card)
- ✅ Selección de cancha específica por cliente
- ✅ Edición de reserva por admin
- ✅ Calendario diario por unidad
- ⏸ Filtros guardados en reportes — útil pero no lo necesitas todavía
- ⏸ Empty states más amigables — incremental, ataco según lo encuentre

---

# Plan sugerido de ejecución

| Sprint | Items | Sesiones |
|---|---|---|
| **1 (production-ready)** | 1.1 Realtime · 1.2 Sentry · 1.3 Audit profile | 2 |
| **2 (operativo crítico)** | 2.1 Recordatorios · 2.2 Walk-in rápido | 2 |
| **3 (clientes habituales)** | 2.3 Recurrentes · 2.4 Cancelación visible | 2.5 |
| **4 (polish)** | 3.1 Notas · 3.2 Sugerencias · 3.3 Bundle · 3.4 Búsqueda · 3.5 Onboarding | 3 |
| **5+ (futuro)** | 4.1 WhatsApp · 4.2 Reviews · 4.3 Pagos online · 4.5 PWA | 7-10 |

**Total estimado** hasta producción "completa" sin Fase 4: **~9-10 sesiones**.

---

# Cómo iterar este documento

- Al cerrar un item, lo marco con ✅ y muevo a "Fuera de alcance" con la fecha.
- Si surge algo nuevo durante la implementación, lo agrego a la fase apropiada con su scope mínimo.
- Si una decisión abierta se resuelve, la convierto en parte del scope.

**Próximo paso.** ¿Empezamos por el Sprint 1? Decimos cuál de los 3 (Realtime, Sentry, Profile) abrir primero.

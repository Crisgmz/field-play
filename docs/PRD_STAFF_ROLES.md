# PRD — Roles de empleados (staff) y gestión de equipo

**Fecha:** 2026-04-30
**Owner:** Cristian
**Estado:** Propuesto — pendiente de aprobación

---

## 1. Problema

Hoy el sistema solo distingue `client` y `club_admin`. Un dueño de club no puede delegar tareas operativas (validar pagos, crear bloqueos, gestionar reservas) a empleados sin compartir su credencial — lo que es inseguro y no escala.

## 2. Objetivo

Permitir que un `club_admin` invite empleados con permisos limitados al club que administra. Las cuentas de empleado **nunca** se crean por el formulario público de registro: solo desde el panel admin.

## 3. Modelo propuesto

### 3.1 Roles
| Role          | Descripción                                          | Quién lo puede crear              |
|---------------|------------------------------------------------------|-----------------------------------|
| `client`      | Reserva canchas (existente)                          | Auto-registro                     |
| `staff`       | **NUEVO** — Empleado de un club específico           | `club_admin` desde panel          |
| `club_admin`  | Dueño/operador principal del club (existente)        | Auto-registro (existente) o invitación de super_admin |
| `super_admin` | (opcional) Operador de la plataforma                 | Manual desde DB                   |

**Recomendación:** empezar solo con `staff`. `super_admin` se puede agregar después si lo necesitas.

### 3.2 Permisos de `staff` (alcance mínimo profesional)
| Acción                                | client | staff | club_admin |
|---------------------------------------|:------:|:-----:|:----------:|
| Ver reservas del club                 |   —    |  ✅   |     ✅     |
| Confirmar / rechazar reservas         |   —    |  ✅   |     ✅     |
| Ver comprobantes de pago              |   —    |  ✅   |     ✅     |
| Crear / eliminar bloqueos             |   —    |  ✅   |     ✅     |
| Marcar reservas como vistas           |   —    |  ✅   |     ✅     |
| Editar precios                        |   —    |  ❌   |     ✅     |
| Crear / editar clubes y canchas       |   —    |  ❌   |     ✅     |
| Editar venue config / días cerrados   |   —    |  ❌   |     ✅     |
| Subir/borrar fotos del club           |   —    |  ❌   |     ✅     |
| Invitar / dar de baja empleados       |   —    |  ❌   |     ✅     |
| Cambiar info del club (teléfono, etc) |   —    |  ❌   |     ✅     |

### 3.3 Asociación staff ↔ club

**Decisión:** un staff pertenece a **un solo club** (campo `staff_club_id` en `profiles`). Si en el futuro un empleado trabaja en varios clubes, migramos a tabla pivot `staff_assignments` — pero por ahora simplifica todo.

## 4. Cambios técnicos

### 4.1 DB (migración 006)
- Extender `profiles.role` check constraint para aceptar `staff` (y opcionalmente `super_admin`).
- Agregar `profiles.staff_club_id uuid references clubs(id)` — null para `client` y `club_admin`.
- Agregar `profiles.is_active boolean default true` — para desactivar empleados sin borrar el registro (preserva integridad de `bookings.cancelled_by` etc).
- Helper SQL: `is_staff_of_club(club_id)` → para usar en RLS.
- Actualizar `is_club_admin()` para que también devuelva true para `super_admin` (si se incluye).
- RLS: bookings, blocks, block_units, venue_configs, club_images, fields, field_units, pricing_rules — permitir `staff` solo cuando `staff_club_id = club_id` (read + las operaciones permitidas en §3.2).

### 4.2 Edge Function `invite-staff`
- Input: `{ email, first_name, last_name, role: 'staff', club_id }`
- Verifica que el caller sea `club_admin` del `club_id` (vía JWT).
- Llama `supabase.auth.admin.inviteUserByEmail(email, { data: { role: 'staff', staff_club_id, first_name, last_name } })`.
- Trigger existente `handle_new_user` lee `raw_user_meta_data` → crea profile con role correcto.

**Por qué Edge Function y no cliente directo:** crear usuarios requiere `service_role`, que NO se expone al frontend.

### 4.3 Frontend
- Nueva sección admin **"Equipo"** (`/admin/team`):
  - Lista de empleados del club: nombre, email, status (activo/invitado/inactivo), última actividad.
  - Botón "Invitar empleado" → modal con email + nombre.
  - Acciones por fila: desactivar/reactivar, eliminar.
- `AppLayout` agrega entrada "Equipo" en la nav del admin.
- `useAuth` expone helpers: `isStaff`, `isAdminLevel` (= staff || club_admin || super_admin), `canManagePricing`, `canManageClubInfo`.
- Las rutas `/admin/pricing`, `/admin/clubs`, `/admin/fields`, `/admin/config` quedan **bloqueadas para staff** (redirigen a `/admin/overview` con toast "No tienes permisos para esta sección").
- Contextualizar las consultas: cuando el user es `staff`, filtrar `bookings`, `blocks`, etc. al `staff_club_id`.

### 4.4 Texto / i18n
- Botón en panel: "Equipo" / "Invitar empleado" / "Empleado activo" / "Pendiente de aceptar invitación".
- Al iniciar sesión un staff: mismo dashboard que admin pero con secciones bloqueadas grises o ausentes.

## 5. Decisiones que necesito que confirmes

1. **¿Solo `staff` o también `super_admin`?**
   - Recomendado: solo `staff`. Si en el futuro vas a operar varios clubes propios, agregamos `super_admin`.

2. **¿Permisos de staff de §3.2 están bien?**
   - O quieres que sea más restrictivo (ej: solo validar pagos, sin tocar bloqueos) — entonces creamos también `cashier`.

3. **¿Cómo se crea el staff?**
   - **(a)** Invite por email: el empleado recibe un link, setea su password, primer login lo lleva al panel. ✓ Recomendado — es lo profesional.
   - **(b)** Admin crea email + password directamente y se los entrega manualmente.

4. **¿Un staff = un solo club?** ✓ Recomendado para MVP. (En el futuro tabla pivot.)

5. **¿Existe la posibilidad de que un mismo email ya tenga cuenta como `client` y ahora lo quieras hacer `staff`?**
   - **(a)** Si ya existe → upgradear su perfil al rol staff y mantener el email/password.
   - **(b)** Bloquear la invitación y exigir que use otro email.
   - Recomendado: **(a)**. Más natural.

## 6. Fuera de alcance

- Permisos granulares por reserva.
- Auditoría de acciones (quién confirmó qué).
- Notificaciones cuando staff confirma una reserva.
- Roles personalizados configurables por admin.
- Invitaciones masivas / CSV.

## 7. Plan de implementación (si apruebas)

1. **Migración 006** — schema + RLS (lo más delicado, lo entrego primero para que lo apliques tú).
2. **Edge Function `invite-staff`** — código listo para deploy.
3. **Frontend** — sección "Equipo" + nav + permission helpers + bloqueo de rutas.
4. **QA manual** — invitar staff de prueba, verificar permisos.

**Tiempo estimado:** 1 sesión de trabajo si las RLS quedan al primer intento. Cambios en DB son aplicar migración + verificar. Cambios de UI son contenidos.

## 8. Riesgos

- **RLS mal diseñadas** → staff puede ver reservas de otro club. Mitigación: tests manuales con cuenta de prueba en otro club antes de soltar.
- **Edge Function expuesta sin auth check** → cualquiera podría crear usuarios. Mitigación: verificar JWT del caller y rol antes de admin.createUser.
- **Trigger `handle_new_user`** ya lee `raw_user_meta_data ->> 'role'` — si pasamos role='staff' debería funcionar, pero hay que verificar que también lea `staff_club_id`. Si no, ajustamos el trigger en la migración.

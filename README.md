# RealPlay MVP

MVP de reservas deportivas con:
- autenticación local mock para demo
- registro con nombre, apellido, teléfono y cédula opcional
- flujo de reservas
- panel administrativo lateral
- archivo `base de datos.sql` para montar la estructura en Supabase

## Colores base
- Principal: `#0d1333`
- Secundario oscuro: `#0e0d0d`
- Acento: `#f89217`
- Destructivo/alerta: `#e31c3b`

## Demo local
```bash
npm install
npm run dev
```

## Credenciales demo
- Cliente: `player@fieldplay.com`
- Admin: `admin@fieldplay.com`
- Contraseña: `123456`

## Estado actual
Este MVP funciona en modo local con almacenamiento en `localStorage`.

## Para conectar Supabase real
1. Ejecuta `base de datos.sql` en tu proyecto Supabase.
2. Crea variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Ya existe base mínima de conexión en:
   - `src/lib/supabase.ts`
   - `src/lib/supabase-types.ts`
   - `src/lib/env.ts`
   - `src/lib/data-mode.ts`
4. El siguiente paso es migrar `AuthContext` y `AppDataContext` de mock/local a Supabase real.

## Correo automático al crear reserva
Ahora el frontend intenta disparar un correo de "reserva recibida" cuando una reserva se crea correctamente.

### Archivos involucrados
- `src/contexts/AppDataContext.tsx`
- `src/lib/bookingEmail.ts`
- `supabase/functions/send-booking-received-email/index.ts`

### Configuración necesaria
1. Tener Supabase CLI configurado para este proyecto.
2. Desplegar la Edge Function:
   ```bash
   supabase functions deploy send-booking-received-email
   ```
3. Configurar secrets en Supabase:
   ```bash
   supabase secrets set RESEND_API_KEY=tu_api_key
   supabase secrets set BOOKING_EMAIL_FROM="Field Play <reservas@tudominio.com>"
   ```
4. Si no configuras esos secrets, la reserva se crea, pero el correo no se enviará.

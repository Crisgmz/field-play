# ESTADO ACTUAL DEL PROYECTO: FIELD PLAY
**Fecha:** 2026-04-22
**Estado:** [Fase 3] Documentos Fiscales y Reportes | Fase 2 COMPLETADA | Bloqueos: Ninguno

---

## 1. RESUMEN EJECUTIVO
Field Play es una plataforma modular de reserva de canchas deportivas (fútbol) para el mercado dominicano. Permite subdividir una cancha física (slots S1-S6) en formatos F11, F7 y F5 de manera dinámica y sin conflictos.

## 2. ESTADO DE LAS FASES

### ✅ FASE 1 & 2: CORE & TRANSFERS (COMPLETADAS)
- **Registro de Usuarios:** Flujo con envío de correo profesional vía Edge Functions + Resend.
- **Reservas por Transferencia:** 
  - Instrucciones de pago integradas (Banco Popular).
  - Carga de comprobantes (Storage bucket `booking-proofs`).
  - Estado `pending` automático hasta validación admin.
- **Dashboard Admin:** 
  - Notificaciones visuales de nuevas reservas pendientes.
  - Visualización y gestión de comprobantes.
  - Agrupación corregida de canchas F7 (S1+S2, S3+S4, S5+S6).
- **Backend Robusto:**
  - Tabla de conflictos (`field_unit_conflicts`) materializada.
  - RPCs transaccionales (`rpc_create_booking`) con locks de aviso para evitar doble reserva.

### 🚧 FASE 3: FISCAL & REPORTES (EN DESARROLLO)
- **Documentos Fiscales (NCF):** Implementación de lógica para comprobantes fiscales dominicanos.
- **Reportes Administrativos:** Generación de métricas de ocupación, ingresos y comportamiento de clientes.

---

## 3. PENDIENTES Y HOJA DE RUTA

### 📋 Pendientes Inmediatos (Fase 3)
1. **Módulo NCF:**
   - [ ] Crear tabla de secuencias NCF.
   - [ ] Integrar generación de NCF al confirmar reserva pagada.
   - [ ] Generación de PDF de factura/recibo.
2. **Dashboard de Reportes:**
   - [ ] Gráficas de ingresos mensuales/semanales.
   - [ ] Reporte de "Canchas más populares".
   - [ ] Exportación de datos a CSV/Excel.

### 🎨 UX / UI (Roadmap)
1. **Visual de Cancha en Reservas:** Integrar `CourtLayoutPreview` en el paso 4 del flujo de reserva para que el jugador vea exactamente qué parte de la cancha está alquilando.
2. **Indicadores en Tiempo Real:** Mostrar "X de Y disponibles" en las tarjetas de selección de modalidad (F5/F7/F11).
3. **Optimización Móvil:** Cambiar la cuadrícula de slots por un selector de tarjetas deslizables en móviles.
4. **Explicación de Conflictos:** Tooltips que expliquen por qué una modalidad no está disponible (ej: "Espacio ocupado por reserva F11").

### ⚙️ Backend & Integraciones (Futuro)
1. **Pasarela de Pago Online:** Integrar pagos directos con tarjeta (ej: Azul/PlacetoPay).
2. **Reservas Recurrentes:** Sistema para fijar turnos semanales (ej: "Lunes de 8pm-9pm").
3. **Notificaciones Push/WhatsApp:** Avisos automáticos de recordatorio de juego y confirmación de pago.
4. **Suscripciones Realtime:** Actualización instantánea de disponibilidad sin refrescar la página.

---

## 4. ESPECIFICACIONES TÉCNICAS
- **Frontend:** React 18, Tailwind, shadcn/ui.
- **Backend:** Supabase (Postgres, Auth, Edge Functions, RLS).
- **Modelo de Slots:** Una cancha física = 6 slots. 1 F11 = 3 F7 = 6 F5.
- **Protección de Datos:** RLS activo en todas las tablas; prohibido modificar bases de datos directamente (usar migraciones).

---
*Documento generado por Alfred 🦉*

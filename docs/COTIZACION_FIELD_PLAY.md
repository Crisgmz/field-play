# Cotización — Plataforma Field Play / RealPlay

**Fecha:** 5 de mayo de 2026
**Preparado por:** [Tu nombre / razón social]
**Cliente:** [Nombre del club / cliente]
**Vigencia:** 30 días desde la fecha de emisión
**Moneda:** Pesos Dominicanos (RD$)

---

## 1. Resumen ejecutivo

Plataforma web modular de reservas deportivas para clubes. Soporta gestión
completa de canchas, modalidades de juego (F5 / F7 / F11), reservas de
jugadores, pagos múltiples, panel administrativo con calendario, reportes
y notificaciones automáticas. Incluye módulo adicional de **Pádel** y
publicación con dominio propio + certificado SSL.

| Concepto | Monto (RD$) |
|---|---:|
| Desarrollo plataforma (módulos detallados) | 37,150.00 |
| Módulo de Pádel (extensión multi-deporte) | 12,400.00 |
| Dominio (.com / .do — 1 año) | 2,000.00 |
| Certificado SSL | 450.00 |
| **Total único de implementación** | **52,000.00** |
| Mantenimiento mensual | 2,500.00 / mes |

---

## 2. Detalle de módulos desarrollados

### 2.1 Autenticación y gestión de usuarios — RD$ 3,500
- Registro y login de jugadores
- Verificación por código de 6 dígitos vía correo
- Recuperación de contraseña con email branded
- Sesiones persistentes con manejo de tokens
- Protección de rutas por rol (cliente / admin / staff)

### 2.2 Gestión de clubes con galería — RD$ 2,500
- Creación y edición de clubes (nombre, ubicación, horarios, descripción)
- Galería de imágenes con subida múltiple
- Imagen destacada / portada
- Optimización de carga (skeletons + fade-in)

### 2.3 Configuración de canchas (F5 / F7 / F11) — RD$ 4,000
- Modelo de slots físicos (S1–S6) con subdivisiones automáticas
- 4 layouts pre-configurados (full_11, three_7, six_5, versatile_full)
- Vista previa visual interactiva de la cancha
- Grafo de conflictos automatizado para evitar reservas dobles
- Editor de horario semanal por club

### 2.4 Flujo de reserva del jugador — RD$ 3,500
- Selección de fecha, modalidad y horario
- Cálculo de precios dinámico
- Validación de disponibilidad en tiempo real
- Resumen de reserva pre-confirmación
- Política de cancelación visible (24h)

### 2.5 Métodos de pago múltiples — RD$ 2,500
- Transferencia / depósito bancario con subida de comprobante
- Efectivo en oficina
- Tarjeta en oficina
- Re-subida de comprobante si fue rechazado

### 2.6 Panel administrativo — overview y KPIs — RD$ 3,000
- Dashboard con métricas clave (reservas, ingresos, ocupación)
- Listado de últimas reservas
- Alertas de reservas pendientes nuevas
- Acceso rápido a secciones operativas

### 2.7 Calendario diario por cancha — RD$ 3,000
- Vista de calendario diario con cada cancha en columna
- Visualización de conflictos entre modalidades (F11/F7/F5)
- Tooltips explicativos de conflicto
- Click directo en celda para crear reserva

### 2.8 Creación manual de reservas — RD$ 2,000
- Diálogo controlado para que el admin cree reservas
- Selección de cliente existente
- Pre-selección de cancha y horario desde calendario

### 2.9 Edición / cancelación / rechazo de reservas — RD$ 1,500
- Edición de fecha, horario, precio, método de pago, notas
- Validación de conflictos al editar
- Cancelación con razón (cliente y admin)
- Rechazo con motivo (admin)

### 2.10 Reportes con exportación Excel y PDF — RD$ 3,000
- KPIs financieros y operativos
- Desgloses por club, cancha, modalidad y horario
- Exportación a Excel (.xlsx)
- Exportación a PDF
- Filtros de rango de fechas

### 2.11 Actualizaciones en tiempo real — RD$ 1,500
- Sincronización vía Supabase Realtime
- Toasts de notificación de nuevas reservas
- Refresco automático del calendario y listados

### 2.12 Roles y permisos (Staff) — RD$ 2,500
- Rol "staff" con permisos granulares
- Invitación por correo con onboarding
- Control de acceso a módulos específicos

### 2.13 Optimización responsive móvil — RD$ 2,000
- Layouts adaptados a celular y tablet
- Sidebar con scroll en móvil
- Modales con botón de retroceso nativo
- Cards swipeables donde aplica

### 2.14 Notificaciones por correo — RD$ 1,500
- Edge Functions de Supabase + Resend API
- Plantillas branded (verificación, recuperación, confirmación de reserva)
- Notificación al admin de nuevas reservas

### 2.15 Manejo de errores y UX polish — RD$ 1,150
- ErrorBoundary global (evita pantalla en blanco)
- Loading screens con escape hatch
- Skeletons y shimmer en cargas
- Confirmaciones de acciones destructivas
- Formato de hora 12h y moneda RD$ unificados

**Subtotal módulos: RD$ 37,150.00**

---

## 3. Módulo Pádel — RD$ 12,400

Extensión multi-deporte que permite a los clubes ofrecer canchas de pádel
junto con las de fútbol en la misma plataforma.

Incluye:
- Modelo de datos multi-deporte (clubes mixtos fútbol + pádel)
- Configuración de canchas de pádel (sin subdivisión)
- Filtro de deporte en home y panel admin
- Branch específico en flujo de reserva (sin paso de modalidad)
- Pricing independiente por deporte
- Visualización en calendario diario con icono distintivo
- Creación manual de reservas de pádel por admin
- Reportes con desglose por deporte (donut fútbol vs pádel)
- Notificaciones email con terminología de pádel
- Migración SQL y actualización de RPCs

> Detalle técnico completo en [docs/PRD_PADEL.md](PRD_PADEL.md).

---

## 4. Hosting y publicación

| Concepto | Monto (RD$) |
|---|---:|
| Dominio (.com o .do — 1 año) | 2,000.00 |
| Certificado SSL | 450.00 |
| **Subtotal** | **2,450.00** |

> Renovación anual del dominio: RD$ 2,000 / año (a partir del segundo año).

---

## 5. Mantenimiento mensual — RD$ 2,500/mes

Plan de mantenimiento recurrente que incluye:

- Monitoreo de la plataforma y disponibilidad
- Aplicación de parches de seguridad y actualizaciones de dependencias
- Soporte técnico para incidencias (vía correo / WhatsApp)
- Backups periódicos de base de datos
- Pequeños ajustes y correcciones (hasta 4 horas de desarrollo / mes)
- Reporte mensual de uso y rendimiento

> No incluye desarrollo de funcionalidades nuevas (cotizadas aparte).
> Inicia el mes siguiente al go-live.

---

## 6. Cuadro resumen final

### Pago único — al inicio del proyecto

| Concepto | Monto (RD$) |
|---|---:|
| Desarrollo de plataforma (15 módulos) | 37,150.00 |
| Módulo Pádel | 12,400.00 |
| Dominio (1 año) | 2,000.00 |
| Certificado SSL | 450.00 |
| **TOTAL ÚNICO** | **52,000.00** |

### Pago recurrente

| Concepto | Frecuencia | Monto (RD$) |
|---|---|---:|
| Mantenimiento | Mensual | 2,500.00 |

---

## 7. Forma de pago sugerida

- **50% al firmar** la propuesta y arrancar el proyecto: RD$ 26,000
- **50% al go-live** y entrega final: RD$ 26,000
- **Mantenimiento:** se factura mensualmente, primer cargo el mes posterior al go-live

---

## 8. Garantía y soporte post-entrega

- 30 días de garantía sobre defectos en lo entregado, sin costo adicional
- Capacitación inicial al equipo administrativo del club (videollamada de hasta 1 hora)
- Acceso a documentación técnica del sistema

---

## 9. Notas y exclusiones

- La cotización no incluye costos de servicios externos de terceros
  (Supabase, Resend, etc.) más allá de los planes free-tier ya cubiertos.
- Ampliaciones, integraciones nuevas (WhatsApp, pagos online, etc.) o
  re-diseños mayores se cotizan por separado.
- Los precios están expresados en pesos dominicanos (RD$) y no incluyen
  ITBIS si aplicara.

---

**Aceptación**

| Cliente | Proveedor |
|---|---|
| Nombre: ________________________ | Nombre: ________________________ |
| Firma: ________________________ | Firma: ________________________ |
| Fecha: ________________________ | Fecha: ________________________ |

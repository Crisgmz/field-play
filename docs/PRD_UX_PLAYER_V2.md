# PRD — Rediseño UX del lado Cliente (V2)

**Fecha:** 2026-04-30
**Owner:** Cristian
**Estado:** Propuesto — pendiente de aprobación
**Alcance:** Solo UI/UX cliente (jugador). Backend, RLS, Edge Functions y Admin Dashboard fuera de alcance.

---

## 1. Problema

El flujo actual de reserva es un wizard de 4 pasos con cambios de página:

1. Modalidad (F5/F7/F11)
2. Fecha (lista de 60 días en scroll horizontal)
3. Hora + selección de espacio físico + pago
4. Confirmación

**Síntomas observados:**
- Dos pasos separados para fecha y hora aumentan el "tiempo a primera reserva".
- El paso 3 expone un grid de 6 slots físicos (S1–S6) que el jugador **no necesita entender** para reservar — es un concepto interno del producto.
- La home no comunica disponibilidad, precio ni acción rápida ("Book Now").
- El layout actual (max-width 5xl, hero plano azul) se siente más como un dashboard interno que como un marketplace de reservas.

## 2. Objetivo

Dejar el lado cliente con la misma sensación que un marketplace deportivo moderno (referencia: Playtomic / la captura de V Sports Academy compartida): tarjetas limpias, search persistente, una sola pantalla para reservar.

**Métricas de éxito (cualitativas — sin analítica aún):**
- Reservar una cancha toma ≤ 3 clicks desde Home (hoy: 6+).
- El jugador nunca ve los términos "slot", "S1", "unidad", "configuración".
- La pantalla de reserva cabe sin scroll en una laptop estándar (1440×900) cuando hay disponibilidad clara.

## 3. Cambios principales

### 3.1 Home (`src/pages/Home.tsx`)
**Antes:** Hero azul con un solo input de búsqueda + grid de tarjetas básicas.
**Después:**
- Hero con gradiente verde (alineado al brand actual `--primary`).
- **Search bar flotante** sobre el hero con 3 campos: Ubicación (select), Fecha (date picker), Tipo de juego (F5/F7/F11), botón de búsqueda.
- Grid de **3 columnas** (lg) de `ClubCard` rediseñado.

**`ClubCard` rediseñado:**
- Imagen real del club (16:9), fallback al icono ⚽ actual si no hay imagen.
- Badge **"Featured"** (top-left) — opcional, controlable desde admin más adelante. Por ahora se muestra si `rating >= 4.5`.
- Badge de **precio** (top-right): "RD$ X/hr" — el `minPrice` que ya calcula el componente.
- Rating + número de reviews (placeholder por ahora — el conteo de reviews no existe en DB; mostrar `rating` solo).
- Icono ❤️ favoritos (UI-only por ahora, sin persistencia).
- Ubicación con icono de pin.
- **"Próxima disponibilidad"** — calculado en cliente con la lógica existente de `getAvailableTimeSlotsV2`. Si hay slot libre hoy → "Hoy"; si no, primera fecha disponible.
- Avatar + nombre del owner del club (de `profiles`).
- Botón **"Reservar"** que va directo al flujo unificado.

### 3.2 Página de reserva unificada (`src/pages/BookingFlow.tsx`)
**Antes:** 4 pasos en páginas separadas.
**Después:** **2 pasos** en una sola pantalla con scroll natural:

**Paso 1 — Configurar reserva (todo en una pantalla):**
- Selector de modalidad F5/F7/F11 (cards horizontales, indicando "X disponibles" en tiempo real).
- **Date picker + time picker uno al lado del otro** (en mobile uno arriba del otro):
  - Date: scroll horizontal de 14 días (no 60 — reduce ruido visual; el resto se accede con un botón "Más fechas").
  - Time: grid de slots con estado visual (disponible / ocupado / seleccionado).
- Resumen lateral pegado a la derecha (sticky en desktop) con: club, fecha, hora, modalidad, precio total.

**Paso 2 — Pago y confirmación:**
- Datos bancarios + upload de comprobante.
- Botón "Enviar reserva".
- Pantalla final de éxito (la actual del step 4).

### 3.3 Simplificación del modelo de selección
**Antes:** El jugador ve los 6 slots físicos y debe elegir una "Combinación" (unidad).
**Después:** El sistema **autoselecciona** la primera unidad disponible compatible con la modalidad+fecha+hora elegidas. Si hay múltiples disponibles, se elige por orden.

- `findAvailableUnit` ya existe en `src/lib/availability.ts` — solo se cambia que el `BookingFlow` no pida selección manual.
- El `FieldSlotsBoard` y `CourtLayoutPreview` se mantienen como **vista informativa colapsable** ("Ver detalle de la cancha"), no como selector obligatorio.
- Beneficio backend: como la lógica de conflictos se resuelve igual (RPC `rpc_create_booking`), no hay riesgo de doble reserva.

**Edge case:** Si no hay unidad disponible para la combinación → se muestra inline ("No hay disponibilidad para ese horario") y se sugiere el siguiente slot libre.

### 3.4 Header
- Logo a la izquierda (ya existe).
- "Mis reservas" + avatar a la derecha (la captura muestra "My Booking" + avatar — adaptación a "Mis reservas").
- Mantener el menú de logout actual.

## 4. Componentes nuevos / modificados

| Componente | Tipo | Notas |
|---|---|---|
| `HeroSearchBar` | **Nuevo** | Location/Date/GameType + submit. Usa `useSearchParams` para persistir filtros en URL. |
| `ClubCard` | **Reescritura** | Layout nuevo, badges, owner, próxima disponibilidad. |
| `BookingFlow` | **Refactor mayor** | Colapsa 4 pasos en 2; integra date+time en misma vista; quita selector manual de slots. |
| `FieldSlotsBoard` | Sin cambios funcionales | Pasa a ser opcional/colapsable. |
| `Home` | **Reescritura** | Hero verde + grid de 3 columnas + filtros activos. |
| `Header` (Index.tsx) | Ajuste menor | Estilo más limpio, alineado a la captura. |
| `ClubDetail` | **A decidir** | Ver §6. |

## 5. Decisiones abiertas (necesito tu input)

1. **`ClubDetail` página intermedia:** Hoy: `Home → ClubDetail → BookingFlow`. ¿La eliminamos y vamos directo `Home → BookingFlow` (como la captura)? La info del club se puede mostrar en un card lateral del BookingFlow. **Recomendación:** eliminarla — un click menos. Mantener la URL `/clubs/:id` pero que renderice directamente el flujo de reserva.

2. **Reviews:** No existen en el schema. Opciones:
   - (a) Mostrar solo el `rating` numérico (sin "X reviews").
   - (b) Mostrar reviews falsos como en la captura (no recomendado).
   - (c) Agregar tabla `reviews` (fuera de alcance de este PRD).
   **Recomendación:** opción (a).

3. **Imágenes de clubes:** El schema tiene `image_url` pero los clubes actuales lo tienen vacío. ¿Permitimos al admin subirla en este PRD o usamos placeholders por ahora? **Recomendación:** placeholders ahora, upload de imagen en un PRD separado.

4. **Filtro "Tipo de juego" en Home:** ¿Filtra clubes que tengan canchas de ese tipo, o pre-selecciona la modalidad al entrar al BookingFlow? **Recomendación:** ambas — filtra clubes que tengan unidades del tipo, y al hacer click en "Reservar" entra al flow con la modalidad pre-elegida.

5. **Favoritos (❤️):** ¿En este PRD o lo posponemos? Requiere tabla `favorites` + auth check. **Recomendación:** UI-only en este PRD (icono visible pero sin persistencia), funcionalidad real en otro PRD.

## 6. Fuera de alcance (explícito)

- Backend / migraciones / RPCs.
- Admin Dashboard.
- Sistema de reviews real.
- Upload de imágenes de clubes.
- Pagos online (sigue siendo transferencia + comprobante).
- i18n (sigue 100% español).
- Reservas recurrentes.

## 7. Plan de implementación sugerido

Si apruebas, propongo este orden — cada paso es un commit revisable:

1. `HeroSearchBar` + nuevo `Home` (sin tocar el flujo de reserva todavía).
2. `ClubCard` rediseñado.
3. `BookingFlow` consolidado: date+time en misma página, autoselección de unidad.
4. Eliminar paso intermedio `ClubDetail` (si confirmas §5.1).
5. Pulido de header + mobile QA.

**Tiempo estimado:** 2–3 sesiones de trabajo. Sin cambios irreversibles — todo es UI, no toca DB ni RPCs.

## 8. Riesgos

- **Romper bookings existentes:** Bajo — la lógica de `availability.ts` y los RPCs no cambian. Solo cambia la UI que los consume.
- **Mobile:** El layout de la captura es desktop-first; hay que pensar bien la versión mobile del search bar (probable: stack vertical).
- **Disponibilidad calculada en `ClubCard`:** Si calculamos "Próxima disponibilidad" en cliente para cada card, hay coste de cómputo con muchos clubes. Mitigación: memoizar o calcular solo para los primeros N visibles.

---

**Próximo paso:** revisar §5 (decisiones abiertas) y §7 (orden). Una vez aprobado, arranco con el paso 1.

# Training de código fuente: HMI TX1 integrado

Esta sesión se realiza **en el servidor, leyendo el fuente y observando el frontend existente en el puerto 3000 contra Tracking en 8085**. No requiere levantar otra instancia, usar un simulador, compilar, detener procesos ni ejecutar comandos industriales. El objetivo es que otro desarrollador pueda seguir el código, diagnosticar un dato y saber dónde implementar un cambio.

La base funcional del servidor documentado es **`7fc34e8`**, en `release/integrated-hmi`. Después del checkpoint documental `c7df85a`, el checkpoint de fuente del **13 de octubre de 2026** reúne filtro REMOVED, confirmación de retiro retenido, reset de mantenimiento y el nuevo layout compartido de Bundler. Estos ajustes aún no están desplegados. Esta guía distingue lo instalado de lo nuevo: abrir la versión real antes de afirmar que un control ya está disponible. El cambio local posterior permite comentario opcional sólo en REMOVE, tras la prueba directa de API 0.44 (evento 237102). Operator ID sigue visible/obligatorio porque null recibió 400; Reposition/legacy conservan comentario obligatorio hasta confirmar sus variantes.

### Adición de desarrollo: selector LPN QMOS v0.44

El checkpoint del **19 de octubre de 2026**, sobre la base publicada `7fe8474`, incorpora el control global **QMOS LPN mode**, pendiente de despliegue. Para explicarlo abrir `QmosLpnModeControl` en `components/qmos-lpn-mode-control.tsx`, seguir `getQmosLpnMode/updateQmosLpnMode` en el cliente y el GET/PUT allowlisted del proxy. La selección, operador (100 máximo) y motivo (500 máximo) son obligatorios; no se usa un operador fijo ni se aplica aquí la excepción de comentario opcional en REMOVE.

Texto sugerido: “El selector guarda cómo creará el motor los siguientes bundles. ON continúa el flujo QMOS; OFF crea una identidad interna sin LPN. Los que ya existen mantienen su política y el adaptador mantiene su propia configuración. Confirmamos el cambio sólo con la respuesta de guardado; si se pierde, primero consultamos el estado actual.”

Para mostrar el efecto en código, abrir `bundle-presentation.ts` y luego `TrackingZoneSlot`, `TrackingBundlesPanel`, `ScaleWeightReadout` y `KpiCards`. DisplayId es la identidad visible; TrackingId sigue siendo la identidad del comando. OFF muestra “ID interno / sin LPN”, su UNMATCHED no es espera de QMOS y conserva acciones manuales/peso/FIFO. Comprobar la versión instalada antes de presentar esta función como disponible en servidor; [alcance y validación](estado-entrega.md#trabajo-posterior-a-7fe8474-selector-global-lpn-qmos-v044).

## 1. Preparación en el servidor: abrir la carpeta correcta

Abrir en el editor esta carpeta de **fuente**, no la carpeta compilada:

```text
C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8
```

El paquete de ejecución está debajo de ella:

```text
dist\tx1-tracking-windows
```

Con el explorador de archivos del editor deben verse `app`, `components`, `hooks`, `lib` y `scripts`. Si sólo se ve `server.js`, `.next` y `node_modules`, se abrió el runtime: volver al directorio fuente. `server.js` y los chunks compilados no son el punto de entrada que se mantiene a mano.

En una PowerShell **adicional**, estos comandos sólo consultan:

```powershell
Set-Location 'C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8'
git status --short --branch
git log -1 --oneline
Get-Content -LiteralPath '.\dist\tx1-tracking-windows\RELEASE.txt'
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/tracking-api/api/tracking/status' -TimeoutSec 10 | ConvertTo-Json -Depth 5
```

El último despliegue documentado fue `7fc34e8`; comprobar el fuente y `RELEASE.txt` reales antes de continuar. Los ajustes locales nuevos no se incorporan a ese paquete automáticamente. El manifiesto identifica el paquete, no demuestra qué proceso posee 3000. `apiVersion` del GET pertenece al backend, no al commit frontend.

Abrir el navegador del servidor en `http://127.0.0.1:3000/`. Mantener otra pestaña de editor con búsqueda de símbolos. No ejecutar `start.cmd` sobre un puerto ya ocupado; no modificar archivos ni guardar cambios durante este recorrido.

## 2. Resultado esperado y orden del recorrido

Al terminar, el mantenedor debería explicar de dónde sale una tarjeta, por qué puede verse información anterior durante una desconexión, cómo se valida un JSON, cómo se diferencia una selección global de una acción manual y dónde haría cada cambio.

| Bloque | Archivos que se abren | Lo que debe quedar demostrado |
| --- | --- | --- |
| Entrada y componentes, 10 min | `app/page.tsx`, `components/dashboard.tsx`, `components/app-header.tsx` | Las cinco pestañas comparten un Dashboard y un estado de Tracking. |
| Lectura y contrato, 20 min | `hooks/use-tracking-api.ts`, `lib/tracking-api/client.ts`, `types.ts`, `validation.ts`, proxy | Seguir una petición real desde el navegador hasta su validación y regreso a React. |
| Dato a dibujo, 15 min | `hooks/use-plant-state.ts`, `lib/tracking-zone-layout.ts`, `main-schematic.tsx`, `tracking-zone-slot.tsx` | Mostrar exactamente por qué un bundle aparece en CCH2A. |
| FIFO, peso y layout, 10 min | `lib/tracking-fifo.ts`, `scale-weight-readout.tsx`, diagramas | Separar posición, orden lógico, valor reportado y coordenadas de pantalla. |
| Selecciones y comandos, 20 min | `mill-order-selection-panel.tsx`, `tracking-bundles-panel.tsx`, `manual-position.ts` | Recorrer handlers sin enviarlos; explicar confirmación, preflight y resultado. |
| Mantenimiento, 10 min | `package.json`, `next.config.mjs`, empaquetador, mapa de código | Saber qué se recompila, qué se configura y qué no se debe editar en runtime. |

Si el tiempo es menor, priorizar una lectura completa de `state` y un comando completo en código. No sustituirlos por una lista de carpetas. [Mapa de código y recetas de cambio](mapa-codigo.md) contiene el detalle de consulta posterior.

## 3. Primer recorrido: cómo se construye esta pantalla

### 3.1 `app/page.tsx` → `Dashboard`

Abrir [app/page.tsx](../app/page.tsx). `Page` devuelve `<Dashboard />`. No consulta Tracking ni calcula el layout. Es la entrada App Router para `/`.

Abrir [components/dashboard.tsx](../components/dashboard.tsx), buscar `export function Dashboard` y luego `usePlantState`. Aquí se obtiene una sola estructura con `tracking`, `trackingConfig`, `bundlesByZone`, `retryTracking` y el estado visual. Buscar `useState<PlantView>`: la pestaña seleccionada es estado local React, inicialmente `overview`.

Buscar las condiciones `view ===` y seguir sus componentes:

- `overview` → `PlantMap` → `MainSchematic`.
- `stackers` → `StackersSchematic`.
- `stacker` → `StackerSchematic`: pestaña nueva en singular; no sustituye `stackers`.
- `bundler` → `BundlerSchematic`.
- `bay-1` → `BayOneSchematic` → `StackerSchematic`, temporalmente la misma vista con título Bay 1.
- `bay-2` → `BayTwoSchematic` → `MainSchematic` con `variant="bay-2"`, sector derecho del Overview.

Son cinco vistas dentro de `/`, no cinco rutas de Next. Al cambiar una pestaña se cambia el diagrama renderizado, no la fuente de datos del Dashboard. `AppHeader` recibe `view` y `onViewChange`; el callback comunica la elección hacia el componente que es dueño de ese estado.

### 3.2 Dónde corre cada parte

`app/page.tsx` y `app/layout.tsx` son Server Components por defecto. `Dashboard` tiene `"use client"`: necesita estado, efectos e interacciones. Sus imports forman parte del árbol cliente, aunque algunos componentes hijos no repitan esa directiva.

Esto no significa que un Client Component nunca se renderice en el servidor: Next puede producir su HTML inicial; la hidratación y los efectos lo vuelven interactivo en el navegador. En este proyecto, la consulta periódica a Tracking ocurre desde el efecto de `useTrackingApi` después del montaje. El Route Handler de `/tracking-api` corre en el proceso Node del servidor y no se incorpora al JavaScript del navegador.

### 3.3 Props frente a estado

Usar `bundlesByZone` como ejemplo: `Dashboard` lo pasa como prop; el diagrama selecciona una zona; `TrackingZoneSlot` recibe su lista. Ninguna tarjeta es dueña del snapshot global. El cambio de React state en el hook provoca un nuevo render de los consumidores. `useMemo` evita volver a calcular ciertas derivaciones si no cambiaron sus dependencias; no persiste datos en una base.

## 4. Segundo recorrido: una petición `state` de extremo a extremo

Abrir F12 → Network → Fetch/XHR y filtrar `tracking/state`. Seleccionar una lectura reciente y revisar **Headers** y **Response**. Mostrar la URL real:

```text
Navegador: http://127.0.0.1:3000/tracking-api/api/tracking/state
                         │
                         ▼
Next Route Handler: app/tracking-api/[...path]/route.ts
                         │ TRACKING_API_PROXY_TARGET
                         ▼
Backend: http://localhost:8085/api/tracking/state
```

La repetición `/tracking-api/api/` es intencional: `/tracking-api` es la base pública del frontend, `/api/tracking/state` es el path del contrato backend. Si el navegador se abre desde otra PC, `127.0.0.1` no es el servidor: allí se usa el host/IP del HMI. El `localhost` privado del proxy se resuelve donde corre Node.

### 4.1 Configuración y método del cliente

Abrir [lib/tracking-api/config.ts](../lib/tracking-api/config.ts), buscar `getTrackingApiConfig`. La configuración pública determina modo, base URL e intervalos. Los valores `NEXT_PUBLIC_*` se incorporan al build; no cambia un bundle ya compilado por editar un `.env` después. El destino privado `TRACKING_API_PROXY_TARGET` lo lee el servidor.

Abrir [lib/tracking-api/client.ts](../lib/tracking-api/client.ts), buscar `getState`, después `private get` y `private async request`. El recorrido es:

1. `getState` selecciona `/api/tracking/state` y `isTrackingStateDto`.
2. `request` construye la URL, el `AbortController`, el timeout y las cabeceras.
3. `fetch` utiliza `cache: "no-store"` y `credentials: "omit"`.
4. `readResponseBody` lee y trata de parsear el cuerpo.
5. HTTP fallido produce `ApiError` con status y body. Una respuesta HTTP exitosa con JSON incompatible también falla, mediante `invalid-json` o `invalid-payload`.
6. Sólo un resultado aceptado por el validador vuelve al hook como `TrackingStateDto`.

No hay reintento automático del POST dentro del cliente. El polling GET y el tratamiento de incertidumbre de comandos se implementan más arriba.

### 4.2 Proxy: qué añade y qué no añade

Abrir [app/tracking-api/[...path]/route.ts](../app/tracking-api/%5B...path%5D/route.ts), buscar `GET`, `STATIC_READ_ENDPOINTS` e `isAllowedReadEndpoint`. El handler espera `context.params`, reconstruye el path y comprueba una allowlist. `getProxyTarget` valida la URL privada. Reenvía el GET al backend y devuelve su cuerpo y status con `cache-control: no-store`.

El proxy GET no convierte por sí solo el JSON en `TrackingStateDto`: esa comprobación ocurre en el cliente. Por eso un GET puede verse como HTTP 200 en Network y aun así generar “incompatible response shape” en la aplicación.

Para escrituras, buscar `POST` y `PUT`: además de restringir rutas, comprueban el cuerpo y reconstruyen únicamente los campos permitidos. No son un proxy abierto para todos los comandos de la API. La allowlist limita superficie, pero **no es autenticación ni autorización por usuario**.

### 4.3 Tipado no equivale a validación

Abrir [lib/tracking-api/types.ts](../lib/tracking-api/types.ts): `TrackingStateDto` tiene `ScenarioName`, `LastUpdateUtc` y `Bundles`; cada elemento es `TrackedBundleDto`. Luego abrir [validation.ts](../lib/tracking-api/validation.ts) y comparar `isTrackingStateDto` con `isTrackedBundleDto`.

La interfaz TypeScript ayuda durante programación; no existe como comprobación automática del JSON recibido. El validador es el código que corre de verdad. Un campo adicional no necesariamente rompe compatibilidad; un campo requerido ausente o de tipo distinto sí puede invalidar la lectura completa. Los campos FIFO están modelados como opcionales y anulables para compatibilidad.

El contrato conserva casing real: `running` en status, `ScenarioName`/`Bundles` en state. No normalizar todas las propiedades a minúsculas. `parseApiDate`, en `lib/tracking-api/date.ts`, convierte ISO o `/Date(...)/` y trata fechas inválidas/sentinela como ausencia.

## 5. Tercer recorrido: por qué se actualiza y cuándo se pone stale

Abrir [hooks/use-tracking-api.ts](../hooks/use-tracking-api.ts), localizar `useTrackingApi`, el primer `useEffect` y su función interna `run`.

Primera carga: `getStatus` → `getCapabilities` → `getMap` → `getState`, en secuencia. Comprueba `running` y coherencia de escenarios mediante `assertScenarioMatches`. Con bootstrap completado, las iteraciones normales piden sólo `state`.

En `commitState`, `setTracking` conserva la estructura de runtime y reemplaza el snapshot, registra recepción local y parsea `state.LastUpdateUtc`. Mostrar en [runtime.ts](../lib/tracking-api/runtime.ts) la diferencia entre DTO recibido y `TrackingRuntimeState`, que además lleva conexión, errores y metadatos.

El siguiente `setTimeout(run, nextDelay)` se programa al terminar la lectura anterior: el intervalo no es un reloj exacto de 1 Hz. El bucle no solapa sus propias peticiones. Las selecciones y la verificación de comandos sí pueden hacer sus GET independientes.

En `catch` observar que no se borran los bundles previamente recibidos. Con snapshot previo se muestra reconexión o dato antiguo; sin él puede mostrarse offline. `retryDelay` aplica backoff y jitter con **tope de espera de 30 segundos**, no una ventana total tras la que se deje de reintentar. Los errores reinician el bootstrap.

El segundo efecto controla antigüedad incluso durante una petición pendiente. Valores predeterminados: polling 1000 ms, stale 3500 ms, timeout configurado 4000 ms. Son configurables; no afirmar que el entorno activo usa esos valores sin comprobarlo.

En pantalla, **Received** indica recepción local exitosa y **State changed** la fecha reportada por backend. Un estado sin cambios puede seguir llegando fresco. `TrackingConnectionBanner` y `TrackingSyncBadge` consumen este runtime; no hacen otra lectura de Tracking.

El cleanup aborta la petición pendiente y cancela el temporizador. No detengan el backend ni cambien la conexión durante el training para demostrarlo: recorrer el `catch` en código es suficiente.

## 6. Cuarto recorrido: de un bundle real a una tarjeta

En una respuesta Network reciente, seleccionar un bundle con `CurrentZone` conocido, por ejemplo CCH2A si está ocupado. No asumir que un ID histórico sigue en esa zona. Copiar visualmente `TrackingId`, `BundleId`, `CurrentZone`, `Status`, `CorrelationStatus`, `LogicalBufferName` y `QueueSequence`.

Abrir [hooks/use-plant-state.ts](../hooks/use-plant-state.ts), buscar `bundlePlacement`. `groupTrackingBundlesByZone` recibe `tracking.trackingState?.Bundles ?? []`. Abrir su implementación en [lib/tracking-zone-layout.ts](../lib/tracking-zone-layout.ts):

- `CurrentZone` conocido → `byZone[CurrentZone]`.
- Zona ausente → `withoutZone`.
- Nombre fuera del catálogo visual → `unknownZone`.

`OccupiedZones` no decide en qué tarjeta dibujar el bundle. Se usa como evidencia adicional en preflight manual. La UI tampoco calcula la posición por flechas, `RouteName`, `TagNumber` o números consecutivos.

Volver a `Dashboard`, seguir `bundlesByZone` hasta `MainSchematic`, su helper `Zone` y finalmente [TrackingZoneSlot](../components/plant/tracking-zone-slot.tsx). Allí se calculan contador, orden de filas, color y texto. La identidad visible prioriza `BundleId`, después `L2Id` y finalmente `TrackingId`. Las acciones usan `TrackingId`, no necesariamente el número mostrado.

Una tarjeta ocupada se ve ámbar si algún bundle está `WAITING_QMOS_ID` o `UNMATCHED`; si no, verde. No concluir que un color equivale a alarma física del PLC. `hasSnapshot=false` representa espera de datos, distinto de snapshot válido con cero bundles.

**Cambio local importante:** abrir `lib/tracking-api/bundle-lifecycle.ts`. `getActiveBundles` oculta únicamente `Status: REMOVED` normalizado de agrupación, lista, KPI, banner y peso; no muta el snapshot. La verificación manual sigue leyendo datos completos. `7fc34e8` todavía contaba/listaba esos registros: al enseñar el servidor antiguo, explicar la diferencia sin atribuirle el ajuste nuevo.

## 7. FIFO, báscula y geometría: tres cambios distintos

### FIFO

Abrir [lib/tracking-fifo.ts](../lib/tracking-fifo.ts), `getFifoMembership` y `orderBundlesByLogicalFifo`; después volver a su llamada en `TrackingZoneSlot`.

El helper exige nombre lógico no vacío y `QueueSequence` numérica entera segura. Agrupa por el nombre lógico exacto, ordena cada grupo de menor a mayor secuencia y escribe ese grupo en los índices que ya ocupaba. No reubica registros sin membresía válida, no compara secuencias de buffers diferentes, no usa el número de bundle como desempate y no modifica el array recibido.

En empate conserva el orden recibido y marca secuencias duplicadas. Datos incompletos junto con miembros válidos producen indicación parcial en la tarjeta. Si ambos campos son nulos, no inventa orden FIFO. **FIFO se aplica dentro de las tarjetas, no al listado general Tracked bundles.**

Para verificarlo en vivo se necesita una respuesta con al menos dos miembros válidos del mismo buffer y sus secuencias. Si hoy son nulos, sólo puede explicarse el código y documentar que falta esa evidencia de backend. No sustituirla por un orden visual de IDs.

### Báscula

Abrir `ScaleContext` en [main-schematic.tsx](../components/plant/main-schematic.tsx). Pasa `bundlesByZone.SGRT2` a [ScaleWeightReadout](../components/plant/scale-weight-readout.tsx). Bay 1 reutiliza el mismo componente. No es SGRT2A ni SGRT2B.

Mostrar la diferencia entre sin snapshot, zona vacía y bundle con `Weight: null`. Cero es un número válido, no dato ausente. El frontend muestra `Weight` reportado; no adquiere la señal de la báscula, no convierte unidades y no las inventa si el contrato no las proporciona. Si hay varios bundles en SGRT2, el componente lista sus lecturas por identidad, no suma sus pesos.

### Layout

En `MainSchematic`, `MAIN_SCHEMATIC_WIDTH=1480`, `MAIN_SCHEMATIC_HEIGHT=760` y `BUNDLER_ROW_TOP=250` gobiernan el lienzo y la fila del Bundler. `MachineOutline`, `HorizontalSequence`, `VerticalSection` y `FlowArrow` son helpers de dibujo, no reglas de Tracking.

Cambio local del 13 de octubre: la pestaña Bundler ahora reutiliza ese mismo componente con `variant="bundler"`. Omite únicamente ERT1A/B, ERT2C/D, STRT1/2, LFRT1/2/3 y sus flechas; mantiene báscula SGRT2, NCCT, ambas secciones y Robot 2. El desplazamiento horizontal común recorta el espacio sobrante, no cambia `CurrentZone`. La variante por defecto del Overview permanece completa. No atribuir este cambio al paquete desplegado `7fc34e8`.

Después del checkpoint `90c849c` se añadió **Stacker**, en singular, como una pestaña adicional. `StackerSchematic` usa `variant="stacker"` para conservar ERT, STRT, LFRT, SGRT1/2, NCCT1/2 y báscula, sin Bundler/RTOUT, RTTY, IMRT ni secciones Bay 2. El desplazamiento vertical común elimina espacio vacío sin alterar relaciones entre tarjetas. **Stackers**, en plural, sigue llamando al componente anterior sin cambios. Ambas leen el mismo agrupamiento `bundlesByZone` del dashboard; no se agrega otro polling ni endpoint.

Stacker quedó guardado en `f11002b`. El cambio local siguiente hace que **Bay 1 sea temporalmente igual a Stacker**: abrir `bay-one-schematic.tsx` para ver que delega directamente a `StackerSchematic` con `title="Bay 1"`. No hay copia de coordenadas ni otro readout: ambos renderizan el mismo componente y snapshot. El título distingue las pestañas; Stackers (plural) sigue independiente. La distribución anterior de Bay 1 se puede consultar en el checkpoint, no en la pantalla nueva.

**Bay 2** ahora también reutiliza `MainSchematic`, con `variant="bay-2"`. Muestra sólo el sector derecho del Overview: RTTY1/2, IMRT2, SGRT1/2, NCCT1/2, IMRT1, ambas secciones CCH/SGRT A/B, báscula SGRT2 y Robot 2. Son 16 zonas visibles en lienzo 600 × 760. Omite Stackers y salidas RTOUT sin borrar datos de Tracking; mantiene FIFO, cinco filas CCH y el mismo peso. La traslación horizontal mueve el grupo completo, no asigna nuevas posiciones a bundles. El cambio es local y no debe atribuirse al servidor antes de desplegarlo.

Las LCH se omiten de los diagramas de operador, pero permanecen en el catálogo y pueden aparecer como destino manual si `/map` las habilita. CCH muestra cinco filas visibles con scroll, no una capacidad operativa máxima de cinco. `compactVisibleRows` controla presentación; `Capacity` pertenece al contrato del mapa.

`PlantMap` y `SchematicScreen` ajustan escala mediante `ResizeObserver`; cada diagrama mantiene coordenadas propias. “Motion” controla indicación visual, no pausa el polling ni maquinaria. `ROBOT_2_UNKNOWN` expresa falta de telemetría del robot, no confirma que esté detenido.

## 8. Quinto recorrido: selección global de producción e impresora

Abrir [components/mill-order-selection-panel.tsx](../components/mill-order-selection-panel.tsx). Aunque el nombre del archivo sea Mill Order, exporta `GlobalMillOrderPanel` y contiene también Destination y Printer.

Buscar `createTrackingApiClient`, los efectos de carga, `readyToUpdate`, `handleSubmit` y `handlePrinterSubmit`. Diferenciar dos tipos de estado: catálogo/selección activa leídos del backend y borrador elegido por el operador. Elegir una opción todavía no envía PUT.

El efecto de producción carga en paralelo catálogo de órdenes, orden activa, catálogo de destinos y destino activo. La impresora tiene una carga separada. No se refrescan todos los catálogos cada segundo junto con `state`; hay controles Refresh y lecturas posteriores al guardado.

Seguir `handleSubmit` sin pulsar el botón en vivo:

1. Comprueba valores elegidos, capacidades, estado live y ausencia de envío en curso.
2. Solicita confirmación.
3. Si cambió Destination, llama `updateGlobalDestination` con `{ destinationId }`.
4. Si cambió Mill Order, llama `updateGlobalMillOrder` con `{ millOrder }`.
5. Consulta ambas selecciones y comprueba que el backend reporta los valores esperados.
6. Si algo falla, intenta releer el estado activo y avisa de posible aplicación parcial.

Son dos escrituras separadas, **no una transacción atómica**. No hay rollback automático si se guardó la primera y falló la segunda.

`handlePrinterSubmit` manda `{ PrinterId }`, comprueba la respuesta y vuelve a consultar la impresora activa. Casing distinto es parte del contrato. Seleccionar impresora no imprime una etiqueta. La aplicación posterior a CREATE/PRINT_NEXT y la persistencia real son responsabilidad del servicio, no de `useState` ni del navegador.

## 9. Sexto recorrido: REMOVE y reposicionamiento en código

Abrir [components/tracking-bundles-panel.tsx](../components/tracking-bundles-panel.tsx). Encontrar `selectBundle`, `handleCommand`, `commandLocked`, `CommandStatus` y el efecto de verificación. No ejecutar una operación industrial como parte de esta explicación.

El panel conserva qué bundle se eligió y la acción (`remove` o `reposition`). El formulario mantiene Operator ID obligatorio: string no vacío tras `trim`, sin restricción a números ni comprobación de identidad corporativa. El comentario sigue visible, pero en el código local nuevo **es opcional sólo para REMOVE**: vacío/espacios produce `Reason: null`; texto no vacío se recorta. Reposition todavía requiere comentario; la corrección legacy también. Estos datos acompañan el comando para auditoría y no equivalen a login. Mostrar el valor real enviado en Network, sin rellenar un operador fijo ni motivo automático.

Los dos payloads comparten endpoint pero no semántica:

```json
{"TrackingId":"<tracking-id>","Operation":"REMOVE","OperatorId":"<operador>","Reason":null}
```

```json
{"TrackingId":"<tracking-id>","OperatorId":"<operador>","Reason":"<motivo>","CurrentZone":"<zona-destino>"}
```

Ambos usan `POST /api/tracking/correct`. El primer ejemplo muestra un retiro sin comentario; con comentario se envía un string recortado. La prueba directa v0.44 que respalda null está en [Estado de entrega](estado-entrega.md#prueba-directa-api-044-nulidad-de-campos-evento-237102), no valida todas las variantes del endpoint ni el despliegue del formulario. Reposition no envía `Operation: "MOVE"`. Cambia una posición reportada de Tracking; no debe presentarse como orden de mover físicamente material con motores.

### Confirmación y preflight

`commandLocked` es un ref que se activa antes de la confirmación para evitar doble envío local. Tras confirmar, se consultan status, capabilities y map en paralelo; después se consulta state. `manualPreflightProblem`, en [manual-position.ts](../lib/tracking-api/manual-position.ts), revalida el servicio, la capacidad de corrección, los escenarios, la identidad única y la posición frente a lo que se mostró al operador.

Para reposicionar también compara el destino habilitado, sus metadatos y ocupación reportada. `getRepositionZones` deriva opciones de `/map`; `reportedZoneOccupants` considera `CurrentZone` y, si existe como array, `OccupiedZones`. Esto detecta cambios de contexto, pero no sustituye interlocks, reglas industriales ni una comprobación física. No elimina la posibilidad de un cambio en backend entre el último GET y el POST.

Si falla el preflight, no se envía el comando. Si pasó, `removeBundle` o `repositionBundle` validan y sanitizan el payload; el proxy vuelve a validarlo. La respuesta se comprueba con `isTrackingCommandAcceptedDto` y se contrasta su `trackingId`.

### Aceptación y verificación son pasos diferentes

Después de `accepted: true`, el panel pasa a `pending`, informa `eventId` y consulta state cada dos segundos entre lecturas durante una ventana de 60 segundos. El código local confirma REMOVE por ausencia o registro único del mismo escenario con REMOVED, CurrentZone null y OccupiedZones explícitamente vacío. Reposition exige coincidencia única no removida en destino.

Un timeout, error de red o ciertos errores posteriores al envío pueden dejar `uncertain`: el comando pudo llegar. Se conserva el bloqueo y se ofrece verificar con GET, **no reenviar automáticamente el POST**. El nuevo `useTrackingCommandGate` comparte el lock entre acciones manuales y reset del Dashboard montado; no abarca otras PCs ni persiste tras recargar.

## 10. Caso real para enseñar diagnóstico: REMOVE aceptado, UI pendiente

La evidencia reportada para esta versión incluye el evento **154605**, `TrackingId: TRK-0000103919`, bundle **101637697**. Una consulta directa de state posterior mostró el registro conservado con:

```json
{
  "TrackingId": "TRK-0000103919",
  "BundleId": "101637697",
  "Status": "REMOVED",
  "CurrentZone": null,
  "OccupiedZones": []
}
```

Es evidencia histórica de `7fc34e8`, no garantía de que siga igual. Entonces la rama de remove de `manualOutcomeObserved` devolvía:

```ts
matches.length === 0
```

Si backend mantiene el registro terminal, la longitud sigue siendo uno: por eso la UI de `7fc34e8` no confirmó. El cambio local ahora admite el registro retenido bajo las condiciones estrictas de la sección 9. No afirmar que el backend nunca procesó el comando ni que la UI comprueba desocupación física PLC.

Abrir el helper actual y `scripts/test-bundle-lifecycle.mjs`: hay casos para ausencia, REMOVED retenido, posiciones residuales, duplicados y escenarios incorrectos. Lista y KPI excluyen removidos; preflight impide operar sobre ellos. Falta validar el cambio una vez desplegado; no reenviar un REMOVE anterior sólo para obtener una nueva captura.

Una consulta de lectura para inspeccionar ese caso, si procede en la sesión:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    $snapshot = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/tracking-api/api/tracking/state' -TimeoutSec 10
    if (-not ($snapshot.Bundles -is [array])) { throw 'No llegó el arreglo Bundles esperado.' }
    $snapshot.Bundles |
        Where-Object { $_.TrackingId -eq 'TRK-0000103919' } |
        Select-Object TrackingId, BundleId, Status, CurrentZone, OccupiedZones, LogicalBufferName, QueueSequence |
        ConvertTo-Json -Depth 6
}
```

No ver filas significa que el filtro no encontró el ID en esa lectura; no prueba por sí solo la cadena de efectos del comando ni su autoría. El endpoint de eventos recientes ofrece una ventana limitada, no necesariamente una auditoría histórica completa.

## 11. Cómo continuar un cambio después del training

### Recorrido adicional: reset de mantenimiento

Sólo leer el código: `components/tracking-reset-control.tsx` → `lib/tracking-api/tracking-reset.ts` → `TrackingApiClient.resetTracking` → POST del proxy. Desde el ajuste del 19 de octubre, el formulario exige marcar la casilla de autorización y pulsar el botón; ya no pide escribir RESET. Conserva el diálogo global nativo; después revalida servicio/capacidad/escenario/alcance y comparte lock con operaciones individuales. El POST no lleva cuerpo y mantiene el header `X-Tracking-Reset-Confirmation: RESET` hacia el proxy; el ACK trae RESET/eventId, no TrackingId obligatorio. Se verifica por GET; 202 y vacío inicial no prueban finalización. No ejecutarlo como demostración ni para desbloquear otro comando. Ver [procedimiento de reset](tracking-reset-commissioning.md).

### Desarrollo y empaquetado

El código se mantiene en `app/components/hooks/lib`, se verifica y luego se vuelve a empaquetar. El paquete standalone no se actualiza solo porque se edite un `.tsx` en el fuente. `next.config.mjs` usa `output: "standalone"`; `scripts/package-windows-standalone.ps1` construye el paquete y `deployment/windows/start.cmd` ejecuta `node server.js`.

En esta sesión no se corre el empaquetador: modifica archivos de build y release. No se edita `.next`, no se reemplaza la carpeta del proceso en uso y no se mata todo `node.exe`. El procedimiento de despliegue debe identificar versión, proceso y rollback por separado.

Para un cambio visual, empezar en el diagrama/componente. Para un campo nuevo de API, seguir `types → validation → client → consumidor`; si agrega endpoint, también el proxy. Para un comportamiento manual, cubrir `manual-position.ts`, panel, cliente, proxy y pruebas. Las recetas concretas están en [mapa-codigo.md](mapa-codigo.md).

Las regresiones se pueden explicar leyendo los scripts de FIFO, acciones manuales, integración, navegador y los nuevos `test-bundle-lifecycle.mjs`, `test-tracking-reset.mjs` y `test-tracking-reset-state.mjs`. No ejecutarlas contra planta ni convertir esta capacitación en pruebas operativas. Un resultado local previo no constituye aceptación del backend real.

## 12. Cierre técnico: comprobar que sí se transfirió conocimiento

Pedir al mantenedor que localice, sin ayuda:

1. La llamada que obtiene `state` y el validador que puede rechazar un HTTP 200.
2. El lugar donde `CurrentZone` se convierte en `bundlesByZone`.
3. El componente que decide el peso de SGRT2 y la altura visible de CCH.
4. El algoritmo que ordena FIFO sin usar BundleId.
5. El handler que guarda Destination antes de Mill Order y el riesgo de aplicación parcial.
6. La diferencia entre `removeBundle`, `repositionBundle` y `manualOutcomeObserved`.
7. El criterio histórico de pending y el nuevo criterio estricto para REMOVED retenido, sin borrar el snapshot.
8. El alcance global de reset, su confirmación, el lock compartido y por qué un 202 no certifica ejecución.

Si puede explicar ese recorrido, conoce la arquitectura útil para mantener el proyecto; no sólo sus carpetas. Separar al cerrar lo demostrado por lectura/código de las validaciones operativas pendientes y de cualquier cambio que se acuerde implementar después.

# Mapa de código y manual de mantenimiento

Referencia: rama `release/integrated-hmi`, base funcional `7fc34e8`, checkpoint documental `c7df85a` y **checkpoint de fuente del 13 de octubre de 2026, pendiente de despliegue**. El mapa incluye el nuevo filtro REMOVED, reset y layout compartido de Bundler; comprobar qué versión se abre en servidor antes de mostrarlos como funciones instaladas. Para el recorrido usar [Training de código fuente](handoff-session.md).

Fuente usado en el servidor: `C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8`. Aplicación existente: puerto 3000; proxy hacia MaterialTrackingService en 8085. Leer fuente no requiere reiniciar el runtime. Los ejemplos de código de este documento explican comportamiento; no son instrucciones para enviar comandos a planta.

## 1. Árbol de ejecución: seguir imports y props

```text
app/layout.tsx — RootLayout: documento, fuentes, CSS y Analytics en producción
app/page.tsx — Page
└─ components/dashboard.tsx — Dashboard [frontera "use client"]
   ├─ hooks/use-plant-state.ts — usePlantState
   │  ├─ hooks/use-tracking-api.ts — useTrackingApi
   │  │  └─ lib/tracking-api/client.ts — TrackingApiClient
   │  │     ├─ validation.ts + types.ts
   │  │     └─ fetch /tracking-api/api/...
   │  │        └─ app/tracking-api/[...path]/route.ts [servidor]
   │  │           └─ MaterialTrackingService :8085
   │  └─ lib/tracking-zone-layout.ts — groupTrackingBundlesByZone
   ├─ AppHeader — view, onViewChange, animationRunning, onToggleAnimation
   ├─ TrackingConnectionBanner — tracking, layoutValidation, onRetry
   ├─ KpiCards — tracking, kpis
   ├─ GlobalMillOrderPanel — tracking, config
   ├─ useTrackingCommandGate — bloqueo local de acciones manuales y reset
   ├─ TrackingBundlesPanel — tracking, config, onRefresh, commandGate
   ├─ TrackingResetControl — mantenimiento global, mismo commandGate
   └─ Vista elegida — tracking, bundlesByZone y props visuales
      ├─ PlantMap → MainSchematic
      ├─ StackersSchematic → SchematicScreen
      ├─ StackerSchematic → SchematicScreen → MainSchematic (variant="stacker")
      ├─ BundlerSchematic → SchematicScreen
      ├─ BayOneSchematic → SchematicScreen
      └─ BayTwoSchematic → SchematicScreen
         └─ TrackingZoneSlot → orderBundlesByLogicalFifo
```

`ScaleWeightReadout` se reutiliza desde `MainSchematic` y `BayOneSchematic`. `RobotCard` muestra contexto de Robot 2 desde `ROBOT_2_UNKNOWN`; no recibe telemetría del robot desde Tracking.

`@/` es el alias definido en `tsconfig.json` para la raíz del fuente. Un import como `@/lib/tracking-api` resuelve el barrel `lib/tracking-api/index.ts`, que reexporta cliente, configuración, fechas, runtime, tipos y validación. No es otro servicio ni una dependencia externa.

### Límite cliente/servidor

Los efectos de lectura, formularios y eventos de React corren en el navegador después del montaje. El Route Handler corre en Node. Los módulos puros de tipos, validación y helpers pueden importarse desde ambos lados. Los Client Components pueden formar parte del HTML inicial renderizado por Next; `"use client"` no elimina esa renderización inicial.

La UI no abre conexiones a SQL, QMOS ni PLC. Habla HTTP con Tracking mediante el proxy. El repositorio no contiene el backend industrial ni su motor de eventos. Una función del frontend no garantiza por sí sola un efecto en PLC o impresión.

## 2. Qué representa cada tipo de dato

| Símbolo | Archivo | Responsabilidad y distinción |
| --- | --- | --- |
| `TrackingStatusDto` | `lib/tracking-api/types.ts` | Servicio ejecutándose, versión backend y escenario; casing camelCase. |
| `TrackingCapabilitiesDto` | mismo | Listas de lecturas/comandos anunciados; no permisos por usuario. |
| `TrackingMapDto` / `TrackingZoneDto` | mismo | Catálogo backend de zonas, rutas, destinos y reglas opcionales. `IsEnabled` y `Capacity` no son coordenadas CSS. |
| `TrackingStateDto` | mismo | Snapshot: `ScenarioName`, `LastUpdateUtc`, `Bundles`. |
| `TrackedBundleDto` | mismo | Registro con identidad, zona, estados, peso y extensiones FIFO. Conserva casing backend. |
| `TrackingRuntimeState` | `lib/tracking-api/runtime.ts` | Snapshot más conexión, metadatos, error, hora de recepción y fallos consecutivos. Es estado del frontend. |
| `TrackingSyncStatus` | mismo | `mock`, `config-error`, `connecting`, `live`, `reconnecting`, `stale`, `offline`. No es `bundle.Status`. |
| `TrackingApiConfig` | `lib/tracking-api/config.ts` | Modo, URL pública, polling, stale, timeout y error de configuración. |
| `TrackingZoneName` | `lib/tracking-zone-layout.ts` | Unión derivada de claves del catálogo visual conocido. |
| `BundlesByZone` | mismo | Record de listas de bundles agrupadas por `CurrentZone`. No es mapa de posiciones mecánicas. |
| `PlantView` | `lib/types.ts` | Cinco IDs de pestañas. |
| `PlantTable`, `PlantKpis` | mismo | Modelos del modo visual/mock; no sustituir con ellos el DTO live ni sus KPI. |

`ExtensibleDto` permite propiedades adicionales como `unknown`. Eso facilita evolución aditiva, pero no vuelve seguro usar una extensión sin comprobar su forma. Por ejemplo, `OccupiedZones` se comprueba con `Array.isArray` antes de usarlo en los helpers manuales; no debe asumirse que todo campo extra ya fue validado por `isTrackedBundleDto`.

### Tres identificadores que no deben intercambiarse

- `TrackingId`: clave que mandan REMOVE y Reposition al servicio.
- `BundleId`: identificador mostrado preferentemente al operador.
- `L2Id`: respaldo visual cuando BundleId falta; no reemplaza TrackingId en el comando.

`QueueSequence` es orden de entrada en un buffer lógico, no un ID de bundle ni posición física. `DisplayOrder` ordena metadatos de zonas; tampoco equivale a FIFO.

## 3. Transporte HTTP: un lugar para cada responsabilidad

### Configuración: `lib/tracking-api/config.ts`

`getTrackingApiConfig` lee variables públicas, normaliza la base y valida enteros de intervalo. Predeterminados: polling 1000, stale 3500 y timeout 4000 ms. Sin modo explícito se usa mock para desarrollo; un modo inválido se reporta como error de configuración, no debe presentarse como reconexión exitosa a live.

`NEXT_PUBLIC_TRACKING_API_URL=/tracking-api` mantiene las peticiones del navegador en el mismo origen. El cliente agrega paths de contrato que empiezan con `/api/`. `TRACKING_API_PROXY_TARGET` es privado de Node y debe señalar al servicio real; no es un secreto que deba copiarse a una variable `NEXT_PUBLIC_*`.

Las variables públicas se fijan durante el build. El archivo `.env.example` es plantilla, no evidencia de qué valores quedaron dentro del build existente. El proxy permite lecturas y escrituras restringidas: el Route Handler implementa GET, POST y PUT sobre una lista de rutas permitidas; esa lista no sustituye autenticación.

### Cliente: `lib/tracking-api/client.ts`

`createTrackingApiClient(options)` crea `TrackingApiClient`. El constructor acepta `baseUrl`, `timeoutMs`, `fetchImpl` y cabeceras opcionales. Inyectar fetch permite probar el transporte sin depender de una planta. El timeout interno predeterminado del cliente es 10000 ms, pero el hook normalmente pasa el valor de configuración de 4000 ms.

`request<T>` concentra fetch, aborto, timeout, parseo, status HTTP y validador. Los métodos `get`, `post` y `put` reutilizan ese camino. `ApiError.kind` distingue `http`, `timeout`, `aborted`, `network`, `invalid-json` e `invalid-payload`. El cliente no sabe cómo pintar un banner ni cómo cerrar un formulario.

La respuesta sólo se devuelve si pasa su guard de runtime. `TrackingStateDto` es tipo de programación; `isTrackingStateDto` es la comprobación ejecutable. No resolver una incompatibilidad reemplazando el guard por `as TrackingStateDto`: eso oculta el defecto en lugar de compatibilizar el contrato.

### Proxy: `app/tracking-api/[...path]/route.ts`

`GET`, `POST` y `PUT` son handlers independientes. `RouteContext` contiene `params` como Promise, por lo que el código usa `await context.params`. `getProxyTarget` acepta HTTP(S), rechaza credenciales embebidas y prepara el destino. `jsonError` produce errores del proxy con no-store.

El GET utiliza `STATIC_READ_ENDPOINTS` más una expresión para bundle por ID. El POST permite `/api/tracking/correct` y el reset explícito `/api/tracking/reset`; el PUT, las tres selecciones globales. El proxy reconstruye payloads de corrección sin combinaciones ambiguas. Reset exige header `X-Tracking-Reset-Confirmation: RESET`, rechaza Origin incompatible, query y cuerpo; reenvía un POST sin payload. Es una barrera de intención, no autenticación. No habilita escrituras OPC, inyección de eventos ni impresión QMOS.

La allowlist es una restricción técnica, no una identidad de operador. El proyecto actual no implementa login/roles corporativos en esos handlers. Proteger red, acceso al HMI y comandos backend sigue siendo una decisión de infraestructura y del servicio.

## 4. Matriz verificable de endpoints y métodos

Los paths de esta tabla son del backend; el navegador antepone `/tracking-api`. Las funciones están en `TrackingApiClient` salvo indicación contraria.

| Endpoint | Método del cliente | Tipo/validador principal | Consumidor actual |
| --- | --- | --- | --- |
| GET `/api/tracking/status` | `getStatus` | `TrackingStatusDto` / `isTrackingStatusDto` | Bootstrap y preflight manual. |
| GET `/api/tracking/capabilities` | `getCapabilities` | `TrackingCapabilitiesDto` / `isTrackingCapabilitiesDto` | Bootstrap y preflight manual. |
| GET `/api/tracking/map` | `getMap` | `TrackingMapDto` / `isTrackingMapDto` | Bootstrap, validación layout, destinos manuales. |
| GET `/api/tracking/state` | `getState` | `TrackingStateDto` / `isTrackingStateDto` | Polling, preflight y verificación manual. |
| POST `/api/tracking/reset` | `resetTracking` | `TrackingResetAcceptedDto` / `isTrackingResetAcceptedDto` | `TrackingResetControl`; sin cuerpo, acuse RESET y verificación separada. |
| GET `/api/tracking/bundles/{id}` | `getBundle` | `TrackedBundleDto` / `isTrackedBundleDto` | Disponible para consultas; la lista principal usa state. |
| GET `/api/qmos/mill-orders?max=...` | `getQmosMillOrders` | `QmosMillOrdersResponseDto` / `isQmosMillOrdersResponseDto` | Catálogo de órdenes. Normaliza array o wrapper a `{ value, Count }`. |
| GET `/api/qmos/bundle-locations` | `getQmosBundleLocations` | `QmosBundleLocationsResponseDto` / su guard | Catálogo Destination; normaliza `id/description` o `Id/Description`. |
| GET `/api/qmos/printers` | `getQmosPrinters` | `QmosPrinterDto[]` / `isQmosPrintersDto` | Catálogo Printer. |
| GET `/api/tracking/mill-order` | `getGlobalMillOrder` | `GlobalMillOrderDto` / su guard | Selección activa y verificación. |
| PUT `/api/tracking/mill-order` | `updateGlobalMillOrder` | Request `{ millOrder }`; `GlobalMillOrderUpdateResponseDto` | `handleSubmit`. |
| GET `/api/tracking/destination` | `getGlobalDestination` | `GlobalDestinationDto` / su guard | Selección activa y verificación. |
| PUT `/api/tracking/destination` | `updateGlobalDestination` | Request `{ destinationId }`; respuesta `GlobalDestinationDto` | `handleSubmit`. |
| GET `/api/tracking/printer` | `getGlobalPrinter` | `GlobalPrinterDto` / su guard | Impresora activa y verificación. |
| PUT `/api/tracking/printer` | `updateGlobalPrinter` | Request `{ PrinterId }`; `GlobalPrinterUpdateResponseDto` | `handlePrinterSubmit`. |
| POST `/api/tracking/correct` | `removeBundle` | `TrackingRemovalRequestDto`; `TrackingCommandAcceptedDto` | `handleCommand`, acción remove. |
| POST `/api/tracking/correct` | `repositionBundle` | `TrackingRepositionRequestDto`; `TrackingCommandAcceptedDto` | `handleCommand`, acción reposition. |
| POST `/api/tracking/correct` | `correctBundle` | `TrackingCorrectionRequestDto` con `MillOrder1` | Camino de cliente/proxy disponible; no es el formulario de reposicionamiento. |
| GET `/api/tracking/events/recent` | `getRecentEvents` | `TrackingEventsResponseDto` / `isTrackingEventsResponseDto` | Diagnóstico disponible; no es un historial completo dibujado por el Dashboard. |
| GET `/api/tracking/opc` | `getOpcStatus` | `OpcStatusDto` / `isOpcStatusDto` | Diagnóstico disponible; no controla PLC desde la UI. |
| GET `/api/qmos/status` | `getQmosStatus` | `QmosStatusDto` / `isQmosStatusDto` | Diagnóstico disponible. |

No deducir que un endpoint se consulta periódicamente sólo porque hay un método en el cliente. El polling habitual del Dashboard se centra en `state`; las cargas de paneles y el preflight tienen disparadores distintos.

## 5. Lectura periódica: dónde buscar cada comportamiento

En `hooks/use-tracking-api.ts`:

| Símbolo | Qué revisar al mantenerlo |
| --- | --- |
| `initialRuntimeState` | Estado antes de recibir datos; no fabricar un snapshot live inicial. |
| `assertScenarioMatches` | Evita mezclar status/map/state de escenarios incompatibles. |
| `retryDelay` | Espera exponencial con jitter y máximo 30000 ms; no limita el número total de reintentos. |
| `useTrackingApi` / primer `useEffect` | Dueño del bucle y sus variables de vida útil. |
| `run` | Bootstrap secuencial y GET normal de state; en error reinicia bootstrap. |
| `commitState` | Guarda snapshot, hora de recepción, hora del backend y estado live. |
| `retry` | Incrementa `retryRevision`; el efecto anterior se limpia y comienza otra carga. |
| Cleanup del efecto | Cancela temporizador y AbortController; evita respuestas tardías tras desmontar. |
| Segundo `useEffect` | Marca antigüedad al vencer stale incluso sin esperar a que falle el fetch. |

`lastSuccessfulPollAt` es cuándo se recibió correctamente. `sourceUpdatedAt` viene de `LastUpdateUtc`. Preservar ambos: sirven para preguntas distintas. Mostrar datos anteriores con badge stale es deliberado; reemplazarlos por Empty simularía una planta vacía.

`hooks/use-plant-state.ts` conecta ese runtime con los consumidores. Su `bundlePlacement` usa `useMemo` y `groupTrackingBundlesByZone`; `trackingLayoutValidation` compara el mapa conocido sólo para `TX1_TAGGER_TRACKING`. La lógica mock de ese archivo es una rama distinta; no se activa automáticamente ante fallos live.

## 6. Renderizado de las cinco vistas

### Navegación y contenedores

`components/app-header.tsx`: `TABS`, `ViewTabs` y `AppHeader`. `components/dashboard.tsx`: estado `view` y render condicional. Para añadir otra pestaña habría que extender `PlantView`, declarar la pestaña y renderizar su componente; no basta con cambiar el label del menú.

`components/plant/plant-map.tsx`: `PlantMap` envuelve el overview y llama `MainSchematic`; su `ResizeObserver` limita escala entre 0.95 y 1.3. `components/plant/schematic-screen.tsx`: `SchematicScreen` es el marco compartido de las vistas detalladas, con mínimo 0.9 y `maxScale` por defecto 1.45 (Bundler y Stacker singular usan 1.3), encabezado, badge y leyenda. Mantienen scroll horizontal cuando el lienzo no cabe.

### Geometría que se mantiene a mano

| Pantalla | Archivo y símbolos concretos | Cambio típico |
| --- | --- | --- |
| Overview | `main-schematic.tsx`: `MainSchematic`, `MAIN_SCHEMATIC_WIDTH`, `MAIN_SCHEMATIC_HEIGHT`, `BUNDLER_ROW_TOP`, `MachineOutline`, `HorizontalSequence`, `VerticalSection` | Mover grupos, ajustar alineación y flechas. `BUNDLER_ROW_TOP` ya relaciona contenedor y transferencias Bundler. |
| Stackers | `stackers-schematic.tsx`: `SOURCE_POSITIONS`, `COMMON_LINE_POSITIONS`, `EXIT_POSITIONS`, `ZoneSlot` | Coordenadas de fuentes, línea común, NCCT/IMRT1. |
| Stacker (singular, nueva) | `stacker-schematic.tsx`: `StackerSchematic` llama `MainSchematic` con `variant="stacker"`; `main-schematic.tsx`: `STACKER_TOP_OFFSET`, `STACKER_SCHEMATIC_WIDTH`, `STACKER_SCHEMATIC_HEIGHT` | 13 zonas ERT/STRT/LFRT/SGRT/NCCT y báscula. Omite Bundler, RTTY, IMRT y secciones Bay 2; traslada las zonas retenidas juntas 320 px hacia arriba en lienzo 1104 × 440. No reemplaza Stackers ni modifica CurrentZone. |
| Bundler | `bundler-schematic.tsx`: `BundlerSchematic` llama `MainSchematic` con `variant="bundler"`; `main-schematic.tsx`: `BUNDLER_LEFT_OFFSET`, `BUNDLER_SCHEMATIC_WIDTH` | Overview sin la rama ERT/STRT/LFRT. Traslada el conjunto restante 480 px, conserva relaciones y usa lienzo 1000 × 760. El Overview predeterminado sigue en 1480 × 760. |
| Bay 1 | `bay-one-schematic.tsx`: `BayOneSchematic`, `EquipmentContext`, `Zone` | SGRT/NCCT y contexto de báscula/manual station. |
| Bay 2 | `bay-two-schematic.tsx`: `STK_ROUTE_ZONES`, `FINAL_ROUTE_ZONES`, `LaneFlowArrows`, `Zone` | Dos rutas A/B, dimensiones CCH y transferencias ilustrativas. |
| Primitivas de detalle | `zoom-schematic-primitives.tsx`: `DiagramArrow`, `EquipmentHeader` | Estilo común de flechas y títulos de equipo. |

Todos reciben datos, no calculan el próximo destino industrial. Cambiar `left/top` sólo mueve una tarjeta en pantalla. No cambia `CurrentZone` ni crea una ruta backend.

### Tarjeta común: `TrackingZoneSlot`

Archivo `components/plant/tracking-zone-slot.tsx`. Props relevantes: `zoneName`, `bundles`, `compact`, `compactVisibleRows`, `hasSnapshot`, `className`, `style`.

Calcula `fifo = orderBundlesByLogicalFifo(bundles)` y renderiza `fifo.bundles`; decide si está ocupada y si hay espera QMOS, muestra count e identidades. Los atributos `data-zone-name`, `data-tracking-id`, `data-fifo-buffer` y `data-queue-sequence` permiten correlacionar el DOM con datos reales sin depender del texto truncado.

`compactVisibleRows={5}` reserva cinco filas visibles y permite overflow; no descarta la sexta ni cambia capacidad. El overview lo decide para nombres que comienzan con CCH; Bay 2 lo declara como `visibleRows: 5` en ambos arreglos de rutas.

Los KPI se calculan aparte en `components/kpi-cards.tsx`: cantidad total del array Bundles, cantidad de CurrentZone distintos no vacíos, zonas habilitadas del mapa y número de UNMATCHED. Es posible que esos números no coincidan con tarjetas visibles, porque el layout omite LCH y state puede conservar registros sin zona o terminales. No corregir diferencias ocultando datos sin acordar semántica.

### Peso: `ScaleWeightReadout`

En `components/plant/scale-weight-readout.tsx`: props `bundles`, `hasSnapshot`, `compact`. Los llamadores de overview y Bay 1 seleccionan SGRT2; el componente muestra cada `Weight` por identidad. El peso de un catálogo `QmosMillOrderDto.Weight` es otro dato y no debe conectarse a este readout por compartir nombre.

## 7. Algoritmo FIFO: razonar antes de modificar

Archivo `lib/tracking-fifo.ts`. `getFifoMembership` acepta `LogicalBufferName` string no vacío tras trim y `QueueSequence` con `Number.isSafeInteger`. El código no impone signo positivo: no documentar una restricción que no implementa.

`orderBundlesByLogicalFifo` guarda los índices originales de cada buffer. Ordena sólo sus miembros y repone esos miembros en los mismos índices. Ejemplo conceptual dentro de una zona:

```text
Entrada:  X(sin FIFO), A(seq 9), B(seq 3), A(seq 2), B(seq 1)
Salida:   X(sin FIFO), A(seq 2), B(seq 1), A(seq 9), B(seq 3)
```

`A` y `B` representan nombres de buffers diferentes, no rutas A/B físicas. No se mezclan grupos ni se arrastra X al final. Empates conservan orden recibido; los flags `hasFifoMembers`, `hasUnorderedMembers` y `hasDuplicateSequences` permiten a la tarjeta explicar datos parciales.

El validador de DTO permite números finitos y nulos para compatibilidad; la elegibilidad FIFO exige además entero seguro. Un decimal puede atravesar la validación de shape y no participar en el orden. Esa separación debe mantenerse o cambiarse de manera explícita, con pruebas del contrato.

La muestra histórica de CCH2A con ambos campos nulos no valida ni refuta por sí sola el algoritmo. Para aceptación real se necesitan membresías y secuencias suministradas por backend. No inventar un orden de entrada con `CreatedUtc`, `BundleId` o el orden de lectura.

## 8. Selecciones globales: lectura, borrador, escritura, confirmación

En `components/mill-order-selection-panel.tsx`, `GlobalMillOrderPanel` conserva catálogos, valores activos y selección local en estados distintos. `readyToUpdate` y `readyToUpdatePrinter` controlan elegibilidad visual. `hasCapability` acepta rutas anunciadas con o sin prefijo HTTP para Mill Order/Destination; la carga de impresora consulta sus endpoints directamente.

`handleSubmit` ejecuta Destination cambiada antes de Mill Order cambiada. Después verifica ambas mediante GET. `refreshActiveValuesAfterFailure` intenta reconciliar valores si hubo error. Que el formulario agrupe dos campos no crea transacción, atomicidad ni exclusión entre operadores.

`handlePrinterSubmit` usa `updateGlobalPrinter`, valida acknowledgment y lee `getGlobalPrinter`. El request usa `PrinterId`; la respuesta de PUT usa `printerId`, `printerName`, `updatedUtc`, `appliesTo`. El GET usa `PrinterId`, `PrinterName`, `UpdatedUtc`. Esa diferencia está descrita por tipos y guards específicos, no por un transformador genérico.

Para investigar un guardado no visible, comprobar: catálogo elegido, request exacto en Network, response HTTP/JSON y GET posterior. El state periódico no reemplaza ese GET global. No utilizar una nueva selección para diagnosticar sólo lectura si afectaría siguientes operaciones.

## 9. Acciones manuales: responsabilidades separadas

### Panel y estados

`components/tracking-bundles-panel.tsx` exporta `TrackingBundlesPanel`. Recibe `tracking`, `config`, `onRefresh` y `commandGate`. `displayIdentity` sólo decide el texto; `selectBundle` prepara acción y formulario. `handleCommand` organiza confirmación, preflight, envío y paso a verificación. `getActiveBundles` excluye removidos del listado; la verificación sigue leyendo el snapshot completo.

`CommandStatus` distingue `idle`, `checking`, `sending`, `pending`, `uncertain`, `success`, `error`. `commandLocked` evita doble envío; `useTrackingCommandGate`, creado en Dashboard, coordina acciones manuales y reset de esa página. No es un lock distribuido y se pierde al recargar. `verificationPaused` y `verificationRevision` permiten pausar/reanudar GET sin repetir el comando. `VERIFICATION_WINDOW_MS` vale 60000.

`commandMayHaveBeenAccepted` trata timeout/red/respuesta ilegible y errores HTTP como 408/5xx como posibles resultados inciertos. Un botón inhabilitado tras eso evita repetir una escritura cuyo resultado no se conoce. No resolverlo quitando el lock o recargando para reenviar.

### Reglas puras: `lib/tracking-api/manual-position.ts`

| Símbolo | Contrato de programación |
| --- | --- |
| `ManualTrackingAction` | `remove` o `reposition`; estado de UI, no literal de Operation backend. |
| `supportsManualCorrection` | Comprueba anuncio de `/api/tracking/correct` en capabilities. |
| `getRepositionZones` | Zonas habilitadas con nombre válido y único; orden por DisplayOrder y nombre. Incluye LCH si el mapa las habilita. |
| `reportedZoneOccupants` | IDs reportados en CurrentZone o array OccupiedZones; sirve para detectar cambio, no para certificar presencia física. |
| `manualPreflightProblem` | Devuelve motivo de bloqueo si cambió/invalidó el contexto; no envía HTTP. |
| `manualOutcomeObserved` | Decide si un state posterior satisface el criterio actualmente implementado. |

El preflight toma status/capabilities/map frescos en paralelo y state al final. Compara escenario, identidad única y posición del seleccionado contra lo mostrado. Para reposition también verifica zona habilitada, configuración del destino y ocupación reportada sin cambios. No implementa por sí mismo todos los límites de Capacity ni las reglas de rutas/PLC.

`positionSignature` compara identidad, CurrentZone y zonas ocupadas; no usa LastUpdateUtc como único criterio, evitando invalidar por cualquier cambio irrelevante en otros datos. El backend sigue siendo responsable del efecto y de la concurrencia después del último GET.

### Transporte de comandos

`removeBundle`: `TrackingRemovalRequestDto`, Operation exactamente REMOVE, cuatro campos sanitizados. `repositionBundle`: `TrackingRepositionRequestDto`, CurrentZone, sin Operation ni MillOrder1. Los guards rechazan payloads incompatibles y el proxy evita mezclarlos con `TrackingCorrectionRequestDto`, que representa el otro camino con MillOrder1.

`OperatorId` y `Reason` se validan como strings no vacíos, no como credenciales ni empleados verificados. v0.39 exige ambos explícitamente para REMOVE; v0.6 exige operador en correcciones, mientras Reason en reposicionamiento aparece en el ejemplo. No extrapolar obligación contractual de Reason a todos los casos. La implementación mantiene ambos requeridos hasta acordar los cambios solicitados, sin valores ficticios. Un rechazo previo por stale/preflight no acredita que “a1 no es válido”: comprobar si hubo POST.

## 10. Ciclo de vida REMOVED y reset: ajuste local frente a evidencia histórica

Después del evento 154605, la evidencia de `7fc34e8` para `TRK-0000103919` / bundle `101637697` mostró REMOVED, CurrentZone null y OccupiedZones vacío, **con el registro aún en Bundles**. En esa versión REMOVE sólo confirmaba si `matches.length === 0`.

Consecuencias concretas de `7fc34e8`:

1. El panel puede continuar pending/pausar verificación aunque backend reporte el estado terminal.
2. El listado y KPI pueden seguir contando ese registro; no tienen filtro por REMOVED.
3. El preflight no contiene una política completa de elegibilidad por estado terminal. No volver a seleccionar ese registro para “forzar” la confirmación.
4. La evidencia JSON no certifica de manera independiente PLC, señal física ni auditoría completa.

**Cambio local posterior:** `lib/tracking-api/bundle-lifecycle.ts` centraliza `isRemovedBundle` (trim/mayúsculas, sólo REMOVED) y `getActiveBundles` (proyección sin mutar). Agrupación de zonas, lista, KPI, banner, tarjeta y báscula excluyen removidos. Raw state se conserva para preflight/verificación. `reportedZoneOccupants` conserva incluso huellas inconsistentes de removidos para no relajar controles.

`manualPreflightProblem` impide actuar sobre una selección removida, incluso si se removió después de mostrarla. `manualOutcomeObserved` admite ausencia o un único registro del mismo escenario con REMOVED, zona exactamente null y array OccupiedZones explícito vacío. Reposition exige registro único no removido en destino. Los casos incoherentes permanecen sin confirmar; esto no prueba PLC/auditoría.

### Reset global separado

- `components/tracking-reset-control.tsx` → `TrackingResetControl`: escribir RESET, casilla de autorización operativa y confirmación global nativa; estado de envío/acuse/verificación.
- `lib/tracking-api/tracking-reset.ts` → `supportsTrackingReset`, `resetPreflightProblem`, `resetOutcomeObserved`: disponibilidad anunciada, preflight fresco de escenario/alcance y observación posterior; vacío inicial no prueba ejecución.
- `hooks/use-tracking-command-gate.ts` → `useTrackingCommandGate`: lock local compartido manual/reset; no identidad ni lock backend.
- `TrackingApiClient.resetTracking` → POST sin cuerpo → proxy → `/api/tracking/reset`. Acuse 202/accepted/eventId/eventType RESET, sin TrackingId requerido; no equivale a éxito final.

No se reenvía automáticamente un reset incierto. Leer [commissioning de reset](tracking-reset-commissioning.md) antes de una prueba; el desarrollo local no ejecutó un reset industrial.

## 11. Recetas de cambios comunes: por dónde empezar y qué comprobar

Estas recetas describen desarrollo posterior, no modificaciones en caliente durante la capacitación.

### A. Mover Bundler o una tarjeta sin tocar Tracking

1. Abrir el diagrama exacto, no el proxy. Para overview: `MainSchematic`, `BUNDLER_ROW_TOP` y coordenadas de `MachineOutline`/`HorizontalSequence`.
2. Ajustar en conjunto tarjetas y flechas relacionadas; recordar dimensiones del lienzo y escalado del contenedor.
3. No cambiar nombres de zonas para conseguir alineación. Verificar que cada `Zone` recibe el mismo `bundlesByZone[name]`.
4. Revisar las cinco vistas afectadas y scroll a la resolución real del operador. Datos deben coincidir con el mismo snapshot, antes y después del cambio visual.

### B. Cambiar de cinco a otra cantidad de filas visibles CCH

1. `main-schematic.tsx`: valor pasado a `compactVisibleRows` por el helper `Zone`.
2. `bay-two-schematic.tsx`: `visibleRows` de `STK_ROUTE_ZONES` y `FINAL_ROUTE_ZONES`.
3. `tracking-zone-slot.tsx`: comprobar cálculo de alto y scroll; normalmente no hace falta cambiar la API.
4. Revisar que siguen estando todas las filas y que flechas/contenedores no se superponen. No renombrar este número como Capacity.

### C. Incorporar otro dato real de bundle

1. Obtener nombre, tipo, nulabilidad y ejemplo real del contrato. No asumir que el valor vive en el catálogo de órdenes sólo por tener nombre parecido.
2. Añadir/comprobar propiedad en `TrackedBundleDto` y su guard en `isTrackedBundleDto`. Definir comportamiento con backend anterior si es opcional.
3. Si viene en state, `getState` ya transporta el DTO: no hace falta otro fetch por tarjeta.
4. Pasarlo/leerlo en el componente responsable; distinguir `0`, null, falta de snapshot y dato stale.
5. Cubrir forma válida/inválida/nula y visualización. Evitar convertir null a cero o inventar unidades.

### D. Añadir un endpoint o selección nueva

1. `types.ts`: request/response de wire con casing real.
2. `validation.ts`: guards runtime, nulabilidad y restricciones del contrato.
3. `client.ts`: método con path y validator; sanitizar escritura.
4. Proxy: ampliar allowlist sólo para método/path requeridos y validar cuerpo.
5. Componente dueño: catálogo/activo/borrador, carga y error, confirmación, envío, verificación posterior.
6. Acordar si respuesta es síncrona o accepted asincrónico; no copiar un patrón incorrecto. Probar fallos parciales y duplicación antes de desplegar.

### E. Agregar una zona física a las vistas

1. Confirmar `/map`: nombre exacto, habilitación y semántica.
2. `TRACKING_ZONE_LAYOUT`: metadatos, grupo y pantallas pertinentes; `TrackingZoneName` se deriva del catálogo.
3. Darle coordenadas en overview y vistas correspondientes. El mapa backend no genera automáticamente el dibujo.
4. Revisar `validateTrackingLayout` y las listas por grupo. No remapear zonas desconocidas a la “más parecida”.
5. Verificar agrupación, búsqueda/listado, FIFO si aplica y destino manual derivado del mapa. No añadir la zona sólo para ocultar una discrepancia de escenarios.

### F. Ajustar el pending de REMOVE retenido

1. Capturar state/ack representativos y acordar semántica terminal; no repetir el comando para obtener evidencia.
2. Revisar `manualOutcomeObserved`, `manualPreflightProblem` y elegibilidad UI; no limitar la revisión al texto del mensaje.
3. Evaluar listado y KPI separadamente: confirmar retiro no significa borrar registros del snapshot artificialmente.
4. Añadir pruebas para ausencia, REMOVED retenido, zonas no liberadas, duplicados, escenario distinto y timeout incierto.
5. Validar el ajuste local contra API real en ventana acordada y con bundle autorizado. Documentación o pruebas locales no sustituyen ese commissioning.

## 12. Diagnóstico por síntoma: evidencia antes de cambiar código

| Síntoma | Dónde mirar primero | Diferencia importante |
| --- | --- | --- |
| Página no responde | Proceso/puerto HMI, logs del runtime | Todavía no es un problema de DTO ni de PLC. |
| Página abre, proxy devuelve 502/503 | Handler, destino privado, servicio 8085 | Rechazo/configuración o conexión del servidor al backend. |
| HTTP 200 y “incompatible response shape” | Response + guard específico | HTTP válido no garantiza contrato válido. |
| Tarjetas conservan bundles y banner stale | `useTrackingApi`, timestamps y error | Conservación del último snapshot; no planta congelada confirmada. |
| Bundle en listado pero no en dibujo | CurrentZone, catálogo y ocultación LCH | Puede estar sin zona, desconocido o terminal; no ubicarlo por ID. |
| FIFO no cambia | LogicalBufferName/QueueSequence del mismo snapshot | Sin membresía válida no hay orden confiable que mostrar. |
| Peso vacío | Bundle exacto en SGRT2 y su Weight | SGRT2A/B y peso de Mill Order son otros conceptos. |
| Botón manual no envía | live/capabilities, campos, confirmación y preflight | Un bloqueo previo puede explicar Network vacío. |
| POST 202 pero pending | Ack, state posterior, `manualOutcomeObserved` | Aceptado no es completado; revisar también REMOVED retenido. |
| No aparece evento reciente | Ventana y formato de events/recent | Ausencia en esa ventana no acredita ausencia de auditoría histórica. |

Los datos de Network y capturas pueden contener información de producción. Compartir sólo evidencia necesaria por canales autorizados; no subir dumps, `.env.local` ni identificadores del entorno por defecto al repositorio de entrega.

## 13. Build y pruebas: distinguir fuente, artefacto y ejecución

`package.json` declara Next 16.3.0, React/React DOM 19.2.4 y TypeScript 5.7.3. Algunas dependencias usan rangos; `pnpm-lock.yaml` fija la resolución instalada. El script `typecheck` ejecuta `tsc --noEmit --incremental false`. El script `lint` existe, pero este package.json no declara ESLint: no presentarlo como check instalado y aprobado sin verificarlo.

`next.config.mjs` usa standalone. `scripts/package-windows-standalone.ps1` compila live, copia el runtime/dependencias necesarias, estáticos y archivos Windows; escribe metadata `RELEASE.txt` y crea ZIP. Reemplaza la carpeta de release de salida: no ejecutarlo como diagnóstico ni mientras esa misma carpeta esté en uso.

`deployment/windows/start.cmd` entra a su propia carpeta, usa por defecto PORT 3000 y backend localhost:8085, fija HOSTNAME=0.0.0.0 y llama `node server.js`. No instala un servicio Windows ni asegura por sí solo reinicio automático del servidor. Esta base no contiene los helpers adicionales de servicio del kit separado.

Pruebas disponibles, para leer durante la sesión y ejecutar únicamente en un entorno de desarrollo/controlado conforme a sus instrucciones:

| Archivo | Comportamiento que cubre |
| --- | --- |
| `scripts/test-fifo-ordering.mjs` | Orden lógico, datos parciales y preservación de grupos. |
| `scripts/test-manual-position.mjs` | Preflight, destinos, ocupación y reglas puras manuales. |
| `scripts/test-bundle-lifecycle.mjs` | Filtro REMOVED, renderizado, snapshot intacto, huellas inconsistentes y resultados manuales. |
| `scripts/test-tracking-reset.mjs` | Transporte/proxy/acuse de reset sin cuerpo y rechazos de contrato. |
| `scripts/test-tracking-reset-state.mjs` | Preflight y observación de estado de reset. |
| `scripts/test-manual-removal.mjs` | Contrato y flujo de retiro. |
| `scripts/test-manual-reposition.mjs` | Contrato y flujo de reposicionamiento. |
| `scripts/test-integrated-tracking.mjs` | Convivencia de las funciones integradas. |
| `scripts/test-manual-actions-ui.mjs` | Flujo en navegador, confirmación, bloqueo y verificación. |
| `scripts/tracking-api-test-helpers.mjs` | Infraestructura de pruebas compartida. |

La regresión de ciclo de vida incluye ahora REMOVED retenido, huella residual, ausencia, identidad duplicada y escenario incorrecto. Los resultados de la suite completa deben registrarse al verificar el cambio final. Éxito de pruebas/TypeScript/build no acredita commissioning real ni compatibilidad de todos los estados futuros.

La entrega Git debe contener fuente y documentación revisados, no `.git` del autor, `.env.local`, `node_modules`, `.next`, dumps ni artefactos personales. El ZIP fuente y el runtime son productos diferentes; relacionarlos por commit y metadata, no sólo por nombre de archivo. Ver [Entrega Git](entrega-git.md) y [Despliegue Windows](windows-standalone-deployment.md) antes de una publicación posterior al training.

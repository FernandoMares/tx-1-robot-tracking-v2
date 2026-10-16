# Integración con Tracking API

Referencia para mantener el cliente HTTP, el proxy y la presentación de datos. Complementa el [recorrido del código](handoff-session.md), el [simulador local](tracking-api-simulator.md) y el [estado de entrega](estado-entrega.md).

## Alcance integrado y procedencia

**Rama actual: `release/integrated-hmi`.** Base funcional desplegada documentada `7fc34e8`, checkpoint documental anterior `c7df85a`. El checkpoint de fuente del 13 de octubre de 2026 incluye filtro de removidos, confirmación de REMOVE retenido, reset de mantenimiento y layout compartido de Bundler; estos ajustes aún no están desplegados. En la evidencia del servidor, el fuente era `C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8`, HMI **3000**, Tracking **8085**. Las filas siguientes identifican procedencia histórica, no prueban qué versión está ejecutándose ahora.

| Fuente | Funciones incluidas |
| --- | --- |
| Integrado `7fc34e8`, último despliegue documentado en 3000 | Reúne la base funcional, FIFO, REMOVE, reposicionamiento y regresiones combinadas; sin los nuevos cambios locales. |
| Base `600d20f` | Lecturas de Tracking; selecciones globales de Mill Order, Destination e impresora; cliente técnico de corrección `MillOrder1`. |
| FIFO histórico `77f79bf`, que precedió al integrado en 3000 | Base más campos opcionales FIFO y orden de tarjetas de zona. No incluye UI de retiro ni reposicionamiento. |
| Manual `5338300`, antecedente incorporado al integrado | Añade `REMOVE` y reposicionamiento por `CurrentZone`. El release manual histórico `ce3c8a9` sólo incorporaba REMOVE. |
| Kit de entrega preparado en la raíz | Documentación y mejoras de empaquetado/servicio que no deben atribuirse automáticamente al commit FIFO. |

La versión de backend reportada actualmente es v0.42. El HMI conserva `apiVersion` como dato diagnóstico: no compara rígidamente contra un número. La compatibilidad real depende de capacidades, campos y validadores.

## Arquitectura y configuración

```text
Navegador → /tracking-api → Route Handler de Next.js → MaterialTrackingService
```

La ruta de mismo origen evita que el navegador tenga que alcanzar directamente el backend o resolver CORS entre puertos. El servidor HMI debe tener conectividad al destino privado. RDP no crea un túnel.

| Variable | Valor habitual | Función |
| --- | --- | --- |
| `NEXT_PUBLIC_PLANT_DATA_MODE` | `mock` en desarrollo por defecto | Selecciona `mock` o `live`. |
| `NEXT_PUBLIC_TRACKING_API_URL` | `/tracking-api` | Base usada por el navegador. |
| `TRACKING_API_PROXY_TARGET` | `http://localhost:8085` | Destino privado usado por Node; localhost es el servidor HMI. |
| `NEXT_PUBLIC_TRACKING_POLL_MS` | `1000` | Espera normal después de completar el ciclo de lectura. |
| `NEXT_PUBLIC_TRACKING_STALE_MS` | `3500` | Antigüedad local permitida desde la última lectura exitosa. |
| `NEXT_PUBLIC_TRACKING_TIMEOUT_MS` | `4000` | Timeout de la solicitud del cliente. |

Ver [config.ts](../lib/tracking-api/config.ts) y [.env.example](../.env.example). No sobrescribir un `.env.local` existente sin revisarlo. En la capacitación se explica la configuración vigente sin modificar variables ni reiniciar el proceso que atiende 3000. Crear otro entorno desde el ejemplo es una tarea de desarrollo independiente.

Las variables `NEXT_PUBLIC_*` se incorporan al build y son visibles para el navegador: no son un lugar para secretos. Cambiarlas en un paquete productivo requiere reconstruirlo. `TRACKING_API_PROXY_TARGET` se lee en el servidor durante la ejecución; cambiarlo requiere actualizar el entorno del proceso y reiniciarlo, no otro build. En desarrollo, reiniciar después de modificar configuración.

El modo mock no consulta la API. El modo live no cambia automáticamente a mock ante un error: conserva la última lectura válida si existe y comunica la pérdida de frescura.

## Cliente HTTP y validación

[TrackingApiClient](../lib/tracking-api/client.ts) concentra los métodos públicos; [types.ts](../lib/tracking-api/types.ts) define DTOs y [validation.ts](../lib/tracking-api/validation.ts) valida respuestas en tiempo de ejecución.

`request` usa `fetch` con `cache: "no-store"`, `credentials: "omit"`, señal de cancelación y timeout. En escrituras con payload serializa JSON y envía `Content-Type: application/json`; reset es la excepción explícita sin cuerpo. Distingue errores HTTP, red, timeout, cancelación, JSON inválido y estructura incompatible. No hace reintentos automáticos de PUT o POST.

Los tipos extensibles permiten campos adicionales del backend. Los validadores comprueban los campos conocidos, no convierten arbitrariamente cadenas en números. La normalización explícita se limita a variantes soportadas del contrato.

`parseApiDate`, en [date.ts](../lib/tracking-api/date.ts), acepta ISO y `/Date(milisegundos...)/`; fechas vacías, inválidas y valores mínimos sin significado se representan como no disponibles.

## Lecturas y frecuencia real

Las rutas de esta tabla son las del backend. En el navegador se antepone `/tracking-api`, por ejemplo `/tracking-api/api/tracking/state`.

| Método del cliente | GET | Cuándo lo usa la interfaz |
| --- | --- | --- |
| `getStatus` | `/api/tracking/status` | Bootstrap y recuperación. |
| `getCapabilities` | `/api/tracking/capabilities` | Bootstrap y recuperación. |
| `getMap` | `/api/tracking/map` | Bootstrap y recuperación. |
| `getState` | `/api/tracking/state` | Bootstrap y polling continuo. |
| `getQmosMillOrders` | `/api/qmos/mill-orders?max=50` en el panel | Montaje/Refresh cuando las capacidades lo permiten. |
| `getGlobalMillOrder` | `/api/tracking/mill-order` | Montaje/Refresh, después de guardar y recuperación de un error de guardado. |
| `getQmosBundleLocations` | `/api/qmos/bundle-locations` | Montaje/Refresh según capacidades. |
| `getGlobalDestination` | `/api/tracking/destination` | Montaje/Refresh y verificación de guardado. |
| `getQmosPrinters` | `/api/qmos/printers` | Montaje del panel, apertura y Refresh del selector de impresora. |
| `getGlobalPrinter` | `/api/tracking/printer` | Ciclo propio del selector y verificación posterior. |
| `getBundle` | `/api/tracking/bundles/{trackingId}` | Disponible para consulta puntual; no es el polling principal. |
| `getRecentEvents` | `/api/tracking/events/recent` | Diagnóstico puntual; el cliente no añade filtros ni parámetros. |
| `getOpcStatus`, `getQmosStatus` | `/api/tracking/opc`, `/api/qmos/status` | Diagnóstico puntual; no se consultan continuamente en la pantalla normal. |

[useTrackingApi](../hooks/use-tracking-api.ts) consulta inicialmente `status → capabilities → map → state`, comprueba servicio activo y coherencia de escenario. Después consulta normalmente sólo estado. Al fallar vuelve al bootstrap, con backoff exponencial, variación y tope de 30 segundos.

El temporizador se programa al terminar cada ciclo; ese bucle no solapa sus propias peticiones. Los GET independientes del panel de selecciones o del flujo manual incluido pueden coincidir con el polling: no existe un bloqueo global de todas las lecturas HTTP.

Además de los usos de la tabla, `TrackingBundlesPanel.handleCommand` lee **status, capabilities y map**, luego **state**, después de aceptar la confirmación y antes de un comando manual. No es el ciclo de arranque de otra aplicación: es el preflight explícito de esa acción.

`lastSuccessfulPollAt` corresponde a recepción local; `sourceUpdatedAt` deriva de `LastUpdateUtc`. De ahí la diferencia entre Received y State changed. Que el servicio responda no acredita conexión real con PLC o QMOS.

## Catálogos y casing

| Intercambio | Campos relevantes |
| --- | --- |
| Status/capabilities | Principalmente camelCase, por ejemplo `running`, `service`, `scenario`, `apiVersion`. |
| Map/state/bundles | PascalCase: `ScenarioName`, `Bundles`, `TrackingId`, `CurrentZone`, `LastUpdateUtc`. |
| Orden global | `millOrder`, `enabled`, `updatedUtc`; request PUT usa `millOrder`. |
| Destino global | GET con `DestinationId`, `Description`, `UpdatedUtc`; request PUT usa `destinationId`. |
| Catálogo/GET de impresora | `PrinterId`, `PrinterName`, `UpdatedUtc` en la selección. |
| PUT de impresora | Request `PrinterId`; respuesta `updated`, `printerId`, `printerName`, `updatedUtc`, `appliesTo`. |

El catálogo de órdenes acepta arreglo directo o envoltura `{ "value": [...], "Count": n }`. El de destinos acepta `Id/Description` y `id/description`, normalizándolos internamente. Estas tolerancias no significan que toda la API sea indiferente a mayúsculas.

Eventos recientes admite un arreglo directo o un objeto con `Events` y metadatos opcionales. Cada evento usa `EventId`, `EventType` y, cuando está presente, `TrackingId`; el ACK de un comando usa `eventId`, `eventType` y `trackingId`. No buscar únicamente `Id` ni confundir el casing de ambos mensajes. `getRecentEvents()` no acepta parámetros de filtro; no asumir que el servicio permite ampliar la ventana sin consultar su contrato.

En una validación previa se observaron 1,476 destinos; no es un límite ni una cantidad fija. El selector busca por descripción o ID y muestra hasta 80 coincidencias. Que una opción no aparezca inicialmente no prueba que no esté en el catálogo.

## Selecciones globales

El código está en [GlobalMillOrderPanel](../components/mill-order-selection-panel.tsx).

| Método | Endpoint | Cuerpo exacto del request |
| --- | --- | --- |
| `updateGlobalMillOrder` | PUT `/api/tracking/mill-order` | `{ "millOrder": "..." }` |
| `updateGlobalDestination` | PUT `/api/tracking/destination` | `{ "destinationId": 3773 }` |
| `updateGlobalPrinter` | PUT `/api/tracking/printer` | `{ "PrinterId": 4 }` |

Los números son ejemplos de forma, no instrucciones operativas.

Mill Order/Destination requieren capacidades anunciadas, carga válida y comunicación live. Impresora carga sus endpoints directamente y exige una selección válida del catálogo. El operador confirma antes del PUT. Las selecciones no se consultan en cada ciclo de estado: usar el Refresh correspondiente para observar cambios hechos por otra estación.

`handleSubmit` escribe Destination primero si cambió y Mill Order después si cambió. Lee ambos al finalizar. Si una operación falla, `refreshActiveValuesAfterFailure` intenta recuperar lo que quedó activo. No hay transacción conjunta ni rollback automático, ni bloqueo entre operadores.

`handlePrinterSubmit` valida la respuesta del PUT y vuelve a consultar la impresora activa. Un timeout no prueba que el servidor haya rechazado una escritura: revisar el GET antes de repetirla.

Según el contrato, la selección global afecta operaciones posteriores: no reescribe bundles existentes ni reenvía transacciones terminadas. Orden específica del bundle, orden global y fallback INI tienen la precedencia definida por el backend. Para impresión automática `PRINT_NEXT`, una regla `BufferEventRule` con impresora explícita tiene prioridad. Persistencia SQL y estos efectos industriales deben verificarse con el backend; el simulador sólo conserva selecciones en memoria.

## Representación: zona física, peso y FIFO

[groupTrackingBundlesByZone](../lib/tracking-zone-layout.ts) agrupa únicamente por `CurrentZone`, después de excluir los registros cuyo `Status`, normalizado con trim/mayúsculas, sea exactamente `REMOVED`. [bundle-lifecycle.ts](../lib/tracking-api/bundle-lifecycle.ts) centraliza `isRemovedBundle` y `getActiveBundles`; los usan lista, conteos, banner, zonas y báscula. No se presumen terminales otros estados. El snapshot original conserva todos los registros para verificación, diagnóstico y ocupación reportada; no se borra ni muta la respuesta de API. Una zona nueva del backend no crea automáticamente geometría.

La báscula de Overview/Bay 1 recibe sólo bundles en la zona exacta `SGRT2`. Muestra `Weight`, incluido cero; si no hay bundle o falta peso lo indica. No usa SGRT2A/B, no calcula ni inventa unidades.

Las tarjetas LCH están ocultas en Overview/Bay 2, pero sus datos y bundles no se eliminan del snapshot. Las tarjetas CCH muestran cinco filas antes del scroll y conservan el total en su contador.

### Extensión FIFO v0.42 — incluida en esta versión integrada

Los DTOs incorporan `LogicalBufferName?: string | null` y `QueueSequence?: number | null`. Campos ausentes o nulos son compatibles; no se sustituyen por `CurrentZone`, cero o un ID.

El helper `lib/tracking-fifo.ts`, `orderBundlesByLogicalFifo`, opera sobre la lista de una tarjeta ya agrupada físicamente:

- Usa nombre lógico no vacío y secuencia numérica entera segura.
- Ordena ascendentemente cada nombre lógico exacto, sin comparar colas diferentes.
- Reutiliza sólo los índices de ese grupo; entradas sin membresía válida conservan su posición.
- Conserva orden recibido en empates y marca secuencias duplicadas como condición incompleta.
- No muta el arreglo de entrada ni cambia `CurrentZone`.

[TrackingZoneSlot](../components/plant/tracking-zone-slot.tsx) incorpora ese helper en esta versión integrada. La ayuda de la tarjeta expone buffer/secuencia y señala FIFO parcial cuando corresponde. El listado general “Tracked bundles” conserva el orden recibido; no es la vista para validar ese orden de tarjeta. FIFO es orden lógico de entrada, no una posición mecánica inferida.

### Evidencia de QA y diagnóstico de sólo lectura

La consulta histórica directa al backend v0.42 para `BundleId: 101637697`, `TrackingId: TRK-0000103919`, cuando estaba en `CurrentZone: CCH2A`, devolvió ambos campos FIFO nulos. No se confirmó aceptación FIFO con esa muestra. **Ese mismo bundle fue retirado en la prueba posterior y ahora se reportó REMOVED sin zona; no usarlo como si aún fuera una muestra activa en CCH2A.** Los nulos pueden ser válidos fuera de una cola lógica; la zona física por sí sola no demuestra membresía FIFO.

Para un servidor cuyo backend sea local en 8085 y cuyo HMI esté en 3000, este diagnóstico sólo lee. Si la topología es otra, sustituir los destinos por los ya confirmados; no apuntar a un servicio desconocido.

```powershell
$trackingIdToInspect = 'TRK-0000103919'
$directState = Invoke-RestMethod -Uri 'http://127.0.0.1:8085/api/tracking/state' -TimeoutSec 10
$proxyState = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/tracking-api/api/tracking/state' -TimeoutSec 10
foreach ($sample in @(
    @{ Source = 'backend'; State = $directState },
    @{ Source = 'proxy'; State = $proxyState }
)) {
    $matches = @($sample.State.Bundles | Where-Object { $_.TrackingId -eq $trackingIdToInspect })
    if ($matches.Count -eq 0) {
        [pscustomobject]@{ Source = $sample.Source; TrackingId = $trackingIdToInspect; Found = $false }
    }
    foreach ($bundle in $matches) {
        $names = @($bundle.PSObject.Properties.Name)
        [pscustomobject]@{
            Source = $sample.Source
            TrackingId = $bundle.TrackingId
            Status = $bundle.Status
            CurrentZone = $bundle.CurrentZone
            OccupiedZones = $bundle.OccupiedZones
            HasLogicalBufferName = $names -contains 'LogicalBufferName'
            LogicalBufferName = $bundle.LogicalBufferName
            HasQueueSequence = $names -contains 'QueueSequence'
            QueueSequence = $bundle.QueueSequence
        } | ConvertTo-Json -Depth 10
    }
}
```

Un campo ausente y uno explícitamente nulo se ven igualmente vacíos en una tabla simple; las comprobaciones `Has...` los distinguen. Las dos consultas no son simultáneas: considerar movimiento o cambios de estado entre respuestas. No difundir el snapshot completo si contiene datos operativos.

## Corrección individual: separar tres caminos

El `correctBundle` legacy permanece disponible con `TrackingId, OperatorId, Reason, MillOrder1`, pero no se usa para elegir rutinariamente la orden global. En esta versión integrada convive con las dos acciones manuales del panel **Tracked bundles**:

| Camino | Método/DTO | POST `/api/tracking/correct` |
| --- | --- | --- |
| Retiro | `removeBundle`, `TrackingRemovalRequestDto` | `TrackingId, Operation: "REMOVE", OperatorId` obligatorio y `Reason` string o null explícito. Comentario vacío/espacios → null; no vacío recortado. |
| Reposicionamiento | `repositionBundle`, `TrackingRepositionRequestDto` | `TrackingId, OperatorId, Reason, CurrentZone`, sin `Operation` ni `MillOrder1`. |
| Corrección legacy | `correctBundle` | Los cuatro campos legacy, sin mezclar destino de reposicionamiento. |

No se implementó `RETIRE` en la UI ni se inventó `MOVE`. El reposicionamiento representa una corrección declarada del estado: no ordena por sí mismo mover maquinaria. El backend conserva las reglas reales de capacidad, rutas y operación.

El panel manual revalida después de confirmar con metadatos y estado nuevos, compara bundle/escenario/origen/destino y rechaza seleccionados `REMOVED`. La verificación comienza con un GET posterior a la respuesta. **REMOVE acepta ausencia o exactamente un registro del mismo escenario con `REMOVED`, `CurrentZone: null` y `OccupiedZones: []` explícito.** Una zona/huella residual o identidad duplicada no confirma. Reposition exige presencia única, no removida, en el destino. Si no hay evidencia en la ventana de verificación, permite nueva lectura, no reenvío automático.

Una respuesta 202 con `accepted: true` sólo confirma aceptación/encolado. El tipo de evento del ACK no se presupone `MANUAL_REMOVE`. La prueba anterior de `TRK-0000100822` recibió evento `134331`, `MANUAL_CORRECTION`; el bundle siguió `WAITING_QMOS_ID` y el evento no se encontró en la ventana reciente consultada. Ese caso permanece separado del retiro más reciente. `getRecentEvents` no implementa búsqueda histórica completa ni filtros inventados para encontrarlo.

### REMOVE histórico en 7fc34e8: ACK 154605 y ajuste local posterior

En el integrado `7fc34e8`, `TRK-0000103919` / bundle `101637697` recibió HTTP **202 Accepted**, Date **Thu, 08 Oct 2026 02:11:48 GMT**, con `accepted: true`, `eventId: 154605`, `eventType: MANUAL_CORRECTION`. La lectura directa posterior de `/state` en 8085 conservó el objeto con:

```json
{
  "TrackingId": "TRK-0000103919",
  "BundleId": "101637697",
  "Status": "REMOVED",
  "CurrentZone": null,
  "OccupiedZones": [],
  "LogicalBufferName": null,
  "QueueSequence": null
}
```

En `7fc34e8` el panel mostró ese Status y siguió pendiente porque sólo aceptaba `matches.length === 0`; lista y KPI contaban todo el arreglo. El ajuste local posterior implementa la proyección activa y el criterio estricto anteriores. Aún requiere desplegarse y probarse; ni ocultar un registro ni observar estado terminal demuestra por sí solo que el PLC haya quedado limpio o que exista auditoría completa.

### Rastro del clic y evidencia disponible

Para explicar el flujo en el código, abrir estos símbolos en este orden:

1. `components/tracking-bundles-panel.tsx` → `handleCommand`: captura selección, confirma, preflight, despacho y ACK.
2. `lib/tracking-api/manual-position.ts` → `manualPreflightProblem`: comprueba estado y posición frescos; `manualOutcomeObserved`: criterio de resultado observado.
3. `lib/tracking-api/client.ts` → `removeBundle` → `post` → `request`: cuerpo JSON exacto, fetch, timeout y validación del ACK.
4. `app/tracking-api/[...path]/route.ts` → `POST`: allowlist, validación/sanitización y reenvío al servicio.
5. Volver al efecto de verificación del panel → `client.getState`: GETs posteriores, pending/success/uncertain y comprobación sin reenvío.

No hay una bitácora persistente de acciones propia del HMI: los mensajes/eventId se mantienen en React y el proxy no los almacena. Para la prueba coordinada se usa F12 → Network, **Preserve log**, y se conserva **Headers** (URL, método, HTTP, Date), **Payload** y **Response**. Preview es otra representación de Response, no evidencia adicional indispensable. No repetir el POST desde DevTools. La auditoría formal y los efectos PLC deben confirmarse en el backend con el evento 154605.

`OperatorId` es texto aportado por el cliente, no identidad autenticada. **v0.39, sección 4, exigía OperatorId y Reason para REMOVE**; v0.6, sección 5.8, exige operador para correcciones. Para reposicionamiento, Reason está en el ejemplo, sin demostrar obligación contractual general.

La evidencia directa contra API **0.44** del 13 de octubre cambió el alcance implementable: `OperatorId: null` recibió **400** (`OperatorId is required for HMI corrections.`). En cambio REMOVE con operador informado y **`Reason: null`** recibió **202/evento 237102**, y el GET posterior conservó `TRK-0000110850` como `REMOVED`, `CurrentZone: null`, `OccupiedZones: []`, mismo escenario. Ver [horas, cuerpos y límites de la prueba](estado-entrega.md#prueba-directa-api-044-nulidad-de-campos-evento-237102). La consulta directa no atravesó el proxy HMI y no prueba que el nuevo formulario esté desplegado.

El cambio local permite comentario opcional **sólo en REMOVE**, coherente de formulario a DTO, cliente y proxy: se conserva el campo `Reason`; se envía `null` si no hay texto útil y se recorta el comentario no vacío. No equivale a omitir arbitrariamente la propiedad ni a permitir tipos numéricos/objetos. Operator ID sigue visible y debe contener texto no vacío tras `trim`, sin valor fijo. **Reposition y corrección legacy mantienen Reason obligatorio** hasta validar sus propias variantes; no se ha demostrado aquí que rechacen o acepten null. Solicitar actualizar el contrato histórico y acordar cómo resolver identidad en fase 1 si se oculta el campo. No inventar identidad/motivo ni Comments en selecciones globales o reset.

Antes del POST, el panel vuelve a consultar status, capabilities, map y finalmente state. Solo ofrece reposicionar a nombres únicos de `map.Zones` con `IsEnabled: true`; son posiciones de Tracking, no el catálogo QMOS Destination. Una LCH oculta puede seguir siendo destino si está habilitada en el mapa. Se muestran capacidad/ocupación como información, no como un permiso industrial.

El bloqueo de `useTrackingCommandGate`, creado en Dashboard, se comparte entre REMOVE, Reposition y reset; persiste al cerrar sus controles, pero no al recargar la página. No bloquea otras estaciones ni constituye autenticación. La comprobación manual posterior inicia GET nuevos con espera de dos segundos entre solicitudes durante aproximadamente un minuto. Si no confirma, mantiene bloqueo y permite **Check state again (read only)**; no repite el POST. La validación atómica de capacidad, rutas y PLC corresponde al backend; permanece una ventana entre GET y POST.

Procedimientos detallados: [retiro manual](manual-bundle-removal-commissioning.md) y [reposicionamiento](manual-bundle-reposition-commissioning.md). Combinar funciones no autoriza su ejecución sobre material real.

## Proxy y superficie permitida

El [Route Handler](../app/tracking-api/%5B...path%5D/route.ts) permite los GET enumerados, los tres PUT globales, los tres cuerpos de corrección y el POST reset explícito sin cuerpo. Rutas/métodos fuera de la allowlist reciben 404. Las escrituras con payload requieren JSON y validan/sanitizan campos; reset rechaza cuerpo y query. El query `max` de órdenes admite un único entero de 1 a 100.

El proxy transmite la respuesta del backend sin seleccionar propiedades del estado. En particular, no elimina los campos FIFO del JSON recibido. Devuelve errores del backend; problemas de configuración o conexión del proxy pueden producir 503 o 502.

Siguen fuera de alcance del proxy: escritura OPC, inyección de eventos y POST de QMOS, incluidos crear e imprimir. No habilitarlos porque aparezcan en capabilities. La allowlist reduce superficie, pero no aporta login, roles, control multiusuario ni protección industrial. El acceso de red/TLS debe acordarse con IT.

## Reset global de mantenimiento — cambio local pendiente de commissioning

`TrackingResetControl` es independiente del retiro individual. Antes del envío exige escribir `RESET`, declarar autorización operativa y aceptar la confirmación global nativa. Lee nuevamente status/capabilities/state y `resetPreflightProblem` comprueba servicio, capability anunciada, escenario y alcance de IDs activos consistente con el confirmado. Comparar IDs no constituye bloqueo atómico del backend ni una comprobación física.

`TrackingApiClient.resetTracking` envía **POST `/api/tracking/reset` sin cuerpo**. La respuesta contractual esperada es HTTP 202 con `accepted: true`, `eventType: "RESET"` y `eventId`, sin `trackingId` obligatorio. `TrackingResetAcceptedDto` / `isTrackingResetAcceptedDto` validan boolean de aceptación, ID positivo y tipo RESET; la UI comprueba que `accepted` sea true. El transporte acepta status HTTP satisfactorios, no compara exclusivamente 202. El header HMI `X-Tracking-Reset-Confirmation: RESET` declara intención explícita y no se reenvía al servicio. El proxy rechaza Origin incompatible, cuerpo o query; el header y la casilla **no autentican ni autorizan usuarios**.

Tras el acuse se hacen GET nuevos: se distingue aceptación, resultado observado, pendiente e incierto. Para observar estado vaciado se exige un alcance inicial con activos, escenario/identidades coherentes y cero activos posteriores; si quedan registros, todos deben ser REMOVED con zona null y huella explícita vacía. Un estado inicialmente vacío no demuestra que reset se procesó; nuevas entradas pueden impedir esa observación. Un timeout/resultado incierto no provoca otro POST: consultar evento/auditoría. El lock compartido evita solapar reset y acciones manuales sólo desde ese Dashboard.

No se ha ejecutado reset real como parte de este desarrollo ni se presume aprobación industrial. Ver [commissioning de reset](tracking-reset-commissioning.md). Las correcciones mantienen OperatorId obligatorio; el comentario local sólo es opcional en REMOVE, respaldado por el caso v0.44 anterior. Estos campos no se añaden al cuerpo vacío de reset; probar REMOVE con Reason null no valida el reset.

## Criterios de verificación

Primero, sin escrituras: comprobar versión y escenario, estado directo/proxy, catálogos, selecciones activas, peso/zonas, lectura continua y señales de frescura. Para FIFO, exigir una muestra con datos lógicos válidos y contrastar tarjeta, no sólo listado general.

Para la capacitación actual en servidor: recorrer código y peticiones GET reales, y usar la evidencia ya capturada de comandos. No crear escrituras únicamente para mostrar un botón, ni parar el servicio para enseñar una falla. Las regresiones aisladas previas respaldan el desarrollo; no sustituyen la validación industrial ni necesitan repetirse como demo de esta sesión.

En commissioning autorizado: coordinar valores/bundle, responsable y ventana; verificar efectos futuros y persistencia del backend, posibles reglas de prioridad y resultados manuales con el bundle y la operación expresamente autorizados. Registrar lo observado, lo no confirmado y cualquier estado incierto antes de reintentar. Ver [Estado de entrega](estado-entrega.md).

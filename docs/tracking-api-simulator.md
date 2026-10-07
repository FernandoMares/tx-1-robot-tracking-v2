# Simulador local de Tracking API

El simulador permite probar el frontend en modo `live` sin conectarse al servidor de planta. Implementa las lecturas que consume el HMI, las selecciones globales de Mill Order, Destination e impresora, y la correccion manual por bundle usando unicamente datos ficticios.

## Iniciar el simulador

En una terminal:

```powershell
pnpm simulator
```

El servicio escucha por defecto en `http://127.0.0.1:8085`. Un bundle ficticio con identificador numerico de nueve digitos actualiza su estado cada cinco segundos, avanza por varias zonas y desaparece brevemente al terminar su ciclo. Un bundle verde y otro amarillo permanecen en zonas de comparacion para validar que el identificador completo sea legible en ambos estados.

## Conectar el frontend

Crea o modifica `.env.local`. Este archivo es privado y Git lo ignora.

```env
NEXT_PUBLIC_PLANT_DATA_MODE=live
NEXT_PUBLIC_TRACKING_API_URL=/tracking-api
TRACKING_API_PROXY_TARGET=http://127.0.0.1:8085
NEXT_PUBLIC_TRACKING_POLL_MS=1000
NEXT_PUBLIC_TRACKING_STALE_MS=3500
NEXT_PUBLIC_TRACKING_TIMEOUT_MS=4000
```

En otra terminal:

```powershell
pnpm dev
```

Abre `http://localhost:3000`. Despues de cambiar cualquier variable `NEXT_PUBLIC_*`, reinicia `pnpm dev`.

## Escenarios disponibles

- El bundle movil inicia con `WAITING_QMOS_ID` y `UNMATCHED`.
- Despues se correlaciona y cambia a `TRACKING` y `MATCHED`.
- Avanza por `SGRT1A`, `LCH1A`, `CCH1A`, `SGRT2A`, `LCH2A` y `CCH2A`. Las zonas `LCH1A` y `LCH2A` siguen presentes en el mapa y en los datos simulados, aunque Plant Overview y Bay 2 ya no dibujan sus tarjetas.
- Los identificadores comienzan en `101624001` y cambian en cada ciclo completo.
- `101623999` permanece activo en `SGRT1B` y `101624998` permanece en estado `WAITING_QMOS_ID / UNMATCHED` en `SGRT2B`.
- Las tarjetas `CCH1A/B` y `CCH2A/B` muestran hasta cinco identificadores completos y permiten desplazar la lista si hay mas bundles; el contador refleja la ocupacion total. El escenario predeterminado solo coloca el bundle movil en esas zonas.
- La bascula de Plant Overview y Bay 1 lee `Weight` de los bundles con `CurrentZone` exactamente `SGRT2`. El escenario predeterminado no coloca bundles en `SGRT2`, por lo que la bascula indica que no hay un bundle en esa zona. La interfaz no infiere unidades ni un peso cuando `Weight` es nulo.
- Termina como `TAGGED_COMPLETE`, desaparece durante un paso y comienza un ciclo nuevo.
- Un identificador inexistente en `/api/tracking/bundles/{trackingId}` devuelve HTTP 404.
- El catalogo QMOS contiene tres Mill Orders ficticias, responde como arreglo JSON directo y respeta el parametro `max`.
- La Mill Order global inicia como `SIM-MO-001` y un cambio queda visible en la siguiente lectura.
- El Destination global inicia como `1.A.2..` (ID `3773`) y puede cambiarse desde el catalogo simulado.
- El catalogo contiene cuatro impresoras ficticias. La seleccion global inicia vacia y un `PUT` valido queda visible en `GET /api/tracking/printer` mientras el simulador siga ejecutandose.
- Un `PrinterId` inexistente devuelve HTTP 400 y conserva la seleccion previa. Al reiniciar el simulador, la seleccion ficticia vuelve a estar vacia; la persistencia entre reinicios corresponde al servicio real.
- Una correccion aceptada queda visible en `MillOrder1` desde la siguiente lectura del bundle.
- Una reposicion con `CurrentZone`, sin `Operation` ni `MillOrder1`, cambia la posicion del TrackingId indicado desde la siguiente lectura y preserva los demas bundles. Zonas desconocidas/deshabilitadas devuelven 400; reposicionar en la zona actual devuelve 409. Son comportamientos del simulador, no una garantia del backend real.
- `POST /api/tracking/correct` con `Operation: "REMOVE"` y `TrackingId`, `OperatorId`, `Reason` acepta el retiro de un solo bundle ficticio. Desde la siguiente lectura, ese `TrackingId` desaparece de `/api/tracking/state` y su consulta individual devuelve 404. El simulador no reproduce ocupacion PLC real.
- Detener el simulador con `Ctrl+C` permite probar la desconexion y el estado stale del frontend.

### Demostracion visual opcional de bascula y buffer

Para verificar estas tarjetas sin datos de planta, detén el simulador actual y arranca el escenario opcional en la terminal del simulador:

```powershell
$env:TRACKING_SIMULATOR_BUFFER_DEMO="true"
pnpm simulator
```

Este modo agrega al mapa la zona `SGRT2` y la zona `CCH2B`. Coloca un bundle ficticio `101628207` en `SGRT2` con `Weight: 1875.25` y cinco bundles con `BundleId` de nueve digitos (`101628201` a `101628205`) en `CCH2B`. Agrega ademas un sexto bundle en espera de QMOS: su `BundleId` es nulo y el HMI muestra su `L2Id` de nueve digitos (`101628206`). Asi se pueden ver las cinco filas iniciales, el desplazamiento para la sexta y el estado amarillo. Los demas bundles y su movimiento permanecen como en el escenario predeterminado.

La bascula debe mostrar el identificador y el peso reportado sin unidad; `CCH2B` debe indicar seis bundles y permitir ver todas las filas al desplazarse. Estos son datos ficticios para verificar la interfaz, no una prueba de la bascula ni del Tracking de planta.

Para volver al escenario predeterminado, detén el simulador y elimina la variable antes de iniciarlo otra vez:

```powershell
Remove-Item Env:TRACKING_SIMULATOR_BUFFER_DEMO -ErrorAction SilentlyContinue
pnpm simulator
```

El simulador responde a:

```text
GET /api/tracking/status
GET /api/tracking/capabilities
GET /api/tracking/map
GET /api/tracking/state
GET /api/tracking/bundles/{trackingId}
GET /api/tracking/opc
GET /api/tracking/events/recent
GET /api/tracking/mill-order
GET /api/tracking/destination
GET /api/tracking/printer
GET /api/qmos/status
GET /api/qmos/mill-orders?max=20
GET /api/qmos/bundle-locations
GET /api/qmos/printers
PUT /api/tracking/mill-order
PUT /api/tracking/destination
PUT /api/tracking/printer
POST /api/tracking/correct
```

El PUT global acepta unicamente la Mill Order y simula la respuesta sincrona del contrato v0.7:

```json
{
  "millOrder": "SIM-MO-002"
}
```

El PUT de Destination acepta unicamente un ID existente en el catalogo simulado:

```json
{
  "destinationId": 3773
}
```

El PUT de impresora usa `PrinterId` con mayusculas, de acuerdo con el contrato v0.39. Por ejemplo:

```json
{
  "PrinterId": 4
}
```

El GET de la seleccion devuelve `PrinterId`, `PrinterName` y `UpdatedUtc`; el PUT exitoso devuelve `updated`, `printerId`, `printerName`, `updatedUtc` y `appliesTo`. La seleccion afecta a las siguientes acciones automaticas `PRINT_NEXT`, salvo que una regla de base de datos tenga un `PrinterId` propio. El comando explicito `POST /api/qmos/print` no cambia y no esta simulado.

Para corregir Mill Order, el POST requiere estos cuatro datos funcionales. `CurrentZone` y `Operation` no deben mezclarse con esta correccion:

```json
{
  "TrackingId": "SIM-TRACK-HOLD",
  "OperatorId": "qa-user",
  "Reason": "Local UI verification",
  "MillOrder1": "SIM-MO-003"
}
```

Para probar **retiro manual** en el simulador, selecciona un bundle en la HMI y usa la accion **Remove from Tracking**. El comando enviado tiene esta forma distinta de la correccion anterior:

```json
{
  "TrackingId": "SIM-TRACK-HOLD",
  "Operation": "REMOVE",
  "OperatorId": "qa-user",
  "Reason": "Simulated physical removal"
}
```

La aceptacion es asincrona para la HMI: esta vuelve a leer `state` y solo confirma visualmente cuando ya no encuentra ese `TrackingId`. No pruebes el comando contra la API de planta sin autorizacion operativa.

Pruebas automatizadas de esta funcion: `node scripts/test-manual-removal.mjs`.
El runner valida DTO, cliente y proxy y levanta su propio simulador en loopback.
Comprueba retiro por `TrackingId`, conservacion de otros bundles (incluidos vecinos
en la misma zona), rechazo de entradas invalidas y de un segundo retiro del mismo
ID. No necesita una API de planta ni valida PLC o auditoria historica reales.

### Reposicionamiento manual simulado

En **Tracked bundles**, buscar el bundle y usar **Reposition**. Seleccionar una
posicion habilitada distinta de la actual, capturar operador y motivo y confirmar.
El payload de ejemplo es:

```json
{
  "TrackingId": "SIM-TRACK-HOLD",
  "OperatorId": "qa-user",
  "Reason": "Simulated position reconciliation",
  "CurrentZone": "CCH2B"
}
```

`CCH2B` requiere `TRACKING_SIMULATOR_BUFFER_DEMO=true`. El simulador admite
destinos ocupados conservando los vecinos, **solo como simplificacion de pruebas**;
no implementa interlocks, capacidad efectiva, rutas permitidas ni HEAD/TAIL/PLC.
La nueva posicion permanece como override en memoria hasta reiniciar el simulador.
Las correcciones de orden y posicion conservan el valor modificado por la otra.

Pruebas aisladas adicionales (Node 24 y dependencias instaladas):

```powershell
node scripts/test-manual-reposition.mjs
node scripts/test-manual-position.mjs
```

El primer runner cubre DTO, cliente, proxy, simulador, vecinos, destinos invalidos
y compatibilidad con retiro/correccion de orden. El segundo prueba prevalidacion
con estado nuevo, cambios de posicion/ocupacion/escenario y observacion del resultado.
Con un standalone compilado en modo live y un navegador Chromium instalado,
`node scripts/test-manual-actions-ui.mjs` verifica tambien el flujo visual usando
su propio simulador/HMI. `EDGE_PATH` permite elegir el navegador; las capturas
quedan en `dist/`. No debe ejecutarse sobre un standalone que este en uso.

Para excluir zonas del catalogo habilitado de pruebas, se puede iniciar el
simulador con `$env:TRACKING_SIMULATOR_DISABLED_ZONES="LCH2A,LCH2B"`.
Esto marca `IsEnabled=false` en el mapa; no representa una regla de la planta.

## Configuracion opcional

Las variables siguientes afectan solo al proceso del simulador:

```powershell
$env:TRACKING_SIMULATOR_STEP_MS="3000"
$env:TRACKING_SIMULATOR_QMOS_CONNECTED="false"
$env:TRACKING_SIMULATOR_OPC_CONNECTED="false"
$env:TRACKING_SIMULATOR_LOG_REQUESTS="true"
pnpm simulator
```

Para volver a los valores predeterminados en la misma terminal:

```powershell
Remove-Item Env:TRACKING_SIMULATOR_STEP_MS -ErrorAction SilentlyContinue
Remove-Item Env:TRACKING_SIMULATOR_QMOS_CONNECTED -ErrorAction SilentlyContinue
Remove-Item Env:TRACKING_SIMULATOR_OPC_CONNECTED -ErrorAction SilentlyContinue
Remove-Item Env:TRACKING_SIMULATOR_LOG_REQUESTS -ErrorAction SilentlyContinue
```

## Limite intencional

Las zonas `SIM_*`, los identificadores y los datos de negocio son ficticios. El simulador valida el contrato HTTP y el comportamiento del frontend, pero no reemplaza las pruebas contra `MaterialTrackingService` ni define el mapeo fisico de las zonas reales.

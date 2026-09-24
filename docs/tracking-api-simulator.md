# Simulador local de Tracking API

El simulador permite probar el frontend en modo `live` sin conectarse al servidor de planta. Implementa las lecturas que consume el HMI, la seleccion global de Mill Order y la correccion manual por bundle usando unicamente datos ficticios.

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
- Avanza por `SGRT1A`, `LCH1A`, `CCH1A`, `SGRT2A`, `LCH2A` y `CCH2A` para validar visualmente las dos secciones alineadas.
- Los identificadores comienzan en `101624001` y cambian en cada ciclo completo.
- `101623999` permanece activo en `SGRT1B` y `101624998` permanece en estado `WAITING_QMOS_ID / UNMATCHED` en `SGRT2B`.
- Termina como `TAGGED_COMPLETE`, desaparece durante un paso y comienza un ciclo nuevo.
- Un identificador inexistente en `/api/tracking/bundles/{trackingId}` devuelve HTTP 404.
- El catalogo QMOS contiene tres Mill Orders ficticias, responde como arreglo JSON directo y respeta el parametro `max`.
- La Mill Order global inicia como `SIM-MO-001` y un cambio queda visible en la siguiente lectura.
- El Destination global inicia como `1.A.2..` (ID `3773`) y puede cambiarse desde el catalogo simulado.
- Una correccion aceptada queda visible en `MillOrder1` desde la siguiente lectura del bundle.
- Detener el simulador con `Ctrl+C` permite probar la desconexion y el estado stale del frontend.

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
GET /api/qmos/status
GET /api/qmos/mill-orders?max=20
GET /api/qmos/bundle-locations
PUT /api/tracking/mill-order
PUT /api/tracking/destination
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

El POST requiere estos cuatro datos funcionales; cualquier propiedad adicional se descarta:

```json
{
  "TrackingId": "SIM-TRACK-HOLD",
  "OperatorId": "qa-user",
  "Reason": "Local UI verification",
  "MillOrder1": "SIM-MO-003"
}
```

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

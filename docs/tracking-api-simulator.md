# Simulador local de Tracking API

El simulador permite probar el frontend en modo `live` sin conectarse al servidor de planta. Implementa los endpoints GET que consume el HMI y usa unicamente datos ficticios.

## Iniciar el simulador

En una terminal:

```powershell
pnpm simulator
```

El servicio escucha por defecto en `http://127.0.0.1:8085`. Un bundle ficticio actualiza su estado cada cinco segundos, avanza por varias zonas y desaparece brevemente al terminar su ciclo. Otro bundle permanece en una zona de espera para que la lista nunca quede vacia.

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
- Avanza por `SIM_ENTRY`, `SIM_TRANSFER`, `SIM_STACKER` y `SIM_BAY`.
- Termina como `TAGGED_COMPLETE`, desaparece durante un paso y comienza un ciclo nuevo.
- Un identificador inexistente en `/api/tracking/bundles/{trackingId}` devuelve HTTP 404.
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
GET /api/qmos/status
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

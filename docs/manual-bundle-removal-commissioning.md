# Retiro manual de bundles — commissioning del release integrado

Esta guía distingue la base desplegada **`7fc34e8`** de los cambios locales del **9 de octubre de 2026**, posteriores al checkpoint documental `c7df85a`, en la misma rama `release/integrated-hmi`. El nuevo filtro y criterio de retiro retenido aún no se han desplegado. La evidencia real corresponde a HMI **3000** con Tracking **8085**. Abrir código y hacer GETs no equivale a autorizar una nueva remoción: toda escritura se coordina con operación.

Fuente del despliegue documentado: `C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8`. Ver la sección 5 antes de repetir una prueba: ya existe evidencia histórica de un registro `REMOVED` retenido. No reenviar ese comando para comprobar el nuevo filtro.

## Alcance y precauciones

- **Tracked bundles → Remove from Tracking** solicita retirar un solo bundle con `TrackingId`, `Operation: "REMOVE"`, `OperatorId` y `Reason`.
- La identidad del comando es TrackingId, no BundleId, TagNumber, L2Id o nombre de zona. No se llama al reset global.
- El backend debe limpiar la ocupación correspondiente L2/PLC, incluida HEAD/TAIL, y preservar historial y auditoría; la interfaz no escribe esas posiciones individualmente.
- Usar el frontend en 3000 no autoriza cualquier retiro. Elegir con operación el bundle y la ventana permitidos.
- Una segunda instancia en otro puerto no crea otro backend ni aislamiento de datos.
- `OperatorId` es texto de trazabilidad, no autenticación.
- `OperatorId` y `Reason` son obligatorios para REMOVE según v0.39, sección 4; ocultar operador y volver opcional el comentario está solicitado, pero pendiente de acuerdo con backend. No extrapolar esta obligación de Reason a todas las variantes de corrección ni sustituir campos por valores ficticios.
- Que capabilities anuncie `/api/tracking/correct` no demuestra por sí solo soporte ni permisos de REMOVE.

## 1. Preparación del código y del entorno

La descarga, empaquetado, cambio coordinado de la instancia en 3000 y rollback se describen en [Despliegue Windows](windows-standalone-deployment.md). Para esta sesión no hay que volver a desplegar. Mostrar `git log -1 --oneline` desde la carpeta fuente y el `RELEASE.txt` del runtime que atiende 3000. No cambiar de rama, recompilar ni ejecutar un pull sobre una carpeta que esté atendiendo producción.

Las regresiones automatizadas previas se conservan como evidencia de desarrollo; no se ejecutan contra planta durante el recorrido. Para explicar el comando basta abrir `TrackingBundlesPanel.handleCommand`, `manualPreflightProblem`, `TrackingApiClient.removeBundle` y `POST` del proxy, y mostrar el Network capturado. Si no hay permiso para un nuevo retiro, se usa la evidencia del evento 154605, sin volver a pulsar Confirmar.

Comprobar desde PowerShell del servidor la salud directa y por proxy, sin modificar la configuración:

```powershell
Invoke-RestMethod -Uri 'http://localhost:8085/api/tracking/status' -TimeoutSec 10 | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3000/tracking-api/api/tracking/status' -TimeoutSec 10 | ConvertTo-Json
```

Son consultas GET. Verificar también escenario, frescura, `RELEASE.txt` de la carpeta activa y la presencia del panel integrado. HTTP 200 no confirma versión del frontend por sí solo ni permisos para retirar material.

## 2. Preparar la captura antes del clic

1. Abrir `http://127.0.0.1:3000` en el navegador de la sesión RDP. F12 → **Network**.
2. Dejar activado el registro de red, seleccionar **Fetch/XHR** y marcar **Preserve log**. Filtrar por `correct` para el comando; quitar el filtro después para ver los GET de `state`.
3. Anotar hora local con zona horaria, fuente/commit y bundle autorizado. Registrar el `TrackingId`, no sólo el número visible.
4. Tras una solicitud, seleccionar la fila cuyo método sea **POST** y conservar:

   - **Headers:** Request URL, Request Method, Status Code y header de respuesta Date, si está presente.
   - **Payload:** `TrackingId`, `Operation`, `OperatorId`, `Reason` realmente enviados.
   - **Response:** cuerpo recibido, incluidos `accepted`, `eventId`, `eventType`, `trackingId` o error.

Preview presenta el mismo cuerpo de Response con otra vista; no hace falta capturar ambos. El header Date no es necesariamente la hora exacta del clic ni la hora de aplicación al PLC. Si se exporta HAR, revisar que no incluya credenciales o datos operativos ajenos antes de compartirlo. No elegir **Replay XHR**, **Edit and resend** ni ejecutar una copia cURL de un POST como forma de guardar evidencia.

La HMI no escribe una bitácora persistente propia: los mensajes de aceptación son estado de React en memoria. Network sólo captura desde que está registrando; Preserve log no sustituye guardar la evidencia. La auditoría durable del comando se consulta en backend.

## 3. Prueba operativa, una sola solicitud autorizada

1. Confirmar **Live API**, escenario y API esperados. Abrir **Tracked bundles**.
2. Identificar el bundle autorizado, su numero visible, `TrackingId`, zona y
   huella de ocupacion. Registrar la hora y el estado inicial con backend.
3. Pulsar **Remove from Tracking**. Sin operador o motivo no debe habilitarse
   **Remove selected bundle**. Cancelar una confirmacion no debe enviar un POST.
4. Capturar operador real y motivo. Revisar el `TrackingId` en la confirmacion.
   Al aceptar, la HMI consulta nuevamente la configuracion y luego el estado.
   Si cambia la posicion/huella o no puede validar el bundle, no envia la remocion
   y pide revisar de nuevo. La duracion del dialogo no invalida por si sola el envio.
5. Confirmar una sola vez y conservar las tres pestañas de evidencia indicadas arriba. Si aparece “No command was sent”, el preflight impidió el envío; no atribuirlo a un rechazo del backend sin que exista POST. `OperatorId` admite texto: usar `a1` no demuestra que el campo deba ser numérico.
6. La HMI solicita refresco e inicia nuevas lecturas despues de la respuesta,
   esperando ausencia del `TrackingId` o un registro único del mismo escenario
   con `REMOVED`, `CurrentZone: null` y `OccupiedZones: []` explícito. Mientras
   espera, bloquea retiros, reposicionamientos y reset desde ese Dashboard,
   incluso al cerrar/reabrir el panel. Tras un minuto
   sin confirmacion permite consultar de nuevo con **Check state again (read only)**,
   sin reenviar el POST. Verificar tambien los demas bundles, considerando movimiento normal.
7. Con backend/operacion, confirmar limpieza completa HEAD/TAIL y ocupacion
   publicada al PLC, preservacion del historial y auditoria con operador/motivo.

Si hay timeout, error 5xx o respuesta incompatible, **no reenviar automaticamente**.
El backend pudo aceptar la solicitud. Revisar primero estado y auditoria con su
responsable. No usar reset global ni limpiar posiciones individuales como atajo.
El bloqueo del panel no persiste al recargar el navegador y no es una garantia
de idempotencia del backend. Si permanece pendiente, conciliar con backend antes
de recargar o volver a intentar.

El código local acepta los dos resultados descritos en el paso 6, sin tratar `REMOVED` por sí solo como éxito: zona/huella no vacías, identidad duplicada o escenario distinto mantienen la operación sin confirmar. Un REMOVED se oculta de vistas activas incluso si trae una posición inconsistente, pero el snapshot original permanece disponible para verificar esa inconsistencia. `reportedZoneOccupants` no descarta huellas al validar destinos de reposicionamiento.

## 4. Consultar el resultado sin reenviar el comando

Este bloque realiza un único GET directo al backend del servidor. El ID es el del caso ya probado; para otra consulta sustituirlo por el TrackingId exacto acordado. No contiene POST ni modifica el bundle.

```powershell
& {
    $ErrorActionPreference = 'Stop'
    $trackingIdToInspect = 'TRK-0000103919'
    $state = Invoke-RestMethod -Uri 'http://127.0.0.1:8085/api/tracking/state' -TimeoutSec 10
    if (-not ($state.Bundles -is [array])) {
        throw 'La respuesta no contiene el arreglo Bundles esperado.'
    }
    $found = @($state.Bundles | Where-Object { $_.TrackingId -eq $trackingIdToInspect })
    [pscustomobject]@{
        CapturedUtc = [DateTime]::UtcNow.ToString('o')
        ScenarioName = $state.ScenarioName
        StateLastUpdateUtc = $state.LastUpdateUtc
        TrackingId = $trackingIdToInspect
        Matches = $found.Count
        Bundle = @($found | Select-Object TrackingId,BundleId,Status,CurrentZone,OccupiedZones,LogicalBufferName,QueueSequence,LastUpdateUtc)
    } | ConvertTo-Json -Depth 10
}
```

Una consulta al detalle `/bundles/{trackingId}` por sí sola no indica si el objeto permanece en el snapshot usado por la pantalla: podría ser una consulta que conserva historia. Por eso se revisa `/state`. Para comparar con la HMI se puede repetir únicamente el GET por `http://127.0.0.1:3000/tracking-api/api/tracking/state`, teniendo presente que las dos capturas no son simultáneas.

## 5. Caso histórico en 7fc34e8: evento 154605 y registro REMOVED retenido

El POST para `TRK-0000103919`, bundle visible `101637697`, antes en CCH2A, devolvió **202 Accepted** y Date **Thu, 08 Oct 2026 02:11:48 GMT**:

```json
{
  "accepted": true,
  "eventId": 154605,
  "eventType": "MANUAL_CORRECTION",
  "trackingId": "TRK-0000103919"
}
```

En la lectura directa posterior de 8085 el mismo registro seguía en `Bundles`:

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

La pantalla de `7fc34e8` mostró REMOVED / Unknown zone pero siguió pendiente porque entonces `manualOutcomeObserved` exigía ausencia total. El código de trabajo ya incorpora el criterio estricto descrito arriba, oculta los retirados de vistas activas y bloquea nuevas acciones sobre ellos. Es un cambio local pendiente de despliegue/commissioning; no reescribe esta evidencia histórica ni acredita PLC o auditoría.

No decir “el backend no hizo nada”: sí cambió el estado reportado. Tampoco decir “PLC y auditoría ya validados”: los JSON no lo acreditan. No reenviar el evento 154605 ni usar RESET/RETIRE para intentar hacer desaparecer el registro.

## 6. Cierre

Registrar commit probado, version de API, fecha, operador, TrackingId, motivo,
eventId, resultado de tracking y confirmacion PLC/auditoria. Si falta evidencia,
anotar la prueba como pendiente, no como aprobada.

Si se utilizó el HMI operativo en 3000, no cerrar su consola ni detenerlo al terminar la comprobación. Solo finalizar procesos que se hayan creado expresamente para una demo aislada. Detener el Front o volver a un commit anterior **no revierte una remoción ya aplicada por el backend**.

## 7. Caso histórico independiente sin cierre

La solicitud anterior para `TRK-0000100822` recibió 202 y evento `134331` (`MANUAL_CORRECTION`), pero el bundle seguía en state y no se encontró el evento en la ventana reciente. Ese resultado sigue pendiente de conciliación con backend. No reenviar esa solicitud ni cambiar a RESET/RETIRE para intentar obtener una confirmación. Ver [Estado de entrega](estado-entrega.md).

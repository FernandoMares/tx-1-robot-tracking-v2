# Retiro manual de bundles — commissioning del release integrado

Esta guía corresponde a **`release/integrated-hmi`**: REMOVE y Reposition están incluidos junto con FIFO. El release integrado está destinado al mismo frontend operativo en 3000, pero su instalación y el permiso para retirar un bundle son decisiones distintas. Registrar el commit final y comprobar la versión realmente en ejecución antes de operar.

## Alcance y precauciones

- **Tracked bundles → Remove from Tracking** solicita retirar un solo bundle con `TrackingId`, `Operation: "REMOVE"`, `OperatorId` y `Reason`.
- La identidad del comando es TrackingId, no BundleId, TagNumber, L2Id o nombre de zona. No se llama al reset global.
- El backend debe limpiar la ocupación correspondiente L2/PLC, incluida HEAD/TAIL, y preservar historial y auditoría; la interfaz no escribe esas posiciones individualmente.
- Usar el frontend en 3000 no autoriza cualquier retiro. Elegir con operación el bundle y la ventana permitidos.
- Una segunda instancia en otro puerto no crea otro backend ni aislamiento de datos.
- `OperatorId` es texto de trazabilidad, no autenticación.
- Que capabilities anuncie `/api/tracking/correct` no demuestra por sí solo soporte ni permisos de REMOVE.

## 1. Preparación del código y del entorno

La descarga, empaquetado, cambio coordinado de la instancia en 3000 y rollback se describen en [Despliegue Windows](windows-standalone-deployment.md). Usar el commit integrado final aprobado, no una rama histórica manual por separado. No cambiar de rama, recompilar ni ejecutar un pull sobre una carpeta que esté atendiendo producción.

Las regresiones de [Simulador](tracking-api-simulator.md) incluyen FIFO y acciones manuales. Para la capacitación usar únicamente el simulador confirmado en loopback. El simulador no acredita limpieza PLC ni efectos industriales.

Después del despliegue autorizado, comprobar desde el servidor la salud directa y por proxy, ajustando host/puerto si la configuración aprobada es diferente:

```powershell
Invoke-RestMethod -Uri 'http://localhost:8085/api/tracking/status' -TimeoutSec 10 | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3000/tracking-api/api/tracking/status' -TimeoutSec 10 | ConvertTo-Json
```

Son consultas GET. Verificar también escenario, frescura, `RELEASE.txt` de la carpeta activa y la presencia del panel integrado. HTTP 200 no confirma versión del frontend por sí solo ni permisos para retirar material.

## 2. Prueba operativa, una sola solicitud autorizada

1. Confirmar **Live API**, escenario y API esperados. Abrir **Tracked bundles**.
2. Identificar el bundle autorizado, su numero visible, `TrackingId`, zona y
   huella de ocupacion. Registrar la hora y el estado inicial con backend.
3. Pulsar **Remove from Tracking**. Sin operador o motivo no debe habilitarse
   **Remove selected bundle**. Cancelar una confirmacion no debe enviar un POST.
4. Capturar operador real y motivo. Revisar el `TrackingId` en la confirmacion.
   Al aceptar, la HMI consulta nuevamente la configuracion y luego el estado.
   Si cambia la posicion/huella o no puede validar el bundle, no envia la remocion
   y pide revisar de nuevo. La duracion del dialogo no invalida por si sola el envio.
5. Confirmar una sola vez. En Network, conservar el payload y la respuesta del
   POST (`accepted`, `eventId`, `trackingId`, `eventType`). Una aceptacion aun no
   equivale a una operacion terminada.
6. La HMI solicita refresco e inicia nuevas lecturas despues de la respuesta,
   esperando un estado sin ese `TrackingId`. Mientras espera, bloquea retiros y
   reposicionamientos desde ese panel, incluso al cerrar/reabrir. Tras un minuto
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

## 3. Cierre

Registrar commit probado, version de API, fecha, operador, TrackingId, motivo,
eventId, resultado de tracking y confirmacion PLC/auditoria. Si falta evidencia,
anotar la prueba como pendiente, no como aprobada.

Si se utilizó el HMI operativo en 3000, no cerrar su consola ni detenerlo al terminar la comprobación. Solo finalizar procesos que se hayan creado expresamente para una demo aislada. Detener el Front o volver a un commit anterior **no revierte una remoción ya aplicada por el backend**.

## 4. Caso histórico sin cierre

La solicitud anterior para `TRK-0000100822` recibió 202 y evento `134331` (`MANUAL_CORRECTION`), pero el bundle seguía en state y no se encontró el evento en la ventana reciente. Ese resultado sigue pendiente de conciliación con backend. No reenviar esa solicitud ni cambiar a RESET/RETIRE para intentar obtener una confirmación. Ver [Estado de entrega](estado-entrega.md).

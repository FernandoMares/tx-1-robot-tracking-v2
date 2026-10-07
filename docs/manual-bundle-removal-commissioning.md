# Prueba de Remove Bundle en el servidor

Rama de pruebas: `feature/manual-bundle-removal`. Base estable: `600d20f`.
Esta rama permite probar la funcion antes de integrarla a `main`. No incluye
las herramientas Windows ni la documentacion del kit de transferencia posterior.

## Alcance y precauciones

- El panel **Tracked bundles** solicita retirar un solo bundle mediante
  `POST /api/tracking/correct` con `TrackingId`, `Operation: "REMOVE"`,
  `OperatorId` y `Reason`.
- El ID lo toma del bundle seleccionado; no se escribe un numero visible ni una
  zona como sustituto de `TrackingId`. No se llama al reset global.
- El backend limpia la ocupacion de tracking L2/PLC, incluyendo HEAD/TAIL,
  y debe preservar el historial y la auditoria.
- Una segunda instancia del Front en otro puerto NO crea un backend de pruebas.
  Si apunta al Tracking de planta, la remocion afecta la operacion real.
- Elegir con el responsable de planta un bundle cuyo retiro este autorizado.
  No seleccionar uno arbitrario solo para comprobar el boton.
- `OperatorId` es un campo de trazabilidad, no autenticacion del operador.
- Verificar con backend que la version instalada soporte `REMOVE`. Que
  capabilities anuncie `/api/tracking/correct` no demuestra por si solo que
  soporte esta operacion nueva.

## 1. Descargar en una copia separada

En PowerShell del servidor, usando el repositorio existente. No ejecutar
`git pull`, cambiar de rama ni recompilar sobre la carpeta que sirve produccion.

```powershell
& {
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\ven.f.garciamares\Projects\tx-1-robot-tracking-v2'
git fetch origin
if ($LASTEXITCODE -ne 0) { throw 'Fallo fetch; detenerse.' }

$testPath = 'C:\Users\ven.f.garciamares\Projects\tx1-remove-bundle-test'
if (Test-Path -LiteralPath $testPath) { throw 'La carpeta de prueba ya existe; revisarla antes de continuar.' }

git worktree add --detach $testPath origin/feature/manual-bundle-removal
if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la copia de prueba.' }
Set-Location -LiteralPath $testPath
git log -1 --oneline
git status --short
}
```

Detached HEAD es intencional: esta copia ejecuta el commit descargado sin cambiar
`main`. No borrar la carpeta original; ambos worktrees comparten la metadata Git.

## 2. Instalar, verificar y compilar

Desde la nueva copia. Usar Node y pnpm disponibles en el servidor; la instalacion
y el build requieren conectividad a sus dependencias y fuentes.

```powershell
& {
$ErrorActionPreference = 'Stop'
node --version
pnpm --version
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Fallo la instalacion; detenerse.' }

node scripts/test-manual-removal.mjs
if ($LASTEXITCODE -ne 0) { throw 'Fallaron las pruebas; detenerse.' }
pnpm typecheck
if ($LASTEXITCODE -ne 0) { throw 'Fallo TypeScript; detenerse.' }

$env:NEXT_PUBLIC_PLANT_DATA_MODE = 'live'
$env:NEXT_PUBLIC_TRACKING_API_URL = '/tracking-api'
$env:NEXT_PUBLIC_TRACKING_POLL_MS = '1000'
$env:NEXT_PUBLIC_TRACKING_STALE_MS = '3500'
$env:NEXT_PUBLIC_TRACKING_TIMEOUT_MS = '4000'
pnpm build
if ($LASTEXITCODE -ne 0) { throw 'Fallo el build; no arrancar una compilacion incompleta.' }

Copy-Item -LiteralPath '.next\static' -Destination '.next\standalone\.next\static' -Recurse
Copy-Item -LiteralPath 'public' -Destination '.next\standalone\public' -Recurse
}
```

Las dos copias anteriores asumen un build nuevo, sin esas carpetas de destino.
No repetirlas encima de un runtime en ejecucion. Para esta prueba ejecutamos el
standalone en su mismo worktree, con sus dependencias presentes; este procedimiento
no genera un ZIP portable ni sustituye el paquete productivo.

El runner de regresion levanta y detiene su propio simulador en loopback; no usa
la URL de Tracking de planta ni modifica sus bundles.

## 3. Arrancar sin apagar el Front existente

Comprobar primero si el puerto de prueba esta libre:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue |
    Select-Object LocalAddress,LocalPort,OwningProcess
```

Si aparece un proceso, no detenerlo ni lanzar otro encima; elegir un puerto libre.
Si no aparece nada, y Tracking sigue instalado en este mismo servidor:

```powershell
curl.exe -i --connect-timeout 3 --max-time 5 http://localhost:8085/api/tracking/status
```

Solo continuar si responde correctamente y es el backend esperado. En la consola
que quedara abierta para la prueba:

```powershell
$env:TRACKING_API_PROXY_TARGET = 'http://localhost:8085'
$env:HOSTNAME = '127.0.0.1'
$env:PORT = '3001'
node .next\standalone\server.js
```

Abrir `http://127.0.0.1:3001` en el navegador del servidor/RDP. La instancia de
produccion en 3000 no se modifica. El bind loopback evita exponer otra interfaz
de escritura a toda la red durante esta prueba. Para usarla desde una estacion
remota, acordar previamente acceso y firewall con IT.

## 4. Prueba operativa, una sola solicitud autorizada

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

## 5. Cierre

Registrar commit probado, version de API, fecha, operador, TrackingId, motivo,
eventId, resultado de tracking y confirmacion PLC/auditoria. Si falta evidencia,
anotar la prueba como pendiente, no como aprobada.

Al terminar, Ctrl+C solo en la consola de esta instancia de prueba. Produccion
permanece en la version estable. Detener el Front o volver a un commit anterior
**no revierte una remocion ya aplicada por el backend**.

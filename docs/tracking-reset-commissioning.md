# Reset global de Tracking — commissioning coordinado

Función añadida el 9 de octubre de 2026 en `release/integrated-hmi` e incluida en el checkpoint de fuente del día 13, después del checkpoint documental `c7df85a` y de la base funcional `7fc34e8`. **Pendiente de despliegue y prueba de reset real.** Esta guía no autoriza su ejecución y no contiene comandos POST listos para copiar.

## Alcance y precauciones

- El botón de mantenimiento llama a **POST `/api/tracking/reset` sin cuerpo**. No reinicia Windows, Node ni el servicio de API; solicita reset global al Tracking.
- No es REMOVE individual ni una forma de cerrar un comando pendiente. Acordar antes con backend/operación el alcance sobre posiciones, PLC, históricos, reglas y auditoría.
- Identificar servidor, escenario y ventana autorizados; coordinar otras estaciones. Otro puerto del HMI conectado al mismo backend no aísla efectos.
- No hay autenticación/roles incorporados. Marcar autorización o escribir RESET declara intención, no valida permisos corporativos.
- Conservar evidencia previa y plan operativo de recuperación. Reiniciar frontend, restaurar un ZIP o revertir Git no deshace lo que el backend haya aplicado.

## 1. Preparación de sólo lectura

Comprobar fuente/build realmente instalado antes de probar. Para un HMI del servidor en 3000 y backend local en 8085, estos comandos **sólo consultan**:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    $status = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/tracking-api/api/tracking/status' -TimeoutSec 10
    $capabilities = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/tracking-api/api/tracking/capabilities' -TimeoutSec 10
    $state = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/tracking-api/api/tracking/state' -TimeoutSec 10
    if (-not ($state.Bundles -is [array])) { throw 'No se recibió Bundles como arreglo.' }
    $active = @($state.Bundles | Where-Object { ([string]$_.Status).Trim().ToUpperInvariant() -ne 'REMOVED' })
    [pscustomobject]@{
        CapturedUtc = [DateTime]::UtcNow.ToString('o')
        Running = $status.running
        ApiVersion = $status.apiVersion
        ServiceScenario = $status.scenario
        StateScenario = $state.ScenarioName
        Commands = $capabilities.commands
        RawRecords = $state.Bundles.Count
        ActiveRecords = $active.Count
        StateUpdatedUtc = $state.LastUpdateUtc
    } | ConvertTo-Json -Depth 5
}
```

Un 200 no certifica salud PLC/QMOS ni autorización. Si reset no está anunciado en capabilities, el control no lo habilita: confirmar soporte con backend, no quitar la validación para forzar el POST.

## 2. Evidencia y única solicitud autorizada

1. F12 → Network → Fetch/XHR, registro activo y Preserve log. Anotar commit/build, fecha/hora con zona, responsable y escenario. Filtrar `reset` para el POST y después quitar filtro para los GET de state.
2. Sólo en la ventana aprobada, abrir el control separado de reset. Escribir **RESET**, declarar autorización operativa y revisar el alcance global antes de aceptar el diálogo nativo.
3. El control adquiere el bloqueo local compartido con REMOVE/Reposition. Después del diálogo consulta contexto fresco y compara servicio, capability, escenario y conjunto de IDs activos confirmado. Si cambia el alcance o falla la lectura, no debe enviar; revisar de nuevo con operación.
4. Confirmar una sola vez. Guardar **Headers** (URL, POST, código HTTP y Date), verificar que **no hay cuerpo** y guardar **Response** con `accepted`, `eventId`, `eventType: RESET`. No requiere `trackingId` porque no actúa sobre un bundle único.
5. La HMI envía al proxy `X-Tracking-Reset-Confirmation: RESET`. El proxy no lo envía al backend; rechaza Origin incompatible, query o cuerpo. No es un token secreto ni sustituye controles de acceso.

No usar Replay XHR, Edit and resend ni copiar un POST como forma de capturar evidencia.

## 3. Interpretar resultado, pendiente e incertidumbre

HTTP 202/accepted indica aceptación, no aplicación. El control hace GET nuevos después de la respuesta. `resetOutcomeObserved` exige activos en la referencia inicial, escenario/identidades coherentes y cero activos posteriores; si permanecen registros, todos deben ser REMOVED, con zona null y huella explícita vacía. Estado inicialmente vacío no demuestra que ocurrió reset; resolverlo con evento/auditoría, no pulsando de nuevo. El helper no certifica efectos físicos ni correlación causal con el evento por sí solo.

Si la respuesta se pierde, hay timeout o el resultado no se observa, mantener el caso pendiente/incierto. Usar sólo la comprobación de estado ofrecida y consultar con backend el evento y la hora. **No reenviar automáticamente ni recargar para eludir el bloqueo.** El lock sólo vive en la página montada; no protege contra otros navegadores ni aporta idempotencia backend.

Registrar resultado de Tracking separado de verificación PLC/histórico/auditoría. Si siguen creándose bundles durante la prueba o cambia el escenario, no interpretar un contador aislado como prueba definitiva.

## 4. Archivos para mantenimiento

`components/tracking-reset-control.tsx` → `TrackingResetControl`; `lib/tracking-api/tracking-reset.ts` → `supportsTrackingReset`, `resetPreflightProblem`, `resetOutcomeObserved`; `hooks/use-tracking-command-gate.ts` → lock local; `lib/tracking-api/client.ts` → `resetTracking`; DTO/guard en `types.ts`/`validation.ts`; POST explícito en `app/tracking-api/[...path]/route.ts`.

Pruebas de desarrollo: `scripts/test-tracking-reset.mjs` y `scripts/test-tracking-reset-state.mjs`. No prueban el backend de planta ni autorizan un reset real. El simulador sólo anuncia reset con `TRACKING_SIMULATOR_ENABLE_RESET=true`; está deshabilitado por defecto.

Los cambios solicitados de Operator ID/Comments pertenecen a correcciones individuales, no al reset: Operator ID sigue visible/obligatorio porque la prueba directa v0.44 rechazó `null`; el código local admite `Reason: null` sólo para REMOVE, respaldado por aceptación y estado posterior del evento 237102. Reposition/legacy conservan comentario obligatorio hasta confirmar sus variantes. El requisito histórico de ambos campos en v0.39 requiere actualización documental del backend. No se agregan al reset sin cuerpo; esa prueba de retiro no valida ni ejecuta un reset.

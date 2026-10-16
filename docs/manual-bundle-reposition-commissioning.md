# Reposicionamiento manual: preparación y prueba del release integrado

Esta función forma parte de `release/integrated-hmi`, código `7fc34e8`, junto con FIFO y REMOVE. El fuente del servidor es `C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8`; HMI 3000 contra Tracking 8085. Verificar el release activo antes de probar; inclusión del código no acredita commissioning de Reposition.

Base contractual: apartado 7 del HMI API Contract v0.39, Manual Bundle Removal
Appendix. Esta funcion reconcilia la posicion registrada de un bundle; no ordena
el movimiento fisico de transportadores, robots o material.
Cambiar tracking puede afectar la automatizacion que consume esa ocupacion;
coordinar la correccion con operacion y backend, no asumir que carece de impacto fisico.

## Implementacion

- Panel `components/tracking-bundles-panel.tsx`: buscar bundle, seleccionar
  **Reposition**, posicion destino, operador, motivo y confirmacion.
- `lib/tracking-api/manual-position.ts`: catalogo habilitado, prevalidacion y
  comprobacion de posicion reportada. No implementa interlocks de planta.
- `lib/tracking-api/client.ts`: `repositionBundle()` envia unicamente
  `{ TrackingId, OperatorId, Reason, CurrentZone }` a `POST /api/tracking/correct`.
- Proxy `app/tracking-api/[...path]/route.ts`: valida el cuerpo, omite campos
  ajenos y rechaza `Operation`/`MillOrder1` mezclados en una reposicion.
- No se llama a reset, OPC write ni operaciones QMOS. El movimiento no cambia
  la seleccion global de Destination o Mill Order.

## Confirmar con backend antes de operar

El apendice proporciona el ejemplo del comando pero no define estas reglas:

1. Que zonas y saltos entre rutas se permiten, incluidos retrocesos y LCH que
   siguen habilitadas en el mapa aunque esten ocultas en el diagrama.
2. Que sucede al ocupar una zona ya ocupada o un buffer lleno. `Capacity` y el
   numero de bundles reportados se muestran como informacion, no como autorizacion.
3. Como se recalcula la huella HEAD/TAIL y su publicacion al PLC al reposicionar.
4. Permisos del operador, validacion de identidad y auditoria. `OperatorId` es
   texto de trazabilidad, no autenticacion; no hay restriccion numerica en el HMI.
5. Respuestas de rechazo y forma de consultar el procesamiento de un eventId.
6. Concurrencia/idempotencia: el contrato no incluye version esperada, ETag ni
   llave idempotente. GET y POST no forman una transaccion atomica.

No interpretar que capabilities anuncie `/api/tracking/correct` como certificacion
de todas estas reglas. El backend debe validar la operacion en el momento de aplicarla.

## Regresiones de desarrollo — fuera de la capacitación del servidor

Este bloque documenta verificaciones del código en una copia de desarrollo. No se ejecuta durante el training ni sobre la carpeta cuyo runtime está atendiendo producción. La capacitación actual usa código y respuestas del servidor real; ver [recorrido técnico](handoff-session.md).

```powershell
node scripts/test-manual-removal.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló retiro; detenerse.' }
node scripts/test-manual-reposition.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló reposicionamiento; detenerse.' }
node scripts/test-manual-position.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló prevalidación; detenerse.' }
node scripts/test-fifo-ordering.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló FIFO; detenerse.' }
pnpm typecheck
if ($LASTEXITCODE -ne 0) { throw 'Falló TypeScript; detenerse.' }
pnpm build
if ($LASTEXITCODE -ne 0) { throw 'Falló el build; detenerse.' }
```

Los runners usan datos ficticios y, cuando requieren red, su propio simulador en
loopback. No leen variables de destino para contactar al Tracking de planta.
La prueba local no sustituye validar limpieza/ocupacion, interlocks ni auditoria real.

Prueba visual automatizada opcional: crear primero un standalone con
`NEXT_PUBLIC_PLANT_DATA_MODE=live` y `NEXT_PUBLIC_TRACKING_API_URL=/tracking-api`,
y ejecutar `node scripts/test-manual-actions-ui.mjs` con Node 24 y Edge/Chromium
instalado (`EDGE_PATH` permite indicar el ejecutable). Levanta simulador y HMI
propios en puertos libres de loopback y guarda capturas en `dist/`. No usarlo
mientras esa misma carpeta `.next/standalone` este sirviendo otra instancia.
Verifica cancelacion, dialogo prolongado, cambios durante la confirmacion,
payload, acuse pendiente, bloqueo al cerrar/reabrir, retiro y respuesta incierta.

## Una prueba coordinada en el servidor

La sesión utiliza el release integrado en 3000 con la API real, sin levantar simulador. El [procedimiento de retiro](manual-bundle-removal-commissioning.md) distingue `7fc34e8` de los ajustes locales posteriores. El despliegue no sustituye autorizar bundle/origen/destino. No usar los casos retirados `TRK-0000103919` ni `TRK-0000110850`: el código local ya filtra REMOVED y lo rechaza en preflight, pero aún no está desplegado. Reposition exige OperatorId/Reason en esta implementación; el operador tiene requisito base contractual, mientras Reason sólo consta en el ejemplo de reposicionamiento y su obligatoriedad backend debe confirmarse. La prueba v0.44 de Reason null aceptado (evento 237102) fue **REMOVE**, no reposicionamiento: sólo se ha relajado el comentario de ese camino. Para hacerlo opcional aquí, confirmar/documentar el payload por CurrentZone con backend; no asumir soporte ni rechazo de null sin evidencia. El lock local se comparte con reset, no entre estaciones.

1. Registrar commit realmente compilado, version API, escenario, hora y operador.
2. Con el responsable, elegir TrackingId, origen y destino compatibles con la
   posicion fisica y las reglas confirmadas. Guardar state/map iniciales y vecinos.
3. Abrir **Tracked bundles**, buscar el ID y pulsar **Reposition**. Comprobar
   TrackingId y posicion origen. El selector usa el mapa de Tracking, no QMOS.
4. Confirmar que campos vacios y destino igual al origen bloquean el envio.
   Cancelar el dialogo no debe generar POST.
5. Capturar operador real y motivo descriptivo. Confirmar una sola vez. La HMI
   vuelve a consultar status/capabilities/map y lee state al final, antes del POST.
   Si cambia origen/huella, escenario o configuracion/ocupacion del destino,
   cancela el envio y pide revisar. Si falla un GET, tampoco envia el comando.
6. Guardar el payload y acuse de Network. Debe haber cuatro campos, `CurrentZone`
   igual al destino y **ningun `Operation`**. No usar `MOVE`, `REMOVE` ni `RETIRE`.
7. `accepted: true`/HTTP 202 no equivale a ejecucion. La HMI inicia nuevos GET de
   state y espera ver el mismo TrackingId en el CurrentZone solicitado. No
   actualiza el dibujo optimistamente. No requiere un nombre fijo de eventType.
8. Confirmar con backend que el evento se aplico, que no se alteraron vecinos,
   que huella y PLC coinciden y que se conservaron identidad/datos/auditoria.

## Si no se observa el resultado

El panel bloquea nuevas acciones mientras el resultado es pendiente o incierto,
incluso al cerrar y reabrir. Consulta state cada dos segundos durante un minuto;
si no lo confirma, permite **Check state again (read only)** sin otro POST.

Ante timeout, 408/5xx, respuesta incompatible o acuse de otro ID, no reenviar ni
utilizar REMOVE/RETIRE/reset como alternativa. Conciliar state y el eventId con
backend. Que el evento no este entre los recientes no demuestra que nunca existio.
Recargar el navegador elimina el bloqueo local; no hacerlo para forzar un reintento.

Si el bundle ya avanzo mas alla del destino entre lecturas, la HMI no supone que
el reposicionamiento se completo: se necesita evidencia del evento/auditoria.
El resultado observado en state confirma solo la posicion reportada, no que el
comando haya causado movimiento fisico. Volver a una version anterior del Front
no revierte ninguna correccion aplicada por el backend.

Cerrar como aprobado solo con evidencia de estado, vecinos, PLC y auditoria.
Si falta alguna, registrar la prueba como pendiente.

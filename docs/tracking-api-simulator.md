# Simulador local de Tracking API

**Referencia de desarrollo, fuera del training del servidor.** La sesión actual de source code usa la integrada `7fc34e8` en 3000 con Tracking real en 8085; no se ejecutan estos pasos durante la capacitación. Empezar por [Transferencia técnica](handoff-session.md) y [Mapa de código](mapa-codigo.md). Se conserva esta referencia para futuras regresiones aisladas, no como sustituto de la evidencia en planta.

Práctica aislada para aprender el código y verificar HTTP sin tocar PLC, QMOS, SQL ni impresoras. El simulador guarda datos ficticios en memoria. Reiniciarlo pierde los cambios.

La práctica aislada de desarrollo usa API en `127.0.0.1:18085` y frontend en `127.0.0.1:3100`. No usa ni detiene producción en 3000, otras instancias o el backend real en 8085. Si esos puertos están ocupados, elegir otros libres; no matar procesos para liberarlos. Estos puertos no forman parte del recorrido de capacitación en servidor.

## 1. Elegir la versión y una copia separada

Usar una carpeta fuente de capacitación, no el directorio que ejecuta producción. Mantener las terminales del simulador y del frontend en la misma versión del fuente. Consultar [Estado de entrega](estado-entrega.md) antes de atribuir una función a una rama.

| Versión del script/frontend | Demostración disponible |
| --- | --- |
| Base `600d20f` | Movimiento, estados, selecciones globales, corrección legacy de `MillOrder1`, escenario visual de peso/buffer. |
| FIFO `77f79bf` | Lo anterior más `TRACKING_SIMULATOR_FIFO_DEMO` y orden de tarjetas FIFO. No tiene retiro/reposicionamiento. |
| Manual `5338300`, checkpoint local separado | Retiro/reposicionamiento y sus pruebas; no contiene automáticamente la extensión FIFO. |
| **Esta rama `release/integrated-hmi`** | **Reúne FIFO, retiro y reposicionamiento; los antecedentes anteriores permanecen separados como historia.** |
| Documentos copiados entre versiones | No agregan scripts, flags ni funciones al código de la copia receptora. |

Para una copia nueva con Node y pnpm disponibles, instalar dependencias según el lockfile:

```powershell
pnpm install --frozen-lockfile
```

Puede requerir acceso al registro de paquetes. No continuar con una instalación fallida. Esta guía no reconstruye ni despliega el paquete productivo.

Antes de iniciar, comprobar puertos sin alterar procesos:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 18085,3100 -ErrorAction SilentlyContinue |
    Select-Object LocalAddress, LocalPort, OwningProcess
```

Si aparecen listeners, identificar a su responsable y escoger otra pareja de puertos de demo. No usar comandos de parada de servicios ni terminación de procesos.

## 2. Terminal A: API ficticia

Desde la copia de capacitación:

```powershell
$env:TRACKING_SIMULATOR_HOST = '127.0.0.1'
$env:TRACKING_SIMULATOR_PORT = '18085'
$env:TRACKING_SIMULATOR_STEP_MS = '5000'
$env:TRACKING_SIMULATOR_QMOS_CONNECTED = 'true'
$env:TRACKING_SIMULATOR_OPC_CONNECTED = 'true'
$env:TRACKING_SIMULATOR_LOG_REQUESTS = 'false'
$env:TRACKING_SIMULATOR_BUFFER_DEMO = 'true'
$env:TRACKING_SIMULATOR_FIFO_DEMO = 'false'
$env:TRACKING_SIMULATOR_DISABLED_ZONES = ''
pnpm simulator
```

El script lee estas variables del proceso, no carga automáticamente `.env.local`. El valor predeterminado de su puerto es 8085, por eso se fija explícitamente 18085. En este fuente integrado están disponibles tanto la bandera FIFO como las zonas deshabilitadas de las pruebas manuales. En los antecedentes históricos, cada extensión pertenecía a su rama.

El servidor debe anunciar el escenario `LOCAL_HMI_SIMULATOR`. Si no arranca o el puerto está ocupado, detener la práctica y corregir el destino de demo; no usar un backend real como sustituto.

## 3. Terminal B: frontend de capacitación

Desde la misma copia, en una terminal distinta:

```powershell
$env:NEXT_PUBLIC_PLANT_DATA_MODE = 'live'
$env:NEXT_PUBLIC_TRACKING_API_URL = '/tracking-api'
$env:TRACKING_API_PROXY_TARGET = 'http://127.0.0.1:18085'
$env:NEXT_PUBLIC_TRACKING_POLL_MS = '1000'
$env:NEXT_PUBLIC_TRACKING_STALE_MS = '3500'
$env:NEXT_PUBLIC_TRACKING_TIMEOUT_MS = '4000'
pnpm dev --hostname 127.0.0.1 --port 3100
```

Abrir `http://127.0.0.1:3100`. Se usa modo live para probar cliente, proxy, validación y polling contra HTTP ficticio. No es el modo mock interno de la aplicación.

Las variables son de estas terminales; no se modifica la configuración de un servicio ni se sobrescribe un `.env.local`. Al cambiar variables públicas en desarrollo, reiniciar sólo este frontend de demo.

## 4. Puerta de seguridad antes de cualquier escritura

En una tercera terminal, comprobar tanto la API directa como el proxy del frontend. Este bloque hace únicamente GET y se detiene si no identifica el simulador:

```powershell
$demoBases = @(
    'http://127.0.0.1:18085',
    'http://127.0.0.1:3100/tracking-api'
)
foreach ($demoBase in $demoBases) {
    $demoStatus = Invoke-RestMethod -Uri "$demoBase/api/tracking/status" -TimeoutSec 10
    $demoMap = Invoke-RestMethod -Uri "$demoBase/api/tracking/map" -TimeoutSec 10
    $demoState = Invoke-RestMethod -Uri "$demoBase/api/tracking/state" -TimeoutSec 10
    if ($demoStatus.service -ne 'MaterialTrackingServiceSimulator' -or
        $demoStatus.scenario -ne 'LOCAL_HMI_SIMULATOR' -or
        $demoStatus.running -ne $true -or
        $demoMap.ScenarioName -ne 'LOCAL_HMI_SIMULATOR' -or
        $demoState.ScenarioName -ne 'LOCAL_HMI_SIMULATOR') {
        throw "Destino de demo no confirmado: $demoBase. No realizar escrituras."
    }
    [pscustomobject]@{
        Base = $demoBase
        Service = $demoStatus.service
        Scenario = $demoStatus.scenario
        ApiVersion = $demoStatus.apiVersion
        Bundles = @($demoState.Bundles).Count
    }
}
```

También comprobar que la pestaña del navegador es la de 3100 y que Network muestra peticiones a ese mismo origen. Repetir la verificación si se cambia configuración, copia fuente o proceso. Un color verde o un BundleId parecido al ejemplo no identifica por sí solo el destino.

Si la comprobación falla, no hacer PUT/POST desde la interfaz ni por terminal. No hay en esta guía comandos de escritura para producción.

## 5. Recorrido de la demo común

El bundle móvil comienza `WAITING_QMOS_ID / UNMATCHED`, se correlaciona y pasa a `TRACKING / MATCHED`. Recorre SGRT1A, LCH1A, CCH1A, SGRT2A, LCH2A y CCH2A. Los LCH siguen en datos aunque sus tarjetas no se dibujen en Overview/Bay 2.

Los IDs del ciclo empiezan en `101624001`. El bundle `101623999` permanece en SGRT1B; `101624998` muestra el caso amarillo en SGRT2B. Al terminar, el móvil pasa por `TAGGED_COMPLETE`, desaparece brevemente y comienza otro ciclo. Un TrackingId inexistente consultado individualmente devuelve 404.

### Peso y buffer: BUFFER_DEMO

Con la bandera del ejemplo se agregan:

| Zona | Datos de demostración | Resultado esperado |
| --- | --- | --- |
| SGRT2 | Bundle `101628207`, `Weight: 1875.25` | Báscula en Overview/Bay 1 con ID y peso, sin inventar unidad. |
| CCH2B | Cinco BundleId `101628201` a `101628205` | Cinco filas completas inicialmente visibles. |
| CCH2B | Sexto bundle con BundleId nulo y L2Id `101628206` | Contador de seis, fila amarilla y scroll para ver todas las entradas. |

El escenario predeterminado, sin BUFFER_DEMO, no coloca un bundle en la zona exacta SGRT2: debe indicar ausencia de bundle, no peso cero. SGRT2A y SGRT2B no sustituyen esa zona.

### Selecciones globales

Sólo después de pasar la comprobación anterior, cambiar selecciones ficticias mediante la UI y mostrar el PUT seguido del GET de verificación en Network.

El catálogo tiene tres órdenes. La selección inicial es `SIM-MO-001`; Destination inicia en `3773`, descripción `1.A.2..`. Hay cuatro impresoras ficticias y la selección de impresora inicia vacía. Un ID de impresora inexistente se rechaza sin cambiar la selección.

Los cuerpos usan `millOrder`, `destinationId` y `PrinterId` respectivamente. Guardar orden/destino son dos operaciones, primero destino, no una transacción conjunta. La impresora tiene su propio selector y Refresh.

El simulador no ejecuta QMOS CREATE, PRINT_NEXT ni reglas SQL, ni actualiza retroactivamente los campos fijos de orden/destino de sus bundles al cambiar la selección global. Reiniciarlo pierde selecciones; eso no contradice la persistencia que debe verificar el backend real.

### Fallo y recuperación

Esperar primero una lectura válida. Detener únicamente la Terminal A con Ctrl+C. La UI conserva el último snapshot y pasa por reconexión/datos antiguos; sin snapshot previo puede indicar offline. No debe cambiar a mock.

Reiniciar `pnpm simulator` en esa misma terminal con las variables de demo intactas. Observar recuperación y valores reiniciados. No detener el backend real para demostrar este comportamiento.

## 6. FIFO: práctica incluida en el fuente integrado

Verificar en la copia elegida que existe `lib/tracking-fifo.ts` y que el script reconoce la bandera:

```powershell
Test-Path -LiteralPath 'lib/tracking-fifo.ts'
Select-String -LiteralPath 'scripts/tracking-api-simulator.mjs' -Pattern 'TRACKING_SIMULATOR_FIFO_DEMO'
```

Si falta alguno, esa copia no ofrece la práctica FIFO. No basta con definir una variable que el script ignora.

Detener sólo el simulador de la Terminal A, mantener host/puerto de demo y reiniciarlo:

```powershell
$env:TRACKING_SIMULATOR_FIFO_DEMO = 'true'
pnpm simulator
```

Repetir las comprobaciones de servicio/escenario. El escenario añade ocho entradas fijas a CCH2A, deliberadamente fuera de orden; además puede coincidir allí el bundle móvil.

| BundleId | QueueSequence | Tratamiento |
| --- | --- | --- |
| 101637551 | 5161 | Primer integrante válido del FIFO. |
| 101637550 | 5162 | Segundo integrante válido. |
| 101637553 | 5163 | Tercer integrante válido. |
| 101637552 | 5164 | Cuarto integrante válido. |
| 101637554 | 5165 | Quinto integrante válido. |
| 101637555 | 5166 | Sexto integrante válido. |
| 101637559 | nulo | Conserva su posición relativa en los índices no ordenables. |
| 101637558 | ausente | Conserva su posición en la lista; compatibilidad con DTO antiguo. |

En la tarjeta CCH2A, comparar el orden de los integrantes válidos y recorrer el scroll. Las entradas sin secuencia no se convierten a cero ni se trasladan al final; por eso la lista completa es parcial, no una cola única totalmente ordenada. El asterisco y su ayuda explican esa limitación.

La lista general “Tracked bundles” no se ordena con el helper. Usar Overview/Bay 2 y la tarjeta de CCH2A para la evidencia visual. La zona física nunca cambia por ordenar la presentación.

En esa copia, la regresión automatizada es:

```powershell
node scripts/test-fifo-ordering.mjs
pnpm exec tsc --noEmit --incremental false
```

El archivo de pruebas no existe en la base `600d20f`. La regresión FIFO cubre helpers, compatibilidad, render y simulador local; no demuestra aceptación de datos FIFO en el backend de planta.

## 7. Retiro y reposicionamiento: disponibles en esta misma copia

Esta rama incorpora las extensiones de retiro y reposicionamiento de `5338300` junto con la extensión FIFO. Sus pruebas están en `scripts/test-manual-removal.mjs`, `scripts/test-manual-reposition.mjs`, `scripts/test-manual-position.mjs` y `scripts/test-manual-actions-ui.mjs`; revisar cada archivo y sus requisitos antes de ejecutarlo.

El retiro usa `Operation: "REMOVE"`. El reposicionamiento usa `CurrentZone` sin `Operation`; no existe `MOVE`. El comportamiento del simulador no establece qué eventType ni qué reglas industriales debe usar el servicio real.

La capacitación principal puede explicar estos caminos leyendo el código, sin ejecutarlos. Si se acuerda una práctica manual local, usar exclusivamente esta copia de capacitación contra el simulador verificado de 18085, con un bundle ficticio seleccionado explícitamente. No aprovechar una pestaña de 3000/3001 ni reproducir comandos pendientes de planta.

### Regresiones de la versión integrada

Con dependencias instaladas y desde esta carpeta:

```powershell
node scripts/test-fifo-ordering.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló FIFO; revisar antes de publicar.' }
node scripts/test-manual-removal.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló retiro; revisar antes de publicar.' }
node scripts/test-manual-reposition.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló reposicionamiento; revisar antes de publicar.' }
node scripts/test-manual-position.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló prevalidación manual; revisar antes de publicar.' }
node scripts/test-integrated-tracking.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló integración FIFO/manual; revisar antes de publicar.' }
node scripts/test-bundle-lifecycle.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló ciclo de vida REMOVED; revisar antes de publicar.' }
node scripts/test-tracking-reset.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló transporte de reset; revisar antes de publicar.' }
node scripts/test-tracking-reset-state.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló verificación de reset; revisar antes de publicar.' }
node scripts/test-bundler-layout.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló layout Bundler/Overview; revisar antes de publicar.' }
node scripts/test-stacker-layout.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló equivalencia Stacker/Bay 1 o preservación de Stackers; revisar antes de publicar.' }
node scripts/test-bay-two-layout.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló recorte Bay 2/Overview; revisar antes de publicar.' }
pnpm typecheck
if ($LASTEXITCODE -ne 0) { throw 'Falló TypeScript; no publicar.' }
```

Los resultados pertenecen a la revisión exacta ensayada. Las pruebas históricas de ramas separadas no acreditan automáticamente la integración: registrar el resultado final. La prueba adicional `test-manual-actions-ui.mjs` necesita navegador local y puede iniciar procesos de prueba; revisar sus parámetros y requisitos antes de ejecutarla.

Para verificar únicamente la navegación/layout de Bundler, Stacker y Bay 2 frente a Overview, la equivalencia temporal Bay 1/Stacker y preservar Stackers, usar `node scripts/test-manual-actions-ui.mjs --layout-only` después del build live requerido por el runner. Stacker (singular, 13 zonas) y Stackers (plural, 14 zonas) son pestañas independientes; Bay 1 comparte las 13 zonas y el componente de Stacker, con su propio título. Bay 2 muestra las 16 zonas del sector derecho, con báscula y Robot 2. Crea su propio servidor/API loopback, bloquea solicitudes distintas de GET y guarda capturas desktop y de desplazamiento horizontal; no usa el backend de planta.

## 8. Endpoints y límites del simulador

Lecturas disponibles:

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
```

Las escrituras simuladas comunes son los tres PUT globales y POST `/api/tracking/correct` legacy con `TrackingId, OperatorId, Reason, MillOrder1`. En esta versión integrada también se simulan REMOVE y reposicionamiento por CurrentZone. No se simula `POST /api/qmos/print`.

El ajuste local de comentario opcional afecta **sólo REMOVE**: el formulario/cliente/proxy normalizan texto vacío o espacios a `Reason: null` y recortan texto no vacío. El simulador contempla ese payload sin motivo ficticio. Operator ID sigue obligatorio; Reposition y corrección legacy mantienen comentario obligatorio. Las regresiones locales no establecen un contrato nuevo de planta: el soporte de null en REMOVE se fundamenta en la prueba directa API 0.44/evento 237102 registrada en [Estado de entrega](estado-entrega.md#prueba-directa-api-044-nulidad-de-campos-evento-237102). No extrapolar ese soporte a las otras variantes ni a reset.

El cambio local del 9 de octubre (`sim-1.6.0`) agrega reset ficticio **deshabilitado por defecto**: sólo con `TRACKING_SIMULATOR_ENABLE_RESET=true` anuncia y acepta POST `/api/tracking/reset` sin cuerpo. Limpia únicamente el estado en memoria de esa instancia; no conecta a PLC/SQL. `test-manual-actions-ui.mjs` habilita esta opción en su propio simulador loopback para probar confirmaciones, bloqueo compartido y resultado incierto sin reintentos. No usar ese flag ni ese resultado como evidencia de autorización o ejecución en planta.

GET de impresora usa `PrinterId/PrinterName/UpdatedUtc`; la respuesta PUT usa `updated/printerId/printerName/updatedUtc/appliesTo`. El simulador ayuda a observar ese casing, no lo homogeneiza.

`getRecentEvents` consulta la ventana que devuelve el servicio. No usar el comportamiento del simulador para suponer que el backend real admite parámetros históricos o filtros por tracking/evento.

## 9. Opciones y cierre

Sólo en la Terminal A, y reiniciando únicamente el simulador, se puede ajustar `TRACKING_SIMULATOR_STEP_MS`, activar `TRACKING_SIMULATOR_LOG_REQUESTS` o simular `TRACKING_SIMULATOR_QMOS_CONNECTED=false` / `TRACKING_SIMULATOR_OPC_CONNECTED=false`. Esos flags representan diagnósticos ficticios, no una desconexión industrial real.

Para terminar, Ctrl+C en las terminales A y B propias y cerrarlas. No hace falta cambiar configuración persistente ni borrar archivos. Conservar capturas y notas con la versión del fuente, escenario y puertos.

La prueba verifica presentación e intercambio HTTP local. No acredita persistencia SQL, PLC, báscula, impresión, reglas de cola ni efectos reales de una corrección. La muestra real v0.42 revisada tenía campos FIFO nulos: sigue pendiente validar el orden con datos lógicos útiles en planta. Ver [Integración API](tracking-api-integration.md) y [Estado de entrega](estado-entrega.md).

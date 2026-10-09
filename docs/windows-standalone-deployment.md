# Windows: identificar, mantener y desplegar el HMI integrado

La capacitación se realiza sobre el servidor existente, mediante lectura de código, archivos y respuestas HTTP. No requiere simulador, instalación de dependencias, compilación, arranque de otra instancia ni reinicio. Las operaciones de mantenimiento están separadas al final.

## 1. Referencia de la instalación actual

| Elemento | Referencia comprobada para la sesión |
| --- | --- |
| Rama del fuente | `release/integrated-hmi` |
| Commit integrado | `7fc34e863ed0a9b12e955ae28a224996e84fd011` |
| Fuente en el servidor | `C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8` |
| Runtime compilado | `C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8\dist\tx1-tracking-windows` |
| HMI activo | Puerto 3000 |
| Backend local | Puerto 8085; API v0.42 observada |
| Funciones reunidas | FIFO, REMOVE, reposicionamiento, selecciones globales, diagramas y peso SGRT2 |
| Servicio Windows | Su identidad/configuración deben inspeccionarse; no se acredita su instalación sólo porque el HMI responda. |

El release integrado ya está publicado y fue puesto en servicio; no debe describirse como una integración pendiente de publicar. La aceptación de cada operación industrial es un asunto diferente: consultar [Estado de entrega](estado-entrega.md).

Estas rutas identifican la instalación actual, no una plantilla para sobrescribirla. La carpeta fuente y su subcarpeta runtime tienen funciones distintas, aunque estén dentro del mismo árbol.

## 2. Fuente, build y runtime

| Lugar | Qué contiene | Qué significa modificarlo |
| --- | --- | --- |
| Raíz fuente | `app`, `components`, `hooks`, `lib`, scripts, configuración, documentación y lockfile | Editar TypeScript no cambia automáticamente el standalone activo. |
| `.next` del fuente | Resultado y archivos intermedios del build | Se regeneran al compilar; no son el fuente mantenible. |
| `dist\tx1-tracking-windows` | `server.js`, dependencias de ejecución, `.next`, `public`, launcher y manifiesto | Es el paquete desde el que se ejecuta producción; no editar ni reconstruir encima mientras está activo. |
| `dist\tx1-tracking-windows.zip` | Copia distribuible del paquete generado | No cambia al editar documentación o código fuente después del empaquetado. |

[next.config.mjs](../next.config.mjs) usa `output: "standalone"`. Node es necesario para ejecutar el servidor y su proxy `/tracking-api`; no basta abrir HTML ni copiar la carpeta a un servidor estático.

El operador sólo necesita navegador y acceso al HMI. Para ejecutar el paquete se necesita Node compatible; pnpm, Git y un editor no son requisitos del runtime. Para desarrollar/compilar sí se requieren Node, pnpm y dependencias del proyecto.

La preparación integrada se verificó con Node Windows x64 24.21.0 y pnpm 10.34.5. El fuente declara Next 16.3.0, React 19.2.4 y TypeScript 5.7.3. La versión de Node de una consola puede diferir del ejecutable del proceso activo; inspeccionar ambos antes de concluir qué runtime usa producción. IT debe aprobar las versiones y el sistema operativo.

## 3. Inicio de la sesión: comprobaciones sin cambios

Desde PowerShell en el servidor:

```powershell
$sourcePath = 'C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8'
$releasePath = Join-Path $sourcePath 'dist\tx1-tracking-windows'
if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) {
    throw 'No se encontró el fuente esperado; confirmar la ruta antes de continuar.'
}
if (-not (Test-Path -LiteralPath (Join-Path $releasePath 'server.js') -PathType Leaf)) {
    throw 'No se encontró el runtime esperado; no iniciar ni reconstruir para compensarlo.'
}
git -C $sourcePath rev-parse HEAD
git -C $sourcePath branch --show-current
git --no-optional-locks -C $sourcePath status --short --branch
Get-Content -LiteralPath (Join-Path $releasePath 'RELEASE.txt')
Get-Content -LiteralPath (Join-Path $releasePath '.next\BUILD_ID')
Get-Command node,pnpm,git -ErrorAction SilentlyContinue |
    Select-Object Name, Source
```

Comparar HEAD con el commit de referencia y `GitCommit` del manifiesto. `BUILD_ID` identifica esa compilación de Next; no es un commit Git. Un manifiesto no prueba por sí solo que el proceso esté usando esa carpeta ni que el árbol estuviera limpio al compilar. Si hay diferencias, registrarlas antes de atribuirle una función al runtime.

El empaquetador actual registra `BuiltUtc`, `GitCommit`, `GitSubject` y `PlantDataMode`; no genera un inventario criptográfico de todo el fuente ni un manifiesto `SOURCE-RELEASE.txt`. No exigir archivos que esta variante no produce.

### Identificar el proceso que escucha en 3000

```powershell
$hmiListeners = @(Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue)
$hmiListeners | Select-Object LocalAddress, LocalPort, OwningProcess
foreach ($hmiProcessId in @($hmiListeners.OwningProcess | Sort-Object -Unique)) {
    Get-CimInstance Win32_Process -Filter "ProcessId = $hmiProcessId" |
        Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine
}
```

Contrastar la línea de comando con la carpeta runtime. Si sólo aparece `node server.js`, no se conoce la carpeta de trabajo con ese dato: revisar el launcher o la configuración de arranque identificada. No asumir que cualquier Node del servidor pertenece al HMI.

Para vincular proceso, padres y eventual servicio, usar [Servicio Windows y proceso activo](windows-service.md). Algunas propiedades pueden requerir permisos adicionales; un campo vacío no autoriza a reiniciar ni a terminar procesos. No compartir líneas de comando sin revisar posibles datos sensibles.

### Confirmar HTTP directo y proxy

```powershell
$backendStatus = Invoke-RestMethod -Uri 'http://127.0.0.1:8085/api/tracking/status' -TimeoutSec 10
$proxyStatus = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/tracking-api/api/tracking/status' -TimeoutSec 10
$backendStatus | Select-Object service, running, scenario, apiVersion
$proxyStatus | Select-Object service, running, scenario, apiVersion
(Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/' -TimeoutSec 10).StatusCode
$liveState = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/tracking-api/api/tracking/state' -TimeoutSec 10
[pscustomobject]@{
    ScenarioName = $liveState.ScenarioName
    LastUpdateUtc = $liveState.LastUpdateUtc
    BundleCount = @($liveState.Bundles).Count
}
```

Son GET: no guardan selecciones ni corrigen bundles. El estado puede cambiar entre consultas porque la planta sigue funcionando. No detener el backend para demostrar desconexión y no usar REMOVE, reposicionamiento o cambios globales como prueba de conectividad.

## 4. Configuración: qué se fija al compilar y qué al arrancar

| Ajuste | Momento y alcance |
| --- | --- |
| `NEXT_PUBLIC_PLANT_DATA_MODE` | Build del navegador. El empaquetador fuerza `live`. |
| `NEXT_PUBLIC_TRACKING_API_URL` | Build; el empaquetador fuerza `/tracking-api`. |
| Poll/stale/timeout públicos | Build; el empaquetador fija 1000/3500/4000 ms. |
| `TRACKING_API_PROXY_TARGET` | Entorno del proceso Node; destino privado del proxy. |
| `PORT` | Puerto de escucha al arrancar Node. |
| `HOSTNAME` | Dirección de escucha al arrancar; el launcher actual la sobrescribe. |

Modificar `NEXT_PUBLIC_*` de una consola no reconfigura JavaScript que ya fue compilado. Cambiar el destino privado del backend no exige otro build, pero sí aplicar el nuevo entorno y reiniciar el proceso correcto en una ventana acordada. Consultar `$env:TRACKING_API_PROXY_TARGET` en una consola nueva sólo muestra el entorno de esa consola, no el de Node ya iniciado.

El [start.cmd real](../deployment/windows/start.cmd):

- Cambia a su propia carpeta y ejecuta `node server.js` usando Node del PATH.
- Usa `http://localhost:8085` si falta `TRACKING_API_PROXY_TARGET`.
- Usa 3000 si falta `PORT`.
- Fija siempre `HOSTNAME=0.0.0.0`; definir loopback antes de ejecutar ese script no lo limita.
- No instala un servicio ni implementa reinicio automático.

`localhost` corresponde al servidor donde corre Node. El navegador usa el mismo origen del HMI; no necesita llegar directamente al 8085. IT controla acceso de red, firewall, autenticación y HTTPS. La allowlist del proxy no sustituye esos controles.

## 5. Leer los scripts sin ejecutarlos

En la capacitación, abrir estos archivos con el editor o `Get-Content`:

```powershell
Get-Content -LiteralPath (Join-Path $sourcePath 'package.json')
Get-Content -LiteralPath (Join-Path $sourcePath 'next.config.mjs')
Get-Content -LiteralPath (Join-Path $sourcePath 'scripts\package-windows-standalone.ps1')
Get-Content -LiteralPath (Join-Path $sourcePath 'deployment\windows\start.cmd')
Get-ChildItem -LiteralPath (Join-Path $sourcePath 'deployment\windows') |
    Select-Object Name
```

`pnpm dev` es desarrollo; `pnpm build` ejecuta `next build`; `pnpm start` corresponde a `next start`, no al launcher del standalone. El paquete Windows se ejecuta con su `server.js`; no instalar dependencias dentro de él.

`pnpm package:windows` invoca PowerShell y [package-windows-standalone.ps1](../scripts/package-windows-standalone.ps1). El script:

1. Fija temporalmente los ajustes públicos live y ejecuta un build nuevo.
2. Elimina sus salidas anteriores y recrea la carpeta fija `dist\tx1-tracking-windows`.
3. Copia el standalone, archivos estáticos y public; materializa dependencias trazadas de pnpm.
4. Copia únicamente `start.cmd` y `README.txt` como herramientas Windows.
5. Escribe RELEASE.txt, verifica algunos archivos necesarios y crea de nuevo `dist\tx1-tracking-windows.zip`.

No tiene parámetros propios `-SourceVersion`, `-PackageName` o `-SkipBuild`. Tampoco incorpora `service.ps1`, JSON de servicio ni `test-deployment.ps1`. Esas herramientas pertenecían a una preparación separada, no a este release.

**No ejecutar el empaquetador en la carpeta fuente actual del servidor:** su salida coincide con el runtime activo. Incluso un build exitoso podría terminar borrando/recreando archivos de la instancia en uso.

## 6. Mantenimiento futuro: build en una copia separada

Esta sección no forma parte de la práctica sobre producción. Requiere cambio aprobado, versión identificada, copia fuente de build separada y responsable. La instalación de paquetes/build puede requerir acceso al registro y a fuentes web; no afirmar que es offline sólo porque el runtime use una API interna.

Ejemplo para una copia ya preparada en una ruta nueva. Sustituir NUEVA_VERSION por la referencia aprobada; no copiar la ruta del release activo:

```powershell
$activeSourcePath = 'C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8'
$buildSourcePath = 'C:\Users\ven.f.garciamares\Projects\tx1-integrated-build-NUEVA_VERSION'
if (-not (Test-Path -LiteralPath $buildSourcePath -PathType Container)) {
    throw 'Preparar primero una copia fuente independiente y aprobada.'
}
$resolvedBuildSource = (Resolve-Path -LiteralPath $buildSourcePath).Path
$activeSourcePrefix = $activeSourcePath.TrimEnd('\') + '\'
if ($resolvedBuildSource.TrimEnd('\') -eq $activeSourcePath.TrimEnd('\') -or
    $resolvedBuildSource.StartsWith($activeSourcePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'No compilar sobre el fuente que contiene el runtime activo.'
}
foreach ($outputName in @('dist\tx1-tracking-windows','dist\tx1-tracking-windows.zip')) {
    if (Test-Path -LiteralPath (Join-Path $resolvedBuildSource $outputName)) {
        throw 'Esta copia ya tiene salidas. Conservarlas y elegir una copia de build nueva.'
    }
}
Set-Location -LiteralPath $resolvedBuildSource
git rev-parse HEAD
git --no-optional-locks status --short --branch
# Revisar la versión y el estado antes de continuar.
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Falló la instalación.' }
pnpm typecheck
if ($LASTEXITCODE -ne 0) { throw 'Falló TypeScript.' }
pnpm package:windows
if ($LASTEXITCODE -ne 0) { throw 'Falló el empaquetado; no desplegar.' }
Get-Content -LiteralPath '.\dist\tx1-tracking-windows\RELEASE.txt'
Get-FileHash -LiteralPath '.\dist\tx1-tracking-windows.zip' -Algorithm SHA256
```

La guardia evita la ruta conocida y salidas ya existentes; no reemplaza verificar que la copia no sea un enlace a un despliegue ni que ningún proceso esté ejecutándose desde ella. Registrar pruebas y herramientas del build. Las regresiones automatizadas se ejecutan en un entorno de desarrollo separado; no son una actividad de la capacitación en el servidor activo.

Un hash calculado identifica el ZIP producido; para validar una transferencia se compara contra un hash aprobado recibido por otro canal. RELEASE.txt no garantiza por sí solo un árbol limpio ni una procedencia correcta en una exportación sin Git. Revisar que el paquete no incluya secretos y probarlo fuera del runtime activo.

## 7. Cambio de versión y rollback: ventana planificada

Antes del cambio, identificar el dueño del listener 3000, el mecanismo de arranque, ejecutable Node, carpeta release y configuración. Conservar el paquete anterior completo y su configuración. No sobrescribirlo ni detener todos los procesos Node.

Preparar el candidato en otra carpeta; acordar cómo verificarlo sin competir por 3000 ni enviar escrituras a planta. Sólo durante la ventana autorizada, detener la instancia HMI identificada e iniciar la versión aprobada por el mecanismo real de ese servidor. Si existe un servicio, usar su procedimiento aprobado; esta entrega no proporciona un helper para instalarlo.

Validar la página, status/state por proxy, versión esperada y acceso de los operadores. Si falla, recuperar el runtime y configuración previos mediante el mismo mecanismo. No reiniciar MaterialTrackingService, PLC ni Windows para resolver a ciegas un fallo del frontend.

Un rollback del HMI no revierte selecciones ni correcciones que Tracking ya haya aceptado.

## 8. Diagnóstico de mantenimiento

| Síntoma | Comprobación inicial |
| --- | --- |
| `EADDRINUSE` | Identificar listener/PID; no arrancar una segunda instancia en 3000. |
| HTTP 502 | Destino del proxy, conectividad servidor HMI → Tracking y estado del backend. |
| HTTP 503 de configuración | Entorno del proceso real, no sólo el de la consola actual. |
| HTTP 200 con error de datos | JSON, casing, DTO y escenario; el código de estado no valida el contrato completo. |
| Código editado sin cambio en pantalla | Distinguir fuente de paquete compilado y proceso activo. No reconstruir en caliente. |
| “node no encontrado” | Node del PATH del launcher; para otro mecanismo, ruta absoluta configurada. |
| Se desconoce persistencia tras RDP/reinicio | Inspeccionar dueño/servicio y programar una prueba; no cerrar la sesión para demostrarlo. |
| Sin FIFO visible | Campos LogicalBufferName/QueueSequence y tarjeta de zona; null puede ser válido. |
| Comando manual pendiente | 202 no es finalización; consultar estado/auditoría sin repetir automáticamente. |

Más contexto: [Integración API](tracking-api-integration.md), [Proceso/servicio](windows-service.md), [Entrega Git](entrega-git.md) y [Estado de entrega](estado-entrega.md).

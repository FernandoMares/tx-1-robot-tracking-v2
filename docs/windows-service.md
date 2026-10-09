# Windows: proceso activo, servicio y continuidad

La primera tarea en el servidor es identificar cómo está ejecutándose el HMI, no instalar un servicio nuevo.

La referencia actual es `release/integrated-hmi`, commit `7fc34e863ed0a9b12e955ae28a224996e84fd011`. El fuente está en `C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8` y el runtime en su subcarpeta `dist\tx1-tracking-windows`. El frontend integrado opera en 3000 y consulta al backend local 8085; se observó API v0.42.

Que la página esté disponible no demuestra que exista un servicio Windows, arranque automático o recuperación tras reiniciar. Esos puntos deben comprobarse y registrarse en [Estado de entrega](estado-entrega.md).

## 1. Qué incluye realmente este release

[deployment/windows](../deployment/windows) contiene `start.cmd` y `README.txt`. El empaquetador copia esos dos archivos al runtime; no entrega `service.ps1`, `service-settings.example.json` ni `test-deployment.ps1`.

Las instrucciones históricas de un helper WinSW preparado por separado no son aplicables por el hecho de que esta guía exista. No buscarlo en el runtime ni copiar comandos Install/Prepare de otra variante sin evaluar e incorporar expresamente ese kit.

El launcher actual ejecuta Node en primer plano y no registra servicios. Node por sí solo no implementa el protocolo de un servicio Windows: no basta registrar `node.exe` directamente con `sc create`. Un wrapper, tarea programada u otro mecanismo requiere su propia configuración y autorización.

## 2. Inspección durante la capacitación: sólo lectura

No ejecutar Stop/Start/Restart, cerrar la consola que mantiene Node, terminar procesos, cambiar ACL ni reiniciar Windows para explicar cómo funciona.

### Listener y proceso

```powershell
$hmiListeners = @(Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue)
$hmiListeners | Select-Object LocalAddress, LocalPort, OwningProcess
foreach ($hmiProcessId in @($hmiListeners.OwningProcess | Sort-Object -Unique)) {
    Get-CimInstance Win32_Process -Filter "ProcessId = $hmiProcessId" |
        Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine
}
```

Si no hay listener, documentar el resultado y avisar al responsable; no iniciar otra copia automáticamente. Si hay varios registros del mismo PID, pueden representar distintas direcciones de escucha y no necesariamente varias instancias.

`ExecutablePath` identifica el binario real. El `node --version` de una consola nueva puede corresponder a otro Node del PATH. `CommandLine` puede contener la ruta del server.js; si sólo tiene un nombre relativo, no basta para conocer la carpeta de trabajo.

### Padres del proceso y posible servicio

El proceso del servicio puede ser el wrapper padre de Node, no Node mismo. El siguiente bloque consulta hasta seis niveles de padres y busca coincidencias por PID, sin modificar nada:

```powershell
$services = @(Get-CimInstance Win32_Service)
foreach ($hmiProcessId in @($hmiListeners.OwningProcess | Sort-Object -Unique)) {
    $currentProcessId = [int]$hmiProcessId
    $visitedProcessIds = @()
    for ($depth = 0; $depth -lt 6 -and $currentProcessId -gt 0; $depth++) {
        if ($visitedProcessIds -contains $currentProcessId) { break }
        $visitedProcessIds += $currentProcessId
        $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $currentProcessId"
        if ($null -eq $processInfo) { break }
        $processInfo | Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine
        $services | Where-Object { $_.ProcessId -eq $currentProcessId } |
            Select-Object Name, DisplayName, State, StartMode, StartName, ProcessId, PathName
        $currentProcessId = [int]$processInfo.ParentProcessId
    }
}
```

No usar `$PID` como variable propia: PowerShell la reserva. Un padre puede haber terminado y su PID puede reutilizarse; una cadena incompleta o sin coincidencias no demuestra por sí sola que no exista automatización. También puede haber una tarea programada u otro supervisor que deba identificar el equipo de IT.

La lectura de ciertos campos depende de permisos. Una respuesta vacía no justifica elevar privilegios o reiniciar sin coordinación. Revisar las líneas de comando antes de compartir capturas: podrían contener información interna o credenciales de otras herramientas.

### Salud del frontend y del backend

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8085/api/tracking/status' -TimeoutSec 10 |
    Select-Object service, running, scenario, apiVersion
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/tracking-api/api/tracking/status' -TimeoutSec 10 |
    Select-Object service, running, scenario, apiVersion
(Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/' -TimeoutSec 10).StatusCode
```

`Running` de un servicio sólo informa sobre ese servicio. Un HTTP 200 sólo acredita esa respuesta; no garantiza datos frescos, PLC conectado, QMOS operativo ni efectos de comandos. Contrastar con la interfaz y [Integración API](tracking-api-integration.md), sin guardar selecciones para “probar”.

## 3. Qué registrar antes de cambiar algo

| Dato | Evidencia requerida |
| --- | --- |
| Instancia | Listener 3000, PID y ejecutable Node. |
| Fuente/runtime | Commit del fuente, RELEASE.txt/BUILD_ID y carpeta realmente usada. |
| Arranque | Consola, wrapper, tarea o servicio identificado; no inferido. |
| Configuración | Destino API, puerto y dirección de escucha del proceso; no sólo variables de la sesión actual. |
| Servicio, si existe | Nombre exacto, cuenta, ruta/configuración, modo de inicio y responsable. |
| Recuperación | Política configurada, logs y evidencia de pruebas; no asumir que toda falla se detecta. |
| Rollback | Carpeta/configuración anterior y responsable autorizado para restaurarlas. |

Si Node se inició manualmente, la continuidad al cerrar sesión depende del mecanismo y de las políticas de Windows. No cerrar RDP ni reiniciar el equipo durante la capacitación para comprobarlo. Programar esa prueba con el responsable operativo.

## 4. Si se decide formalizar un servicio

Es un cambio de infraestructura separado, no un paso automático de esta entrega. IT debe elegir y aprobar wrapper/mecanismo, versión, cuenta, permisos, logs, recuperación, acceso de red y ventana. No hay un comando de instalación válido incluido en este release.

Consideraciones de diseño:

- Usar rutas absolutas del Node aprobado y del `server.js` del release; no depender del PATH o del perfil interactivo del presentador.
- Definir `TRACKING_API_PROXY_TARGET`, `PORT` y `HOSTNAME` en el mecanismo de arranque. Ejecutar directamente Node permite controlar HOSTNAME; el start.cmd actual fuerza 0.0.0.0.
- Revisar la ubicación permanente del runtime: actualmente está dentro del perfil de un usuario. Una cuenta de servicio no hereda automáticamente los permisos de ese usuario.
- Otorgar sólo los permisos necesarios: lectura/ejecución para binarios y release, escritura en logs y cachés que el mecanismo requiera; proteger código y configuración de modificaciones no autorizadas.
- No cambiar a LocalSystem para sortear permisos. Elegir la cuenta según la política y autenticación necesarias hacia el backend.
- Definir rotación de logs y respuesta ante salida del proceso; eso no detecta por sí solo una aplicación colgada o un backend inaccesible.
- Aprobar firewall, TLS y autenticación. El frontend no instala certificados, reglas de firewall ni un sistema de roles.

Una prueba de servicio debe incluir salud HTTP, acceso desde una estación autorizada y recuperación/cierre de sesión/reinicio únicamente en la ventana aprobada. Registrar lo que se probó realmente.

## 5. Actualización y rollback

Seguir [Despliegue Windows](windows-standalone-deployment.md). No ejecutar `pnpm package:windows` en el fuente actual del servidor: recrea el runtime que está dentro de ese árbol.

Preparar y verificar la nueva versión en una carpeta distinta. En la ventana acordada, actuar únicamente sobre la instancia o servicio identificado. Conservar el release previo y su configuración; si falla, recuperar ambos usando el mecanismo real de arranque.

No ejecutar paradas por nombre genérico como “todos los node”. No alterar el backend 8085 para resolver un conflicto del frontend 3000. El rollback del frontend no deshace selecciones ni correcciones ya aceptadas por Tracking.

Para la capacitación basta explicar este procedimiento y mostrar evidencia existente. No instalar, registrar ni reiniciar servicios como demostración.

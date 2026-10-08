# Servicio de Windows para TX1 Tracking HMI

Esta guía describe el ayudante `service.ps1` preparado en la raíz sobre
`600d20f`. **Esta rama integrada y su empaquetador legacy no incorporan el ayudante**, al igual que el antecedente FIFO `77f79bf`: disponer de esta
guía no significa disponer del script ni tener un servicio instalado.
La selección de un kit que incluya el ayudante y su aceptación en el destino
se registran en `docs/estado-entrega.md` del paquete fuente aprobado; ese
documento no se incluye automáticamente en el runtime standalone. No se afirma una
instalación real, prueba de reinicio ni recuperación de un servicio en planta.

La preparación de archivos no registra ni inicia servicios. El registro y la
puesta en marcha se hacen en el servidor autorizado, después de acordar con
IT el destino de la API, la cuenta, los permisos y la red. El servidor ejecuta
Node; las estaciones cliente solo necesitan navegador y acceso a su URL.

La preparación documentada utiliza Windows x64, Windows PowerShell 5.1, Node
compatible con el release y `WinSW.NET461.exe` versión 2.12.0. Este último
requiere .NET Framework; IT debe comprobar compatibilidad y requisitos del
binario con el sistema destino. La versión observada en un kit previo no
garantiza soporte vigente ni que ese binario esté incluido en otro paquete.
El script usa archivos locales y no descarga ni instala Node ni WinSW.
Conservar binarios, licencias y sumas de verificación del conjunto aprobado.

## Configurar una vez

Extraiga cada release en su propia carpeta. Mantenga el directorio permanente
del servicio separado de los releases y de los perfiles de usuario:

```text
C:\Nucor\Tracking\
  service-settings.json
  service\                  # wrapper, XML, registro propio, logs y backups
  tools\WinSW.NET461.exe
  releases\600d20f-session\tx1-tracking-windows\
```

Solo si están incluidos en el kit aprobado, copie `service-settings.example.json` como
`C:\Nucor\Tracking\service-settings.json` y ajuste todos los campos. El nombre
`600d20f-session` es un ejemplo: use la carpeta realmente entregada y revise
su `RELEASE.txt`. Las rutas deben ser absolutas y locales. `NodePath` debe
apuntar a `node.exe`; `WinSWPath` al wrapper original 2.12.0. `ServiceDirectory`
debe ser una carpeta nueva o vacia en su primera preparacion.

`ApiUrl` es la base HTTP de MaterialTrackingService vista desde el servidor
del Front, por ejemplo `http://localhost:8085`, sin agregar
`/api/tracking/status`. No agregue credenciales, contrasenas, tokens, query ni
fragmentos al JSON o a la URL. `localhost` solo aplica si ambos procesos viven
en el mismo servidor. `BindHost: "0.0.0.0"` escucha IPv4 en sus interfaces;
IT debe limitar el acceso al puerto elegido a la red autorizada.

Los comandos son ejemplos para una ventana de instalación autorizada, no
acciones ejecutadas al leer esta guía. En Windows PowerShell 5.1, desde la
carpeta que realmente contiene el ayudante aprobado:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\service.ps1 -SettingsPath C:\Nucor\Tracking\service-settings.json -Action Prepare
```

`Prepare` es tambien la accion predeterminada. Genera
`service\TX1TrackingHMI.exe`, `service\TX1TrackingHMI.xml` y un registro de
propiedad con hashes. No requiere elevacion si la carpeta permite escribir a
su usuario. El XML usa rutas absolutas, `NODE_ENV=production`, el destino API,
host y puerto elegidos. No inicia Node. No modifica permisos.

El wrapper ejecuta directamente el `node.exe` y `server.js` configurados;
no pasa por `start.cmd`. Por eso `BindHost` determina HOSTNAME en el servicio
y no depende de que el lanzador manual antiguo lo fuerce a `0.0.0.0`.
No registrar `node.exe` directamente con `sc create`: Node no implementa por
sí solo el protocolo de servicio Windows. WinSW proporciona esa integración.

No edite a mano el XML o el ejecutable preparado. El asistente rechaza archivos
alterados, IDs pertenecientes a otro servicio, cuentas diferentes de LocalService,
rutas de configuracion distintas y cambios mientras el servicio esta activo.
El directorio del servicio no admite junctions, symlinks, perfiles de usuario,
carpetas de sistema ni raices amplias. Conserve su archivo `.tx1-service.json`.

## Permisos que debe preparar IT

El servicio usa la cuenta integrada **LocalService**, SID `S-1-5-19`, sin
contrasena. Sus permisos sobre archivos deben quedar asi:

| Destino | LocalService | Administradores de despliegue |
| --- | --- | --- |
| Directorios padres de las rutas utilizadas | Recorrido y lectura necesarios para llegar a los archivos | Administracion segun IT |
| Carpeta completa del release, incluidos `server.js`, `.next` y `node_modules` | Lectura y ejecucion | Modificar para desplegar |
| `node.exe` y los archivos necesarios de su instalacion | Lectura y ejecucion | Administracion segun IT |
| Directorio del servicio, wrapper, XML y registro de propiedad | Lectura y ejecucion | Modificar |
| `service\logs` | Modificar, heredable a archivos y subdirectorios | Modificar |
| `<release>\.next\cache` | Modificar, heredable a archivos y subdirectorios | Modificar |

Usuarios sin funciones de despliegue no deben poder modificar el release,
Node, el wrapper, XML ni JSON. El asistente no elimina permisos heredados ni
cambia ACL de carpetas padre, perfiles, discos, Node o el release completo.
IT debe revisar la herencia y los permisos existentes antes de instalar.

Estos comandos de ejemplo modifican ACL: IT debe revisar y sustituir las rutas
antes de usarlos. Agregan lectura al release exacto y al directorio de Node;
no sustituyen la revisión de permisos heredados, junctions ni cuentas existentes:

```powershell
icacls.exe 'C:\Nucor\Tracking\releases\600d20f-session\tx1-tracking-windows' /grant '*S-1-5-19:(OI)(CI)RX' /T
icacls.exe 'C:\Program Files\nodejs' /grant '*S-1-5-19:(OI)(CI)RX'
```

El servidor debe permitir salida de LocalService hacia la API. LocalService
no aporta credenciales de dominio a una API remota; una API que exige Windows
Authentication requiere un diseno de cuenta/autenticacion aprobado por IT y
no esta cubierta por esta configuracion. No cambie a LocalSystem para evitar
resolver permisos. Esta version del asistente admite solamente LocalService.

## Registrar e iniciar en el servidor

En una consola **Windows PowerShell como administrador**, desde el release:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\service.ps1 -SettingsPath C:\Nucor\Tracking\service-settings.json -Action Install -GrantLocalServicePermissions
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\service.ps1 -SettingsPath C:\Nucor\Tracking\service-settings.json -Action Start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\service.ps1 -SettingsPath C:\Nucor\Tracking\service-settings.json -Action Status
```

`Install -GrantLocalServicePermissions` agrega lectura/ejecucion a la carpeta
propia del servicio y Modificar solamente a sus logs y al cache del release.
Crea esas dos carpetas si faltan. Si IT ya configuro estos permisos, omita el
switch. `Install` registra el servicio y lo deja detenido. Si el mismo servicio
ya existe, verifica su identidad y no reemplaza su registro. `Start` exige
que el JSON coincida con el XML generado por `Prepare`.

El XML generado configura inicio automático diferido y acciones de reinicio
a los 10, 30 y 60 segundos. También configura rotación por tamaño de salida y
errores, umbral 10 MiB y ocho archivos históricos. Revisar `service\logs` y
el Visor de eventos si falla. Son ajustes solicitados al wrapper: su operación
real y la recuperación tras un fallo deben verificarse en el destino.
No detectan por sí solos toda aplicación colgada o una API backend inaccesible.
El estado `Running` solo confirma el proceso del servicio; verifique tambien:

```powershell
curl.exe -i http://localhost:8085/api/tracking/status
curl.exe -i http://localhost:3000/
curl.exe -i http://localhost:3000/tracking-api/api/tracking/status
```

Cambie host/puerto segun el JSON. Desde una estacion autorizada abra
`http://IP_DEL_SERVIDOR:3000` y compruebe datos live, las zonas reportadas por
el backend y las selecciones acordadas de Mill Order, Destination e impresora.
Estas comprobaciones son lecturas. Guardar selecciones o ejecutar comandos
en producción requiere una prueba de puesta en marcha explícitamente autorizada.
Confirme arranque automatico despues de un reinicio
del servidor durante la ventana de puesta en marcha. El asistente no crea
reglas de firewall ni instala certificados.

## Actualizacion y rollback

Conserve el release anterior. Prepare la siguiente version en otra carpeta y
valide sus permisos. Mantenga iguales `ServiceId` y `ServiceDirectory`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\service.ps1 -SettingsPath C:\Nucor\Tracking\service-settings.json -Action Stop
# Edite ReleasePath en service-settings.json para apuntar al release nuevo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\service.ps1 -SettingsPath C:\Nucor\Tracking\service-settings.json -Action Prepare
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\service.ps1 -SettingsPath C:\Nucor\Tracking\service-settings.json -Action Install -GrantLocalServicePermissions
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\service.ps1 -SettingsPath C:\Nucor\Tracking\service-settings.json -Action Start
```

`Prepare` conserva una copia de los archivos anteriores en `service\backups`
antes de actualizar un servicio detenido. Si falla la comprobacion HTTP o
funcional, ejecute `Stop`, restaure en el JSON `ReleasePath` y cualquier otro
valor anterior, repita `Prepare` y `Start`. No elimine el release anterior.
Puede detener o consultar el servicio aunque el release ya no sea accesible.
Para cambiar ID, cuenta o directorio del servicio, planifique una baja y alta;
no reutilice registros desconocidos ni copie archivos sobre un servicio activo.

Detener solamente el servicio identificado por este JSON, nunca todos los
procesos Node del servidor. Un rollback del Front no deshace selecciones o
comandos ya aceptados por Tracking.

Para retirar solo el registro, sin borrar archivos ni permisos:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\service.ps1 -SettingsPath C:\Nucor\Tracking\service-settings.json -Action Stop
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\service.ps1 -SettingsPath C:\Nucor\Tracking\service-settings.json -Action Uninstall
```

Referencias de WinSW 2.12.0:
[configuracion XML](https://github.com/winsw/winsw/blob/v2.12.0/doc/xmlConfigFile.md) y
[rotacion y errores](https://github.com/winsw/winsw/blob/v2.12.0/doc/loggingAndErrorReporting.md).

# Despliegue Windows y cambio de equipo

Antes de usar los ejemplos, revisar `docs/estado-entrega.md` en el paquete fuente aprobado; ese documento no se incluye automáticamente en el runtime standalone. La aceptación del fuente, su correspondencia con el ZIP y las pruebas en el destino se registran allí. Actualizar documentos no actualiza los ZIP existentes. Esta guía distingue dos variantes que no deben confundirse:

| Característica | Esta rama integrada: empaquetador legacy (heredado de FIFO `77f79bf`) | Preparación de herramientas separada sobre `600d20f` |
| --- | --- | --- |
| Empaquetador | Sin parámetros propios | Admite `-SourceVersion`, `-PackageName` y `-SkipBuild` |
| Salidas existentes | Elimina y recrea `dist\tx1-tracking-windows` y su ZIP | Rechaza sobrescribir; requiere otro nombre |
| `start.cmd` | Siempre fija `HOSTNAME=0.0.0.0` | Respeta HOSTNAME existente; usa `0.0.0.0` si falta |
| Ayudantes nuevos | No incorpora `service.ps1`, JSON de servicio ni `test-deployment.ps1` | Contiene esos archivos como preparación de un kit |
| Identificación del ejecutable | RELEASE con commit, asunto, fecha y modo live | Además SourceVersion, origen, BuildId, herramientas y plataforma |

El registro histórico sitúa el Front FIFO `77f79bf` en 3000 y Tracking 0.42 en 8085. La nueva rama `release/integrated-hmi` reúne FIFO, REMOVE y reposicionamiento para un único frontend; su publicación y cambio de instancia se registrarán después de ejecutarse. El destino operativo previsto sigue siendo 3000. No se acredita una instalación como servicio. Copiar esta guía no incorpora los helpers Windows del kit separado.

El HMI necesita un proceso Node porque `/tracking-api` es un proxy servidor. No funciona copiando HTML a IIS ni abriendo `index.html`. Llevar el ZIP compilado evita instalar pnpm y compilar en planta. Mantener el fuente para futuras modificaciones.

## Requisitos por equipo

| Equipo | Instalacion necesaria |
| --- | --- |
| PC de un operador que abre una URL | Navegador aprobado por IT y acceso a la URL del HMI; no requiere Node ni pnpm |
| Servidor/PC que ejecuta el ZIP | Windows y Node compatibles con la arquitectura del artefacto, acceso HTTP(S) a MaterialTrackingService |
| Equipo de desarrollo/build | Node, pnpm 10.34.5, fuente/lock; acceso a registro de paquetes y Google Fonts |
| Arranque como servicio | Lo anterior mas WinSW 2.12.0 y permisos de administrador para registrar el servicio |
| Backend de Tracking | Instalacion independiente a cargo de su equipo; este ZIP no contiene Tracking, PLC, QMOS ni bases de datos |

Referencias observadas en la preparación local: Next.js `16.3.0`, Node Windows x64 `24.21.0` y pnpm `10.34.5`. El `package.json` de Next instalado exige Node `>=20.9.0`; ese mínimo técnico no certifica soporte vigente ni compatibilidad con cualquier Windows. IT debe aprobar runtime y sistema del destino. Un kit previo contiene Node portable; verificar el manifiesto y checksum del artefacto concreto antes de afirmar que está incluido en otra entrega.

El ayudante preparado acepta el wrapper `WinSW.NET461.exe` versión `2.12.0`, comprobando sus metadatos. Esta variante usa .NET Framework: verificar sus requisitos, instalación y políticas con IT. El script no instala Node, WinSW ni componentes de Windows.

El empaquetador mejorado admite Windows x64 o arm64, pero su ayudante `test-deployment.ps1` verifica específicamente Windows/Node x64. Una entrega arm64 necesita su propia validación; no extrapolar el resultado de x64.

## Preparar la carpeta

Extraer el ZIP standalone en una carpeta nueva, local y permanente, por ejemplo:

```text
C:\Nucor\Tracking\releases\600d20f-session\tx1-tracking-windows\
```

Conservar toda su estructura: `server.js`, `node_modules`, `.next`, `public` y herramientas. `node_modules` y `.next` son necesarios en el ejecutable aunque no se entreguen en el ZIP fuente. No instalar dependencias dentro del standalone.

Comparar primero el SHA-256 con el manifiesto aprobado y revisar `RELEASE.txt` dentro del ejecutable. El nombre del archivo no identifica su contenido:

```powershell
Get-FileHash -LiteralPath 'C:\Entrega\PAQUETE_APROBADO.zip' -Algorithm SHA256
```

Un hash correcto de un ZIP antiguo acredita ese ZIP antiguo, no que contenga FIFO o los últimos documentos. Un `GitCommit` del empaquetador anterior tampoco certifica por sí solo que el árbol estuviera limpio durante la compilación. Para transferir fuente, consultar `docs/entrega-git.md` en el paquete fuente aprobado; no buscarlo como archivo del runtime.

Si se usa Node portable, extraer el ZIP de prerequisites en `C:\Nucor\Tools`. Para esta consola:

```powershell
$env:Path = 'C:\Nucor\Tools\node-v24.21.0-win-x64;' + $env:Path
node --version
```

Para el servicio configurar `NodePath` absoluto; no depende del PATH de la sesion RDP. Si IT instala Node en `C:\Program Files\nodejs`, usar esa ruta.

## Configuracion de la red

| Topologia | `TRACKING_API_PROXY_TARGET` en el proceso HMI |
| --- | --- |
| HMI y Tracking en la misma maquina | `http://localhost:8085` |
| HMI y Tracking en maquinas diferentes | `http://HOST_TRACKING:8085` |

El navegador siempre usa `/tracking-api` en el host HMI. Los operadores usan `http://HOST_HMI:3000` o el DNS/HTTPS corporativo. `localhost` en la PC de un operador apunta a esa PC. RDP no conecta automaticamente los dos procesos.

IT debe permitir el puerto HMI desde las estaciones autorizadas y la salida del HMI hacia Tracking. No es necesario abrir 8085 a todos los navegadores. El paquete no modifica firewall. Si se exige HTTPS/autenticacion, configurar el reverse proxy/certificado corporativo y controlar el acceso a los comandos globales; no hay login/roles propio en esta version.

## Comprobaciones y arranque manual

Los comandos son ejemplos para el equipo autorizado; no se ejecutan por estar documentados. Desde la carpeta extraída, comprobar Node, Tracking y el puerto antes de arrancar:

```powershell
node --version
curl.exe -i http://HOST_TRACKING:8085/api/tracking/status
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress, LocalPort, OwningProcess
$env:TRACKING_API_PROXY_TARGET = 'http://HOST_TRACKING:8085'
$env:HOSTNAME = '127.0.0.1'
$env:PORT = '3001'
node server.js
```

Sustituir HOST_TRACKING por el valor real y elegir un puerto libre aprobado. La consulta solo identifica un conflicto: no termina procesos. El ejemplo usa loopback/3001 para probar sin sustituir el Front en 3000. Para estaciones remotas, IT debe aprobar la dirección de escucha; `0.0.0.0` expone todas las interfaces IPv4. No terminar todos los procesos Node ni reiniciar Tracking para liberar un puerto.

También puede usarse `start.cmd`, teniendo presente que el lanzador FIFO sobrescribe siempre HOSTNAME con `0.0.0.0`; el mejorado respeta el valor existente. Mantener abierta la consola para arranque manual y usar Ctrl+C para detener ese proceso. El servicio utilizará su propia ruta absoluta de Node y configuración.

Desde otra consola, ajustando host y puerto al proceso real:

```powershell
curl.exe -i http://localhost:3001/
curl.exe -i http://localhost:3001/tracking-api/api/tracking/status
curl.exe -i http://localhost:3001/tracking-api/api/tracking/state
```

Solo si el paquete aprobado incluye el ayudante mejorado:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\test-deployment.ps1 -ApiTarget 'http://HOST_TRACKING:8085' -HmiUrl 'http://localhost:3001'
```

El diagnóstico solo hace GET y comprueba HTTP/JSON, archivos y Node. Admite también `-ReleasePath`, `-NodePath` y `-TimeoutSeconds`. No certifica todos los campos DTO, persistencia, PLC, impresión ni recuperación del servicio. Complementarlo con la interfaz: Live API, selecciones leídas, números completos y estados/peso/buffers. En FIFO revisar QueueSequence y los miembros sin orden conocido. Probar desde otra estación confirma su ruta de red.

No guardar Mill Order, Destination o impresora para probar conectividad. Las escrituras en producción requieren una prueba de puesta en marcha explícitamente autorizada.

## Servicio permanente

Seguir [Servicio de Windows](windows-service.md) solo cuando se haya aprobado un kit que incluya sus ayudantes. Esta rama integrada no los incorpora. Completar rutas, API, dirección de escucha y puerto según esa guía. Prepare genera configuración sin registrar nada; Install y Start son acciones explícitas en una consola administradora del destino. Su presencia en el fuente no significa que un servicio ya esté instalado o probado.

WinSW proporciona el protocolo de servicio, logs y recuperacion. No usar `sc create` directamente contra `node.exe`: Node por si solo no implementa un servicio Windows. No dejar dos instancias en el mismo puerto. Verificar arranque tras cerrar RDP y, en una ventana aprobada, despues de reiniciar Windows. Reinicio automatico por salida del proceso no detecta toda posible aplicacion colgada.

## Generar un paquete nuevo desde el fuente

Primero identificar el script disponible. En esta rama integrada, igual que en FIFO `77f79bf`, `pnpm package:windows` no acepta parámetros propios y elimina/recrea sus dos salidas fijas. Usarlo solo en una copia de build aislada, sin un despliegue activo ni un artefacto que deba conservarse en esas rutas. Su identificación Git automática no garantiza procedencia en una exportación sin Git: podría no obtener metadatos o detectar un repositorio padre. Registrar y revisar el origen por separado.

### Empaquetado disponible en esta rama integrada

Desde un checkout aislado del commit integrado final, con salidas anteriores respaldadas y sin un proceso ejecutándose desde esas salidas:

```powershell
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Falló la instalación; no continuar.' }
pnpm typecheck
if ($LASTEXITCODE -ne 0) { throw 'Falló TypeScript; no empaquetar.' }
git status --short --branch
git log -1 --oneline
# Confirmar que el commit es el release aprobado y que el árbol no tiene cambios.
pnpm package:windows
if ($LASTEXITCODE -ne 0) { throw 'Falló el empaquetado; no desplegar.' }
Get-Content -LiteralPath '.\dist\tx1-tracking-windows\RELEASE.txt'
```

Completar también las regresiones FIFO/manuales descritas en [Simulador](tracking-api-simulator.md). Este script conserva sus rutas fijas; no pasarle `-SourceVersion` ni `-PackageName`. Si hay cambios locales o un merge pendiente, terminar la identificación/revisión antes de generar el release final. Conservar el runtime anterior y su configuración antes de sustituir la instancia en 3000.

### Referencia histórica: empaquetador mejorado no incluido

Los ejemplos siguientes corresponden únicamente al empaquetador mejorado de la preparación separada; **no son comandos disponibles en esta rama integrada**. No ejecutar estos parámetros sin disponer de aquel script.

En Windows x64, en una copia de fuente con Node/pnpm:

```powershell
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Falló la instalación; no continuar.' }
pnpm typecheck
if ($LASTEXITCODE -ne 0) { throw 'Falló TypeScript; no empaquetar.' }
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-windows-standalone.ps1 -SourceVersion 'IDENTIFICADOR_APROBADO' -PackageName 'tx1-tracking-windows-NUEVA_VERSION'
if ($LASTEXITCODE -ne 0) { throw 'Falló el empaquetado; no desplegar.' }
```

En esta variante, `-SourceVersion` es obligatorio en una copia sin Git. Sin ese parámetro, exige que el proyecto sea su propio repositorio y esté limpio antes de leer el commit. Un identificador explícito es una declaración de quien empaqueta, no una certificación independiente del contenido. Para otra versión o una salida nueva:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-windows-standalone.ps1 -SourceVersion 'VERSION_APROBADA' -PackageName 'tx1-tracking-windows-NUEVA'
```

Usar un identificador real de fuente aprobado. La preparación sobre `600d20f` no debe presentarse como un nuevo commit ni como el commit FIFO. Este empaquetador rechaza sobrescribir salidas existentes: conservar la anterior y elegir otro nombre. `-SkipBuild` compara SourceVersion, BuildId y ajustes públicos con `.next/windows-package-build.json`; no calcula un hash completo del fuente. Si cambió el código desde el build, reconstruir sin ese switch.

El build incorpora modo live, `/tracking-api`, polling 1000 ms, stale 3500 ms y timeout 4000 ms. Modificar `NEXT_PUBLIC_*` exige un nuevo build. Cambiar `TRACKING_API_PROXY_TARGET`, PORT o HOSTNAME requiere configurar/reiniciar el proceso, sin reconstruir. El empaquetador mejorado excluye `.env*` y verifica que sus dependencias se resuelvan dentro del paquete, sin enlaces al repositorio original. El antiguo no realiza esas mismas comprobaciones: inspeccionar y probar su ZIP concreto, sin asumir exclusiones por el nombre del archivo.

## Actualizacion y rollback

1. Verificar checksum, procedencia y RELEASE.txt del artefacto aprobado; extraer en otra carpeta.
2. Probar con otro puerto y lecturas GET, sin modificar selecciones de planta.
3. Anotar carpeta/version activa y conservar su configuracion.
4. Detener solo la instancia HMI acordada. Si utiliza el ayudante WinSW aprobado, cambiar ReleasePath en el JSON, ejecutar Prepare y arrancar según la guía. Con arranque manual, iniciar la nueva carpeta con la configuración registrada.
5. Validar GET, UI y acceso desde otra PC; registrar resultado.
6. Si falla, detener la nueva instancia y recuperar carpeta/configuración anterior; con WinSW repetir Prepare y Start. Conservar la versión anterior.

Este rollback restaura el frontend; no revierte selecciones globales guardadas en Tracking.

## Diagnostico rapido

| Sintoma | Revisar |
| --- | --- |
| `node` no encontrado | Instalacion/PATH o NodePath absoluto |
| `EADDRINUSE` | Otra instancia en el mismo puerto; identificar antes de parar |
| HTTP 502 en `/tracking-api` | Conectividad HMI->Tracking, host, puerto, backend |
| HTTP 503 de configuracion | TRACKING_API_PROXY_TARGET del proceso real |
| Respuesta incompatible | JSON y DTO; un 200 solo no valida formato |
| Live no aparece | Build live, bootstrap status/capabilities/map, state y proxy |
| Sin peso | Bundle en SGRT2 exacto y Weight; no SGRT2A/B |
| Falla como servicio pero no manual | Permisos a Node/release/logs/cache, rutas y logs de WinSW |
| Falla en otra PC | Windows/arquitectura/Node, ZIP completo, antivirus, dependencias nativas |
| Se para al cerrar RDP | Se dejo arranque manual; comprobar servicio |

No reiniciar backend/PLC ni cambiar endpoints a ciegas para corregir un problema del Front.

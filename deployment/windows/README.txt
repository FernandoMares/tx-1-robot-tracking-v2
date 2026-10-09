TX1 TRACKING HMI — WINDOWS STANDALONE INTEGRADO
================================================

ALCANCE E IDENTIDAD
------------------
El frontend integrado reúne FIFO, REMOVE, reposicionamiento, selección global
de Mill Order / Destination / impresora, diagramas y peso SGRT2.

La instalación de referencia de la capacitación usa:
  Rama: release/integrated-hmi
  Commit: 7fc34e863ed0a9b12e955ae28a224996e84fd011
  Fuente:
    C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8
  Runtime:
    C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8\dist\tx1-tracking-windows
  HMI: puerto 3000
  Backend local: puerto 8085, API v0.42 observada

El integrado ya fue publicado y puesto en servicio. Para identificar ESTE
paquete concreto, leer su RELEASE.txt y .next\BUILD_ID: una guía copiada o un
nombre de carpeta no acreditan la procedencia de otra compilación.

Actualizar este README en el fuente no actualiza un ZIP ni un runtime
previamente generados. La documentación completa pertenece al fuente.

CAPACITACIÓN SOBRE EL SERVIDOR REAL
----------------------------------
La sesión es de lectura de código y diagnóstico sobre la instancia existente.
No requiere simulador, pnpm install, build, otra instancia, reinicio ni cambios
en Git. No ejecutar start.cmd si el HMI ya está funcionando.

Comprobaciones PowerShell de sólo lectura, desde el servidor:

  Get-Content -LiteralPath 'C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8\dist\tx1-tracking-windows\RELEASE.txt'
  Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue |
      Select-Object LocalAddress, LocalPort, OwningProcess
  Invoke-RestMethod -Uri 'http://127.0.0.1:8085/api/tracking/status' -TimeoutSec 10
  Invoke-RestMethod -Uri 'http://127.0.0.1:3000/tracking-api/api/tracking/status' -TimeoutSec 10

Identificar PID, ejecutable y mecanismo de arranque antes de cualquier cambio.
No cerrar la consola/RDP ni detener el backend para demostrar recuperación.
No usar cambios de selección o correcciones de bundles como prueba de conexión.

FUENTE Y PAQUETE COMPILADO
-------------------------
El runtime contiene server.js, node_modules, .next y public. Conservar toda su
estructura. No es el repositorio TypeScript y no instalar dependencias dentro.
Node es necesario; pnpm, Git y editor no son requisitos para ejecutar este ZIP.
Tracking, QMOS, PLC y bases de datos son sistemas separados.

La preparación integrada se verificó con Node Windows x64 24.21.0 y pnpm
10.34.5 para build. IT debe aprobar las herramientas del destino. El Node del
PATH de una consola puede no ser el ejecutable que usa el proceso activo.

ARRANQUE Y CONFIGURACIÓN
-----------------------
Durante una ventana autorizada, un arranque manual usa start.cmd desde el
release aprobado, únicamente cuando el puerto acordado esté libre y se haya
identificado la instancia anterior. El script ejecuta node server.js.

El launcher:
  - cambia a su propia carpeta;
  - usa Node del PATH;
  - usa TRACKING_API_PROXY_TARGET=http://localhost:8085 si falta la variable;
  - usa PORT=3000 si falta la variable;
  - SIEMPRE fija HOSTNAME=0.0.0.0;
  - no registra servicios ni implementa recuperación automática.

Definir HOSTNAME antes de start.cmd no restringe su escucha. Un mecanismo
aprobado que necesite otra dirección debe configurar el entorno y ejecutar
Node directamente, con sus rutas verificadas. No cambiarlo durante la sesión.

localhost representa este servidor HMI. La URL del navegador y el destino
privado del backend son distintos. No poner credenciales en la URL.

NEXT_PUBLIC_* se incorpora al build. Cambiar esas variables después no modifica
el JavaScript compilado. El destino privado del proxy se configura al ejecutar;
cambiarlo requiere aplicar el entorno y reiniciar el proceso correcto en una
ventana acordada, no necesariamente reconstruir.

ADVERTENCIA DEL EMPAQUETADOR
---------------------------
pnpm package:windows ejecuta un build nuevo live y ELIMINA/RECREA sus salidas:
  dist\tx1-tracking-windows
  dist\tx1-tracking-windows.zip

En el fuente actual del servidor esa carpeta es el runtime activo. NO ejecutar
el empaquetador allí durante operación o capacitación. Usar una copia de build
separada, conservar el paquete anterior y planificar el cambio.

Este empaquetador no acepta -SourceVersion, -PackageName ni -SkipBuild.
Sólo copia start.cmd y README.txt como herramientas Windows. NO incluye
service.ps1, service-settings.example.json ni test-deployment.ps1.

Una respuesta HTTP no acredita instalación como servicio ni continuidad tras
cerrar sesión/reiniciar. Si se requiere operación desatendida, IT debe aprobar
el mecanismo, cuenta, permisos, logs y pruebas. Node por sí solo no implementa
el protocolo de servicio Windows. No registrar ni reiniciar servicios para
demostrar conceptos durante la capacitación.

OPERACIÓN Y SEGURIDAD
--------------------
FIFO se presenta en tarjetas de zona según LogicalBufferName/QueueSequence,
no ordena el listado general Tracked bundles ni modifica CurrentZone.
Campos FIFO nulos no acreditan orden real ni demuestran por sí solos un fallo.

REMOVE y Reposition están disponibles, pero su uso requiere autorización para
el bundle y operación concretos. OperatorId es texto de auditoría, no login.
202/accepted significa aceptación, no finalización. Si el resultado es incierto,
consultar estado/auditoría; no repetir automáticamente el comando.

El proxy limita rutas, pero no aporta autenticación, roles o TLS. Coordinar
acceso, firewall y telemetría con IT. Un rollback del frontend no revierte
selecciones ni correcciones que Tracking ya haya aceptado.

GIT Y DOCUMENTACIÓN
------------------
La publicación del integrado no equivale a transferencia al Git corporativo:
URL y acceso corporativos siguen pendientes. No efectuar push automático.

En el fuente: docs/windows-standalone-deployment.md, docs/windows-service.md,
docs/entrega-git.md, docs/tracking-api-integration.md y docs/estado-entrega.md.
Durante la sesión, inspeccionar la instalación; construir, desplegar o cambiar
infraestructura son actividades separadas y planificadas.

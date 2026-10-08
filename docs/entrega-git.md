# Transferir el fuente aprobado a un repositorio del equipo

La entrega debe empezar por una exportación limpia y aprobada, no por copiar toda la carpeta de trabajo del presentador. Este procedimiento describe acciones para el equipo receptor; no crea repositorios, cuentas, commits ni pushes automáticamente.

Consultar primero [Estado de la entrega](estado-entrega.md). Siguen pendientes la elección del fuente final, su correspondencia con el artefacto ejecutable y su aceptación. Tener un ZIP antiguo o un Front funcionando no resuelve esos tres puntos.

## 1. Identificar qué se recibió

Solicitar el ZIP fuente, su manifiesto de procedencia, su SHA-256 esperado y el informe de pruebas del mismo conjunto. El standalone es un entregable distinto: contiene `server.js`, dependencias de ejecución y `.next`, y no es la base que debe importarse como código fuente.

```powershell
Get-FileHash -LiteralPath 'C:\Entrega\FUENTE_APROBADO.zip' -Algorithm SHA256
```

Comparar el resultado con el manifiesto aprobado recibido por el canal acordado. Si se entrega `SHA256SUMS.txt`, usar la entrada de ese archivo exacto. No calcular una suma nueva y tratarla como prueba de que el origen era correcto.

Revisar el contenido de `SOURCE-RELEASE.txt` o del manifiesto equivalente y contrastarlo con el `RELEASE.txt` del ejecutable. Deben explicar base funcional, modificaciones incluidas, identificación del build y pruebas realizadas. Si faltan datos o hay contradicciones, mantener el artefacto como pendiente de aceptación.

La fuente actual `release/integrated-hmi` combina FIFO `77f79bf` y operaciones manuales `5338300`; el identificador que debe entregarse es su commit integrado final, no uno de esos antecedentes por separado. También existen la preparación histórica sobre `600d20f` y sus ZIP antiguos. El antiguo manifiesto `600d20f-session-20261001` no declara FIFO ni las actualizaciones posteriores. Renombrar su ZIP, copiarle una guía nueva o conservar su checksum no lo convierte en una exportación de otra versión. Tampoco el commit indicado por un empaquetador antiguo demuestra que el árbol estuviera limpio al compilar.

## 2. Extraer y revisar una copia independiente

Extraer en una carpeta nueva destinada a la transferencia, fuera del repositorio personal y de los worktrees del presentador. No trabajar sobre una aplicación en ejecución ni sobre la única copia de un entregable anterior.

Comprobar que la raíz de la aplicación contiene `package.json`, `pnpm-lock.yaml`, configuración, código y documentación. Un ZIP puede añadir una o dos carpetas contenedoras; entrar en la raíz real antes de ejecutar Git o pnpm.

La exportación debe excluir:

- `.git`, historial, remotos y configuraciones del repositorio anterior; `.github` con automatizaciones personales.
- Cuentas, tokens, claves privadas, certificados con clave, credenciales Git/npm y configuración de autenticación personal.
- `.env`, `.env.local` y otros archivos de entorno. Conservar solo un `.env.example` revisado, sin secretos ni datos privados.
- `node_modules`, `.next`, `dist`, `build`, `out`, cachés, perfiles de navegador, logs y ZIP de ejecución.
- Ajustes reales del servicio, logs y copias de seguridad operativas. Puede conservarse el JSON de ejemplo sanitizado que corresponda a la variante aprobada.
- Notas personales, capturas no aprobadas y carpetas de asistentes o editores ajenas al producto.

Conservar el lockfile, los avisos de licencia y los archivos necesarios para reproducir el proyecto. Excluir credenciales no implica borrar autoría o licencias. Las notas de quien presenta la capacitación no son instrucciones obligatorias para el operador.

Si la exportación todavía contiene archivos ajenos, corregir el conjunto de entrega antes de inicializar o copiarlo a otro repositorio. Un `.gitignore` evita futuras incorporaciones accidentales, pero no sanea un ZIP ni retira un secreto ya versionado.

## 3. Crear `.gitignore` antes de preparar el primer índice

La copia limpia puede no incluir `.gitignore`. Crearlo en la raíz real de la aplicación antes de ejecutar `git add`. Este punto de partida debe ajustarse al conjunto aprobado:

```gitignore
/node_modules/
/.next/
/dist/
/build/
/out/
/.vercel/
/.github/
/.codex/
/.agents/
/.vscode/
/.idea/
.env*
!.env.example
*.log
*.tsbuildinfo
next-env.d.ts
service-settings.json
.tx1-service.json
/service/
/logs/
/backups/
/notas*/
```

Revisar también archivos ocultos. Una regla genérica no detecta una contraseña escrita dentro de un script o una URL. Revisar `package.json`, configuración, documentación y ejemplos antes de subirlos. No añadir exclusiones amplias como `*.json`: ocultarían archivos de aplicación y el lock de herramientas que sí deben conservarse.

## 4. Elegir el caso correcto de repositorio

### Repositorio corporativo nuevo y vacío

El equipo debe haber autorizado propietario, nombre, visibilidad, rama y acceso. Usar su autenticación corporativa mediante el mecanismo aprobado por IT, sin reutilizar la sesión o las credenciales del presentador ni incrustar tokens en URLs.

En la raíz del fuente limpio, comprobar primero que Git no está detectando un repositorio padre:

```powershell
git rev-parse --show-toplevel
```

En una exportación independiente sin Git se espera que ese comando informe que no está en un repositorio. Si devuelve una ruta, revisar el contexto antes de continuar. No borrar un `.git` que pertenece a otro trabajo.

Solo para esta copia nueva:

```powershell
git init -b main
git config --local user.name 'NOMBRE_APROBADO_POR_EL_EQUIPO'
git config --local user.email 'CORREO_CORPORATIVO_APROBADO'
git config --local user.useConfigOnly true
git remote add origin 'URL_CORPORATIVA_APROBADA_SIN_CREDENCIALES'
git remote -v
git ls-remote --heads origin
```

La identidad local de autor no es una credencial de acceso. No cambiar la identidad global de la PC. Si el remoto tiene ramas o contenido, utilizar el caso siguiente en lugar de intentar reemplazar su historial.

### Repositorio corporativo que ya existe

Clonar ese repositorio con la cuenta autorizada en otra carpeta y crear una rama de importación desde la base acordada:

```powershell
git clone 'URL_CORPORATIVA_APROBADA_SIN_CREDENCIALES' 'C:\Desarrollo\HMI_REPOSITORIO_EQUIPO'
Set-Location -LiteralPath 'C:\Desarrollo\HMI_REPOSITORIO_EQUIPO'
git switch -c entrega/importacion-hmi
git config --local user.name 'NOMBRE_APROBADO_POR_EL_EQUIPO'
git config --local user.email 'CORREO_CORPORATIVO_APROBADO'
git config --local user.useConfigOnly true
```

Comparar y copiar únicamente los archivos aprobados. Preservar `.git`, políticas, licencias, automatizaciones y trabajo existente del repositorio corporativo. Integrar sus reglas de exclusión; no sustituirlas a ciegas por el ejemplo anterior. Resolver diferencias por revisión del equipo y usar su flujo normal de pull request. No usar force push, reinicializar el repositorio existente ni unir historiales sin una decisión explícita de sus responsables.

## 5. Validar y revisar el índice antes de publicar

En el equipo de desarrollo, instalar desde el lockfile y ejecutar las comprobaciones disponibles para esa fuente:

```powershell
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Falló la instalación; no continuar.' }
pnpm typecheck
if ($LASTEXITCODE -ne 0) { throw 'Falló TypeScript; revisar antes de publicar.' }
pnpm build
if ($LASTEXITCODE -ne 0) { throw 'Falló el build; revisar antes de publicar.' }
```

En este fuente integrado ejecutar además `node scripts/test-fifo-ordering.mjs`, `node scripts/test-manual-removal.mjs`, `node scripts/test-manual-reposition.mjs`, `node scripts/test-manual-position.mjs` y `node scripts/test-integrated-tracking.mjs`, deteniéndose si cualquiera falla. El build debe registrar herramientas y ajustes públicos usados; un build predeterminado no implica que esté configurado para producción live. Ver [Despliegue Windows](windows-standalone-deployment.md) para el empaquetador concreto. La presencia de un script `lint` no certifica que exista una configuración funcional ni que se haya ejecutado.

Antes de preparar archivos, revisar exclusiones y contenido. Los siguientes comandos deben ejecutarse en la copia corporativa elegida, no en la carpeta personal:

```powershell
git status --short --ignored
git add -- .
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check
git diff --cached
```

Revisar el índice completo: sin dependencias/builds, secretos, rutas personales, notas internas o archivos de servicio reales. Si se incluyó algo por error, retirarlo del índice por su ruta exacta y revisar de nuevo; agregarlo después a `.gitignore` no elimina lo ya preparado. Si un secreto llegó a publicarse, coordinar su revocación con IT; borrarlo en otro commit no lo retira del historial.

Solo después de la revisión y aprobación del equipo, crear el commit y publicar en el caso que corresponda:

```powershell
git commit -m 'Import approved TX1 HMI source'
git log -1 --oneline
git status --short
```

Repositorio nuevo realmente vacío: `git push -u origin main`. Repositorio existente: `git push -u origin entrega/importacion-hmi` y abrir la revisión por el procedimiento del equipo. Estos son pasos de publicación explícitos; ninguno se ha ejecutado como parte de redactar esta guía. No usar `--force` ni sobrescribir ramas ajenas.

## 6. Registrar la transferencia

Anotar URL del repositorio, rama, commit receptor, responsable, versión original del fuente, hash del ZIP aprobado y resultado de las comprobaciones. El primer commit corporativo tendrá otra identidad: conservar la referencia al origen en el manifiesto, sin fingir que ambos hashes son el mismo commit.

La aceptación del código, la del paquete ejecutable y la de la instalación son registros distintos. Un push correcto no demuestra que el ZIP activo provenga de ese commit, que el servicio arranque tras reiniciar Windows o que se hayan validado escrituras en planta. Mantener esos puntos pendientes hasta disponer de su evidencia en el estado de entrega.

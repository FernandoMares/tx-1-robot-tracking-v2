# Fuente, Git y futura transferencia al repositorio corporativo

El frontend integrado ya fue publicado y desplegado desde `release/integrated-hmi`, commit `7fc34e863ed0a9b12e955ae28a224996e84fd011`. Eso no significa que el repositorio corporativo esté actualizado: todavía no se dispone de su URL ni del acceso necesario para esa transferencia.

La capacitación en el servidor consiste en identificar y leer el fuente real, sin pull, cambios de rama, commits ni push. La transferencia corporativa es una actividad posterior, con aprobación y credenciales del equipo receptor.

## 1. Referencias actuales

| Elemento | Ruta o identidad |
| --- | --- |
| Fuente del servidor | `C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8` |
| Rama de origen | `release/integrated-hmi` |
| Commit integrado | `7fc34e863ed0a9b12e955ae28a224996e84fd011` |
| Runtime activo | Subcarpeta `dist\tx1-tracking-windows` del fuente anterior |
| Servicio HTTP | HMI 3000 → backend local 8085, API v0.42 observada |
| Repositorio corporativo | URL, propietario, flujo de ramas y acceso aún pendientes |

El commit integrado reúne FIFO y acciones manuales; sus antecedentes `77f79bf` y `5338300` no deben presentarse por separado como el release completo. Un ZIP histórico `600d20f-session-20261001` tampoco se convierte en este release al renombrarlo.

Una actualización documental posterior puede añadir guías sin cambiar el runtime compilado. Registrar por separado versión del fuente/documentación y versión del paquete activo; copiar Markdown no recompila ni despliega el frontend.

## 2. Git que sí se puede mostrar durante la sesión

Estos comandos consultan el repositorio local del servidor, sin contactar remotos ni modificar ramas:

```powershell
$sourcePath = 'C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8'
git -C $sourcePath rev-parse --show-toplevel
git -C $sourcePath rev-parse HEAD
git -C $sourcePath branch --show-current
git --no-optional-locks -C $sourcePath status --short --branch
git -C $sourcePath log -5 --oneline
git -C $sourcePath ls-files -- app components hooks lib scripts deployment docs package.json pnpm-lock.yaml next.config.mjs
git -C $sourcePath diff --stat
git -C $sourcePath diff --cached --stat
git -C $sourcePath remote
```

Cómo leerlos:

- `rev-parse HEAD`: commit local actual; contrastarlo con la referencia integrada.
- `branch --show-current`: rama local; puede quedar vacío si se está en un checkout detached. Eso no borra ni cambia el commit.
- `status`: cambios locales/índice y referencias de seguimiento almacenadas; no demuestra el estado remoto más reciente sin fetch.
- `log`: historial local, no confirmación de qué proceso está ejecutándose.
- `ls-files`: fuente versionado; los archivos de runtime/dependencias son otra categoría.
- `diff --stat` y `diff --cached --stat`: diferencias de trabajo y del índice, sin mostrar contenido completo potencialmente sensible.
- `remote`: nombres configurados. No identifica por sí solo cuál es corporativo ni demuestra permisos.

No ejecutar `git pull`, `switch`, `reset`, `clean`, `add`, `commit` o `push` para demostrar conceptos en esa carpeta. No borrar un archivo `.git` por parecer pequeño: puede ser el enlace válido de un worktree.

Para mostrar fuente tal como está guardado en un commit, sin alterar el archivo abierto:

```powershell
git -C $sourcePath show HEAD:package.json
git -C $sourcePath show HEAD:next.config.mjs
```

Comparar con el archivo de trabajo permite explicar qué significa una modificación sin commit. No publicar URLs remotas, credenciales o diffs completos sin revisar su contenido.

## 3. Git no equivale a despliegue

La aplicación activa usa el paquete compilado en `dist\tx1-tracking-windows`. Un commit, pull o edición del TypeScript no reemplaza automáticamente ese paquete; por el contrario, ejecutar el empaquetador en esa raíz sí puede recrear la carpeta runtime y afectar la instancia activa.

Durante la sesión, sólo leer `RELEASE.txt`, `.next\BUILD_ID`, listener/PID y código, según [Despliegue Windows](windows-standalone-deployment.md). No recompilar para demostrar una línea de código ni asumir que un push actualiza el servidor.

El empaquetador disponible registra GitCommit, GitSubject, BuiltUtc y modo live. No certifica que el árbol estuviera limpio y no produce por sí mismo una exportación fuente ni un manifiesto SOURCE-RELEASE. En una copia sin Git sus metadatos pueden no estar disponibles o corresponder a un repositorio padre: registrar el origen de forma explícita.

## 4. Qué falta para la entrega corporativa

Antes de preparar una importación, acordar con el equipo:

| Decisión | Motivo |
| --- | --- |
| URL y propietario | Evitar publicar en un remoto personal o equivocado. |
| Acceso y autenticación | Usar identidad corporativa; no reutilizar tokens/sesiones del presentador. |
| Repositorio nuevo o existente | Cambia el procedimiento de importación y preservación de historial. |
| Rama y revisión | Respetar políticas y pull requests del equipo. |
| Fuente/documentación aprobados | Identificar qué commit y qué actualización documental se entregan. |
| Licencias y datos internos | Conservar avisos legales y sanear material no transferible. |
| Responsable y evidencia | Registrar hash de origen, destino, validaciones y aceptación. |

Hasta que se resuelvan URL/acceso no existe un push corporativo pendiente de “ejecutar sin más”. No inventar la URL ni afirmar que ya quedó actualizado.

## 5. Preparar el conjunto fuente — actividad posterior

Trabajar en otra carpeta, fuera del runtime activo y del repositorio personal. La transferencia puede preservar el historial aprobado o ser una importación limpia; el equipo decide cuál. No descartar autoría o licencias al sanear contenido.

Si se entrega un ZIP fuente, pedir o preparar un registro de procedencia aprobado con referencia original, alcance, cambios adicionales, herramientas/pruebas y SHA-256. No confundirlo con el ZIP standalone, que contiene server.js y archivos compilados.

Para verificar un archivo recibido, sólo después de confirmar su ruta real:

```powershell
Get-FileHash -LiteralPath 'C:\Entrega\FUENTE_INTEGRADO_APROBADO.zip' -Algorithm SHA256
```

Comparar contra el hash acordado recibido por otro canal. Calcular un hash nuevo no demuestra que el origen sea correcto.

La revisión del fuente debe excluir credenciales, tokens, claves, certificados privados, configuraciones reales de servicio, `.env.local`, logs, perfiles de navegador, dependencias y builds. Mantener `package.json`, `pnpm-lock.yaml`, configuración de aplicación, código, documentos aprobados y avisos de licencia.

Para una importación limpia, excluir también `.git`, remotos/configuración del origen y automatizaciones personales. Para preservar historial, revisar primero secretos y datos internos del historial con el procedimiento corporativo; un `.gitignore` nuevo no los elimina.

El fuente servidor contiene la ruta operativa del usuario en documentación de mantenimiento. El receptor debe decidir si conservarla como evidencia interna o sustituirla en una edición pública; no alterar silenciosamente el registro de lo desplegado.

## 6. Exclusiones y revisión

En la copia corporativa, integrar estas reglas con las existentes. No sustituir a ciegas las políticas del equipo ni excluir todos los JSON:

```gitignore
/node_modules/
/.next/
/dist/
/build/
/out/
/.vercel/
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
/service/
/logs/
/backups/
```

Revisar archivos ocultos y contenido, no sólo nombres. Las automatizaciones `.github`, notas del presentador y contratos internos se aceptan o excluyen mediante revisión específica; no eliminar los del repositorio corporativo existente.

Un archivo ya versionado o preparado en el índice no desaparece por agregarlo a `.gitignore`. Si un secreto se publicó, coordinar su revocación: borrarlo en otro commit no lo retira del historial.

## 7. Dos procedimientos futuros, no ejecutados en esta sesión

### Repositorio nuevo y vacío

Con URL/acceso confirmados, preparar una copia fuente aprobada independiente. Verificar que no está dentro de otro repositorio; inicializar el repositorio nuevo, configurar identidad local corporativa, añadir el remoto autorizado, revisar archivos/índice y crear el commit inicial. Publicar sólo la rama aprobada después de la revisión.

No cambiar la identidad global de la PC ni incrustar tokens en URLs. La identidad de autor de Git no es la credencial de acceso. Confirmar que el remoto esté realmente vacío antes de tratarlo como repositorio nuevo.

### Repositorio existente

Clonar con acceso corporativo en otra carpeta, crear una rama de importación desde la base acordada y comparar archivos. Preservar historial, políticas, licencias, automatizaciones y cambios del equipo. Integrar por su procedimiento de revisión; no usar force push, reinicializar ni unir historiales sin una decisión expresa.

No hacer esta importación dentro de la carpeta del servidor que contiene el runtime activo.

### Validación y publicación

La validación técnica ocurre en la copia de desarrollo, no en la sesión productiva: instalación desde lockfile, TypeScript, pruebas aplicables y build con configuración documentada. La suite integrada y las pruebas FIFO/manuales usan simuladores locales controlados; se ejecutan fuera de la capacitación solicitada sobre el servidor real.

Antes de cualquier commit, el receptor debe revisar `git status`, `git diff --cached --name-status`, `git diff --cached --check` y el contenido completo del índice en un entorno apropiado. No publicar automáticamente todos los archivos porque el build pasó. Commit y push son acciones independientes que requieren la revisión y autorización del equipo.

Esta guía no ha creado repositorios, preparado índices, publicado commits ni actualizado un remoto corporativo.

## 8. Acta de transferencia

Registrar repositorio destino, rama, commit receptor, responsable, referencia original `7fc34e863ed0a9b12e955ae28a224996e84fd011`, versión documental y hash del conjunto transferido. Si se hizo una importación limpia, el commit corporativo será distinto: conservar la relación de origen sin fingir igualdad de hashes.

Separar tres resultados: fuente entregado, paquete construido y versión realmente ejecutándose. Ninguno implica automáticamente aceptación FIFO en planta, éxito de comandos manuales o recuperación de un servicio Windows. Consultar [Estado de entrega](estado-entrega.md) y [Preguntas técnicas](preguntas-tecnicas.md).

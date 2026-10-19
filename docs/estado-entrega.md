# Estado de versiones, entregables y validación

Corte de evidencia de servidor: **13 de octubre de 2026, 23:39:33 -05:00 (14 de octubre, 04:39:33 UTC)**, con pruebas directas de nulidad en API 0.44; se conserva la evidencia histórica del 8 de octubre UTC, incluida la respuesta HTTP de las `02:11:48 GMT`. Actualización del checkpoint de fuente/documentación: **19 de octubre de 2026**. Este documento registra salidas compartidas por el usuario; no consulta automáticamente el servidor ni acredita aceptación industrial y distingue lo desplegado de los cambios de fuente posteriores. La lectura v0.44 identifica el backend, no un nuevo build HMI: `7fc34e8` sigue siendo el último frontend desplegado documentado, no una identificación nueva del proceso activo.

## 1. Qué versión estamos explicando

**Rama de trabajo: `release/integrated-hmi`.** Base funcional desplegada documentada **`7fc34e8`**, que combina FIFO `77f79bf` y acciones manuales `5338300`, con HMI **3000** y Tracking **8085**. Los checkpoints posteriores `90c849c` y `f11002b` incorporan mantenimiento, Bundler y Stacker. El checkpoint **`7fe8474` del 16 de octubre**, guardado y publicado, añade Bay 1/Bay 2 y comentario opcional en REMOVE. Sobre esa base, el **checkpoint del 19 de octubre** incluye el selector QMOS LPN y el ajuste del formulario de reset descritos abajo; consultar su identificador final con `git log -1 --oneline`. Guardar/publicar esta rama no modifica el paquete instalado: **empaquetado, despliegue y validación en planta siguen pendientes**.

Revalidación del checkpoint, **16 de octubre**: las **83/83 regresiones** y TypeScript (`--noEmit --incremental false`) pasaron sin errores. Las comprobaciones de build y navegador documentadas más abajo corresponden a la implementación previa del mismo código; no se repitieron para este guardado. La revisión del alcance incluye únicamente fuente, pruebas, simulador y documentación relacionados con estos cambios.

### Trabajo posterior a 7fe8474: selector global LPN QMOS v0.44

Implementado en la copia de desarrollo el **16 de octubre**, en la misma rama: control global GET/PUT `/api/tracking/qmos-lpn-mode`, con ON/OFF explícito, Operator ID obligatorio (hasta 100 caracteres) y Reason obligatorio (hasta 500). No se asignan operador/motivo fijos. Sólo HTTP 200 con ACK válido confirma el guardado; se consulta GET después y las respuestas inciertas no provocan reenvío automático. Un servicio antiguo sin endpoint presenta el control no disponible sin bloquear el Dashboard.

Se incorporan `QmosLpnEnabled`, `IdentifierSource`, `DisplayId` y `CanPrint` como campos aditivos. Tarjetas, listado/búsqueda, confirmaciones y báscula usan DisplayId; un OFF sin DisplayId usa TrackingId y muestra **ID interno / sin LPN**. Se excluye su UNMATCHED normal del aviso/contador de espera QMOS. La identidad de correcciones sigue siendo TrackingId y se conservan FIFO, peso, REMOVE/Reposition y ocultación de REMOVED. No hay nuevos botones ni endpoints de impresión QMOS.

El modo global afecta a la política que el motor asigna a futuros bundles al crearlos. No se infiere del estado del adaptador ni modifica la política de los existentes; esa política debe conservarla el backend incluso tras reiniciar. El simulador `sim-1.7.0` representa la selección e historial de creación en memoria: las pruebas locales no certifican persistencia SQL, PLC ni impresión física.

Validación de la implementación del 16 de octubre: **98/98 regresiones**, TypeScript y build live aprobados. Incluye los 83 casos previos, nueve del nuevo transporte/selector/simulador y seis de representación ON/OFF. Las pruebas de ciclos verifican ON previo → nuevo OFF → retorno ON con política OFF inmutable, además de REMOVE/Reposition sobre identidad interna. Se aprobaron **32 comprobaciones de navegador**: siete del nuevo selector y 25 de layouts/acciones manuales/reset existentes; sin errores de ejecución/intercepción, ni nuevas escrituras ajenas al escenario de cada runner. Se verificaron campos obligatorios y límites 100/500, boolean false, bloqueo al cerrar/reabrir, espera de HTTP 200, rechazo 400, respuesta perdida seguida de GET, bloqueo si no puede leerse el estado y servicio antiguo 404. El build necesitó acceso a Google Fonts; los arranques de Chromium con timeout dentro del sandbox se repitieron con permisos y pasaron. Captura del control en reconciliación: `dist/qmos-lpn-mode-control.png`. El selector y su documentación están **incluidos en el checkpoint del 19 de octubre, pendientes de despliegue**.

Pendiente de commissioning con API/L1: comprobar GET inicial y PUT con operador/motivo reales; crear y correlacionar un bundle ON; crear uno OFF con LPN null, INTERNAL y UDT QMOS_LPN=0; contrastar peso/movimiento; confirmar que no imprime ni envía CREATE QMOS; volver ON sin cambiar el OFF y comprobar un nuevo ON; reiniciar el servicio para validar persistencia; confirmar REMOVE y su ocupación. No se ejecutaron esas acciones de planta en esta implementación.

### Reset tracking: formulario simplificado el 19 de octubre

Por solicitud del usuario, el checkpoint del **19 de octubre** retira el campo de escritura de RESET. El formulario conserva únicamente la casilla de autorización operativa y el botón de envío. Se mantiene el diálogo global nativo, el preflight fresco de servicio/capability/escenario/alcance, el bloqueo compartido y la comprobación posterior por GET. El transporte sigue siendo POST `/api/tracking/reset` sin cuerpo, con `X-Tracking-Reset-Confirmation: RESET` hacia el proxy; retirar el campo visual no cambia ese header ni el contrato de respuesta. El reset real sigue pendiente de prueba coordinada.

Revalidación del **19 de octubre**: **98/98 regresiones**, TypeScript y build live aprobados. El navegador aprobó **25 comprobaciones** de layouts y acciones manuales/reset: el campo de texto ya no existe; sin casilla no se abre el diálogo ni se envía POST, incluso al disparar el formulario por código; marcarla habilita el botón y desmarcarla vuelve a bloquearlo. Se conservaron cancelación nativa sin envío, preflight, POST sin cuerpo, header, bloqueo compartido, aceptación separada del resultado y lectura posterior sin reintentos. Sin errores de ejecución/intercepción ni lecturas canceladas. Captura local: `dist/tracking-reset-confirmation.png`. Estas verificaciones se ejecutaron contra servidores/simuladores de prueba propios, sin comandos de planta.

También se repitieron y aprobaron las **siete comprobaciones del selector QMOS LPN** sobre esta compilación, para un total de **32 comprobaciones de navegador** del checkpoint del 19 de octubre. Campos obligatorios/límites, guardado sin actualización anticipada, PUT único, reconciliación por GET, identidad OFF y respuesta 404 quedaron verificados sin errores de ejecución/intercepción ni escrituras ajenas al escenario de prueba.

### Cambios solicitados el 9 de octubre y estado actualizado

| Solicitud | Estado real |
| --- | --- |
| Ocultar bundles removidos | Implementado localmente: proyección REMOVED para listado, contadores, banner, diagramas y peso; snapshot completo conservado |
| Confirmar el REMOVE retenido | Implementado localmente: ausencia o registro único del mismo escenario con REMOVED, zona null y OccupiedZones explícitamente vacío; preflight bloquea removidos |
| Ocultar Operator ID | API 0.44 rechazó `OperatorId: null` con 400; requiere cambio de backend o mecanismo de identidad acordado. Campo/validación siguen obligatorios y visibles, sin operador fijo |
| Comments opcional | Implementado localmente sólo para REMOVE: vacío/espacios → `Reason: null`, texto no vacío recortado. API 0.44 aceptó esa nulidad y reportó REMOVED (evento 237102). Reposition/legacy conservan comentario obligatorio hasta confirmar sus variantes; no se ha probado aquí su rechazo con null |
| Botón de reset global | Implementado localmente como mantenimiento separado, POST sin cuerpo, confirmaciones, preflight fresco, lock compartido y verificación posterior; sin reset real ejecutado |

El filtrado no borra historia. Una huella residual de un REMOVED permanece disponible para controles de ocupación/verificación y no satisface el criterio de retiro. La nueva UI no autentica usuarios. El reset exige capability anunciada y distingue acuse de resultado observado; un estado inicialmente vacío no acredita finalización. Ver [commissioning de reset](tracking-reset-commissioning.md).

### Layout Bundler solicitado el 13 de octubre

Implementado localmente: Bundler reutiliza el Overview sin el bloque marcado en azul (ERT1A/B, ERT2C/D, STRT1/2, LFRT1/2/3 y sus flechas). Conserva las otras 20 zonas, el peso SGRT2, las cuatro tarjetas CCH con FIFO/desplazamiento y Robot 2. El Overview conserva sus 29 zonas visibles; los datos de la rama oculta no se eliminan del Tracking ni del listado global. Incluido en el checkpoint del día 13 en la misma rama, pendiente de despliegue.

Validación del 13 de octubre: **58/58 regresiones** (las 50 anteriores más 8 de `test-bundler-layout.mjs`), TypeScript y build live aprobados. `test-manual-actions-ui.mjs --layout-only` aprobó cuatro comprobaciones en navegador contra standalone/simulador propios: zonas exactas, geometría/alineación compartida, scroll en 760 px y retorno al Overview completo. Ese modo bloquea toda petición que no sea GET. Captura local: `dist/bundler-overview-desktop.png`; no acredita datos ni ejecución en planta.

**Pendientes actualizados para Andrés/David:** API 0.44 rechazó operador nulo, pero sí procesó REMOVE con motivo nulo. Solicitar soporte para ocultar Operator ID sin valores ficticios y confirmar comentario opcional en Reposition/corrección legacy, además de actualizar el contrato histórico v0.39. El detalle y texto propuesto figuran en la sección 3. También sigue pendiente la prueba coordinada del reset real. La prueba directa de retiro fue ejecutada por el usuario; los cambios locales de layout no enviaron comandos de planta ni mensajes externos.

### Pestaña Stacker adicional, posterior al checkpoint 90c849c

El checkpoint Bundler/REMOVED/reset y documentación quedó guardado y publicado como **`90c849c`** en `release/integrated-hmi`. Sobre esa base, este nuevo checkpoint de fuente añade **Stacker**, en singular, como pestaña nueva; **Stackers**, en plural, mantiene intacto su componente anterior y sus 14 zonas, incluido IMRT1. El identificador del nuevo checkpoint se consulta con `git log -1 --oneline`. El cambio Stacker sigue pendiente de empaquetado, despliegue y validación en planta; guardar/publicar Git no modifica la instancia instalada.

Stacker reutiliza `MainSchematic` con `variant="stacker"`: muestra 13 zonas ERT1A/B, ERT2C/D, STRT1/2, LFRT1/2/3, SGRT1/2 y NCCT1/2, con el peso de SGRT2. No dibuja Bundler/RTOUT, RTTY1/2, IMRT1/2, secciones Bay 2 ni sus conexiones. Se recorta espacio vacío mediante una traslación vertical común, sin cambiar posiciones API. Overview conserva 29 zonas y Bundler 20; el snapshot y las acciones manuales no cambian.

Validación local: **66/66 regresiones**, TypeScript y build live aprobados. El modo `test-manual-actions-ui.mjs --layout-only` aprobó **8 comprobaciones** GET-only en navegador: incluye geometría del Overview, lienzo Stacker 1104 × 440, escala máxima 1.3, scroll a 760 px y navegación independiente a Stackers. Sin errores de ejecución/intercepción; no se usó backend de planta. Capturas locales en `dist/stacker-overview-desktop.png` y variantes `-narrow-left.png`/`-narrow-right.png`. No se repitió en este cambio la secuencia completa de comandos manuales en navegador.

### Bay 1 temporalmente igual a Stacker, posterior a f11002b

El checkpoint de Stacker quedó publicado como **`f11002b`**. El ajuste siguiente de Bay 1 se incluye en el checkpoint de fuente del **16 de octubre**, pendiente de despliegue: `BayOneSchematic` delega a `StackerSchematic` con `title="Bay 1"`. Comparten 13 zonas, coordenadas, datos, peso SGRT2, filtros, escala y desplazamiento; se conserva la identidad del tab Bay 1. La antigua distribución de cuatro zonas y estación manual ya no se dibuja. El ajuste específico de Bay 1 conserva Stackers, Overview, Bundler, Bay 2 y las posiciones API/comandos manuales.

Validación: **69/69 regresiones**, TypeScript y build live aprobados; **10 comprobaciones** de layout en navegador GET-only contra simulador propio, incluida equivalencia Bay 1/Stacker en desktop y viewport de 760 px, contenido de bundles/peso y scroll a ambos extremos. Sin errores de ejecución/intercepción. Capturas en `dist/bay-one-stacker-desktop.png` y variantes `-narrow-left.png`/`-narrow-right.png`. Pruebas locales, sin API de planta ni nueva validación operativa de comandos.

### Bay 2 como recorte derecho del Overview, posterior a f11002b

El ajuste de Bay 2 se incluye junto con Bay 1 en el **checkpoint del 16 de octubre, pendiente de despliegue**. `BayTwoSchematic` reutiliza `MainSchematic` con `variant="bay-2"`: conserva únicamente RTTY1/2, IMRT1/2, SGRT1/2, NCCT1/2, SGRT1A/B, SGRT2A/B y CCH1A/B/CCH2A/B (16 zonas), la báscula de SGRT2 y Robot 2. No dibuja las fuentes Stackers, STRT/LFRT, el bloque Bundler/RTOUT ni sus flechas de entrada. Mantiene coordenadas relativas del Overview mediante un recorte de 600 × 760, escala máxima 1.3 y desplazamiento horizontal cuando hace falta.

Los cuatro buffers CCH mantienen FIFO, cinco filas visibles y scroll. El catálogo completo de 33 zonas, las LCH ocultas y el snapshot no se eliminan; sólo cambia su representación en esta pestaña. Bay 1 sigue igual a Stacker; Overview, Bundler, Stacker y Stackers conservan sus vistas. No se modifican API, polling ni acciones manuales.

Validación conjunta: **79/79 regresiones**, TypeScript y build live aprobados; **13 comprobaciones** de layout en navegador GET-only contra standalone/simulador propios. Incluyen las 16 zonas exactas, equivalencia de geometría/datos/peso con Overview, buffers con scroll, viewport estrecho de 460 px y navegación sin cambios en las otras pestañas. Sin errores de ejecución/intercepción. Capturas locales: `dist/bay-two-overview-desktop.png`, `dist/bay-two-overview-narrow-left.png` y `dist/bay-two-overview-narrow-right.png`. No se ejecutaron comandos de planta ni se repitió la secuencia completa de acciones manuales en navegador.

Carpeta fuente utilizada en el servidor: `C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8`. Para la sesión de código se abre esa carpeta; el navegador apunta a `http://127.0.0.1:3000`. No hace falta cambiar a otra rama ni levantar un simulador para mostrar el flujo real. Las modificaciones documentales posteriores no cambian el build ya desplegado.

El empaquetador y `start.cmd` siguen siendo la variante legacy. No se incorporaron `service.ps1`, `test-deployment.ps1`, el JSON de servicio ni el empaquetador ampliado del kit.

| Variante | Identificador | Qué contiene | Qué NO debe asumirse |
| --- | --- | --- | --- |
| Checkpoint de fuente del 19 de octubre | `release/integrated-hmi`, sobre `7fe8474`; consultar `git log -1 --oneline` | Selector QMOS LPN v0.44, presentación ON/OFF por bundle y reset sin campo de escritura RESET, con pruebas y documentación | Pendiente de empaquetado/despliegue; QMOS real, persistencia y reset no validados en planta |
| Checkpoint de fuente del 16 de octubre, posterior a f11002b | `7fe8474`, publicado en `release/integrated-hmi` | Bay 1/Stacker, Bay 2 recortado y comentario opcional sólo en REMOVE, con pruebas y documentación | Pendiente de despliegue; operador obligatorio, comentarios Reposition/legacy sin validar con null; este checkpoint aún no contiene el selector QMOS LPN |
| Checkpoint de fuente del 13 de octubre | `90c849c` y `f11002b`, en `release/integrated-hmi` | Filtro/confirmación REMOVED, reset separado, Bundler compartido, Stacker singular, pruebas y documentación | No está desplegado ni certificado en planta; estos checkpoints aún exigían OperatorId/Reason |
| **Base funcional desplegada documentada** | **`7fc34e8`, `release/integrated-hmi`, publicado y desplegado en 3000** | **FIFO + REMOVE + reposicionamiento, selecciones globales, diagramas, peso y regresiones** | **No contiene el filtro/confirmación REMOVED ni el nuevo reset; evidencia PLC/auditoría pendiente** |
| Base funcional histórica | `600d20f` | Cinco vistas; tracking por zona; Mill Order, Destination e impresora globales; peso de SGRT2; LCH ocultas; CCH de cinco filas; alineación de Bundler | No contiene FIFO v0.42 ni interfaz de operaciones manuales |
| Fuente FIFO publicado | `77f79bf`, rama `feature/fifo-buffer-ordering` | Base anterior + orden por `QueueSequence` dentro de cada buffer lógico; diagnóstico de orden parcial; simulación y ocho pruebas FIFO | No integra la rama manual ni las herramientas de servicio añadidas al kit local |
| Retiro manual publicado para QA | `ce3c8a9`, rama `feature/manual-bundle-removal` | Interfaz de retiro manual mediante `POST /api/tracking/correct` | Un HTTP 202 no acredita que se haya completado un retiro |
| Antecedente de operaciones manuales | `5338300`, sobre la rama manual | Añade reposicionamiento y verificaciones; sus cambios están incluidos en esta integración | No forma parte del release histórico FIFO `77f79bf`; commissioning real pendiente |
| Preparación local de entrega | Árbol de trabajo basado en `600d20f`, con modificaciones locales | Documentación, empaquetador ampliado y herramientas Windows de diagnóstico/servicio | No equivale a un commit limpio ni debe describirse como el fuente exacto de `77f79bf` |

La documentación puede describir varias variantes; eso no añade sus funciones al código. Antes de ejecutar un ejemplo, confirmar la variante y que existan los archivos mencionados. Consultar [integración](tracking-api-integration.md), [despliegue](windows-standalone-deployment.md) y [entrega a Git](entrega-git.md).

## 2. Evidencia histórica del despliegue FIFO 77f79bf

Datos compartidos durante la prueba en el servidor:

- Paquete compilado con `GitCommit=77f79bf30fa6e82e2a83fbf30f21bee3c9986d9f` y `PlantDataMode=live`.
- `BuiltUtc=2026-10-07T23:46:28.8763896Z`, según su `RELEASE.txt`.
- Frontend en puerto `3000`: HTTP 200.
- Lectura mediante `/tracking-api/api/tracking/status`: `running: true`, `apiVersion: "0.42"`, escenario `TX1_TAGGER_TRACKING`.
- El usuario mostró el frontend recibiendo bundles. No se confirmó instalación como servicio ni recuperación tras reiniciar el equipo.

Estos puntos verifican compilación y conectividad observada. No prueban por sí mismos impresión, persistencia SQL, integridad de ocupación PLC o aceptación de FIFO con miembros reales.

### Caso observado: campos FIFO nulos

Extracto de un objeto leído **directamente de `GET /api/tracking/state` en el servicio**, no reconstruido por la interfaz:

```json
{
  "TrackingId": "TRK-0000103919",
  "BundleId": "101637697",
  "CurrentZone": "CCH2A",
  "LogicalBufferName": null,
  "QueueSequence": null,
  "OccupiedZones": ["CCH2A"],
  "Status": "TRACKING",
  "CorrelationStatus": "MATCHED"
}
```

Conclusión respaldada: el servicio incluye los campos, pero no reporta ese bundle como miembro activo de un FIFO lógico. La ubicación `CurrentZone=CCH2A` no demuestra por sí sola membresía FIFO. El apéndice v0.42 permite valores nulos fuera de una cola lógica; no demuestra automáticamente una falla del backend ni autoriza inventar una secuencia.

Pendiente: que el responsable de L2 confirme si esa membresía nula es correcta y proporcione un buffer con al menos dos miembros de secuencia conocida. Comparar entonces las tarjetas de Overview y Bay 2 con una lectura cercana en el tiempo. El panel general **Tracked bundles conserva el orden del snapshot**, no es la prueba del orden FIFO de una tarjeta.

## 3. Retiro manual: evidencia histórica de servidor y ajuste local posterior

### Prueba directa API 0.44: nulidad de campos, evento 237102

Pruebas ejecutadas por el usuario en PowerShell del servidor contra **`http://localhost:8085/api/tracking/correct`**, sin pasar por el proxy ni el formulario HMI. El status compartido identificó `MaterialTrackingService`, `apiVersion: "0.44"`, escenario `TX1_TAGGER_TRACKING`. La consulta previa encontró un único `TrackingId: TRK-0000110850`, `BundleId: 101644628`, `Status: TRACKING`, `CurrentZone: CCH2A` y `OccupiedZones: ["CCH2A"]`.

| Prueba | Hora con zona compartida | Resultado |
| --- | --- | --- |
| REMOVE, `OperatorId: null`, `Reason: "QA: prueba de retiro con OperatorId null"` | `2026-10-13T23:35:13.8529105-05:00` | HTTP **400**, `{"error":"OperatorId is required for HMI corrections."}` |
| REMOVE, `OperatorId: "1"` introducido por el usuario, `Reason: null` | `2026-10-13T23:37:50.6730520-05:00` | HTTP **202**, `accepted: true`, `eventId: 237102`, `eventType: MANUAL_CORRECTION`, `trackingId: TRK-0000110850` |
| GET directo de `/api/tracking/state` posterior | `2026-10-13T23:39:33.3958373-05:00` | Un registro del mismo escenario e identidad, `Status: REMOVED`, `CurrentZone: null`, `OccupiedZones: []`, `LogicalBufferName: null`, `QueueSequence: null` |

La lectura conservó el registro: no era necesario que desapareciera del arreglo. `StateLastUpdateUtc` fue `/Date(1791952765055)/` y `LastUpdateUtc` del bundle `/Date(1791952672817)/`. El número `1` no es un valor predeterminado ni identidad autenticada validada por esta prueba: sólo es el texto de operador proporcionado por el usuario en ese request.

Conclusión limitada: **REMOVE admitió motivo nulo y se observó el resultado terminal reportado por Tracking**, mientras operador nulo fue rechazado. No acredita escritura PLC, contenido de auditoría, soporte de nulos en otras variantes, ni despliegue del nuevo frontend. No reenviar el retiro del bundle ya REMOVED.

El código de trabajo aplica comentario opcional **sólo a REMOVE**, de formulario a DTO/cliente/proxy: vacío o espacios produce `Reason: null`; el comentario no vacío se recorta; no se inventa un motivo. Operator ID permanece visible/obligatorio. Reposition y corrección legacy conservan comentario obligatorio hasta validar sus variantes. El apéndice v0.39 exigía ambos para REMOVE: esa regla histórica se conserva como antecedente, pero debe reconciliarse con el comportamiento 0.44 observado. Este ajuste, junto con Bay 1/Bay 2, se incluye en el **checkpoint del 16 de octubre**, pendiente de despliegue.

Validación local de este ajuste: **83/83 regresiones**, TypeScript (`--noEmit --incremental false`) y `pnpm build` en modo live aprobados. La suite de navegador aprobó **25 comprobaciones** (13 de layout y 12 de acciones manuales/reset); una ejecución adicional `--layout-only` aprobó las **13 comprobaciones GET-only**. Se verificaron comentario opcional sin valor predeterminado, operador obligatorio, normalización de espacios a `Reason: null` a través del proxy/simulador local, confirmación del registro REMOVED retenido con huella vacía, exclusión de vistas activas, cancelación sin POST, bloqueos y reset ficticio. Reposition sigue exigiendo comentario. Sin errores de ejecución/intercepción ni lecturas canceladas en las ejecuciones aprobadas. Captura: `dist/manual-removal-optional-comments.png`. Un primer arranque de navegador dentro del sandbox falló por timeout de CDP antes de ejecutar casos; se repitió con permiso para el navegador local. No se realizó un reset real ni se desplegó este frontend durante el cambio.

Mensaje propuesto para backend, aún no enviado:

> En API 0.44 probamos REMOVE con OperatorId null y respondió 400: "OperatorId is required for HMI corrections." Con operador informado y Reason null respondió 202 (evento 237102), y el state posterior reportó REMOVED sin posiciones para TRK-0000110850. Para ocultar Operator ID en fase 1 sin asignar valores fijos, ¿pueden permitir su omisión/null o definir cómo obtendrá el backend la identidad? ¿Pueden confirmar y documentar también Reason opcional en reposicionamiento por CurrentZone y corrección de MillOrder1? El frontend ya contempla comentario opcional en REMOVE, pendiente de entrega; solicitamos actualizar el contrato con este comportamiento.

### Prueba del integrado 7fc34e8: evento 154605

Se usó **Tracked bundles → Remove from Tracking → Remove selected bundle**, con confirmación del operador. La solicitud fue un POST a `/tracking-api/api/tracking/correct` del HMI en 3000, reenviado al servicio `/api/tracking/correct` en 8085.

| Evidencia | Valor registrado |
| --- | --- |
| Identidad técnica | `TRK-0000103919` |
| Número visible del bundle | `101637697` |
| Zona reportada antes | `CCH2A` |
| Respuesta HTTP | `202 Accepted` |
| Header `Date` | `Thu, 08 Oct 2026 02:11:48 GMT` |
| ACK | `accepted: true`, `eventId: 154605`, `eventType: MANUAL_CORRECTION`, `trackingId: TRK-0000103919` |
| Lectura posterior directa en 8085 | El registro sigue en `state.Bundles`, con `Status: REMOVED`, `CurrentZone: null`, `OccupiedZones: []`, `LogicalBufferName: null`, `QueueSequence: null` |

La respuesta aceptada y el estado posterior son evidencias diferentes: ahora sí se observó **REMOVED y la huella reportada vacía** para ese TrackingId. Esto no acredita por sí solo la escritura efectiva al PLC, la preservación del histórico o el contenido de la auditoría.

**Por qué la HMI de 7fc34e8 quedó pendiente:** `manualOutcomeObserved` sólo confirmaba al no encontrar el TrackingId. Por eso se veía `REMOVED / Unknown zone` y pendiente al mismo tiempo; no faltó enviar el POST.

**Ajuste local del 9 de octubre:** el criterio ya reconoce el registro terminal retenido sólo si es único, del mismo escenario, con zona null y huella explícita vacía. La proyección de vistas activas excluye REMOVED sin alterar `state.Bundles`; bloquea nuevas acciones sobre retirados. Aún se debe verificar este cambio después de desplegarlo, sin convertir evidencia histórica en una prueba del código nuevo. Efectos PLC y auditoría se confirman aparte.

No reenviar el retiro ni recargar para intentar desbloquearlo. Después del plazo se puede usar **Check state again (read only)**. Compartir con backend el evento `154605`, los Headers/Payload/Response del POST y el objeto posterior de state.

### Prueba anterior independiente: evento 134331

En una prueba anterior de la rama manual se envió una solicitud de retiro para `TRK-0000100822`. La API respondió HTTP 202, `accepted: true`, `eventId: 134331`, `eventType: MANUAL_CORRECTION`.

Una consulta posterior conservaba el bundle en `/api/tracking/state`, con `CurrentZone: null`, `OccupiedZones: []` y `Status: WAITING_QMOS_ID`. No se encontró el evento dentro de los eventos recientes disponibles. Ese endpoint puede tener una ventana limitada; la ausencia allí no prueba que nunca se haya creado el evento.

Conclusión de ese caso anterior: la solicitud fue aceptada, pero no se confirmó la ejecución final. No mezclarlo con el evento 154605 ni decir que “ninguna remoción cambia el estado”. No convertir ninguno de estos casos en RESET ni probar sobre otro bundle sin autorización específica. `OperatorId` es un dato de auditoría suministrado por el cliente, no un login.

### Qué evidencia guarda el frontend

La HMI muestra el ACK/eventId y el progreso en memoria, pero **no implementa una bitácora persistente propia de acciones**. El proxy reenvía el cuerpo y la respuesta; no guarda un historial de POSTs. Para esta prueba la evidencia provino de Network del navegador y consultas GET posteriores. La auditoría formal se verifica en L2/backend. Abrir Network antes de una nueva prueba y activar **Preserve log**; guardar Headers, Payload y Response. Preview es otra presentación de Response y no es necesario duplicarla.

## 4. Inventario de artefactos existentes

Rutas relativas al espacio de trabajo de preparación; no son rutas universales del servidor destino.

| Artefacto | Versión comprobada | Uso correcto |
| --- | --- | --- |
| `dist/Entregables/tx1-handoff-2026-10-01.zip` | Kit de sesión anterior | Conservar como entrega histórica; no anunciarlo como actualizado a FIFO |
| `dist/Entregables/unzipped/tx1-handoff-2026-10-01/tx1-hmi-source.zip` | `600d20f-session-20261001` en `SOURCE-RELEASE.txt` | Fuente del kit anterior, sin FIFO/manual |
| `dist/Entregables/unzipped/tx1-handoff-2026-10-01/tx1-tracking-windows.zip` | `600d20f-session-20261001`; build del 1 de octubre | Ejecutable del kit anterior; no es el build de producción FIFO |
| `dist/tx1-tracking-windows.zip` y carpeta homónima de la raíz | `9b7d216`, build del 11 de septiembre | Artefacto antiguo; no elegirlo por llamarse igual que un paquete actual |
| Paquete FIFO generado en el servidor | `77f79bf`, build indicado arriba | Antecedente del integrado; su existencia en el servidor no implica que haya una copia descargada en este equipo |
| Fuente/runtime integrado utilizado en el servidor | `7fc34e8`, carpeta `tx1-integrated-release-7fc34e8` | Último despliegue documentado; no incluye los cambios locales nuevos. Comprobar `RELEASE.txt` del runtime activo antes de sustituir |

Actualizar archivos `.md` o `README.txt` **no modifica el contenido de ZIPs ya creados**. No se regeneran, renombran ni certifican esos ZIPs como parte de una edición documental. Para otra entrega: seleccionar un único fuente aprobado, generar nuevos artefactos con identificador propio y registrar hashes, manifiesto y resultados. No mezclar ejecutable de una versión con fuente de otra.

## 5. Pruebas conocidas y sus límites

| Evidencia | Resultado documentado | Límite |
| --- | --- | --- |
| Regresiones locales de esta integración | FIFO 8/8, REMOVE 4/4, Reposition 4/4, preflight 7/7 y casos combinados 2/2 | Simuladores propios y datos ficticios; no se ejecutaron comandos de planta |
| TypeScript y build integrado live | Aprobados sobre la combinación de código | No certifican despliegue ni efectos industriales |
| Navegador real contra standalone + simulador local | Siete checks aprobados: acciones presentes, confirmación de 4.1 s y preflight fresco, acuse pendiente, bloqueo compartido, retiro y respuesta incierta sin reintento de POST | Validación local de UI; no aceptación L2/PLC ni auditoría real |
| FIFO: `node scripts/test-fifo-ordering.mjs` en `77f79bf` | Ocho grupos pasaron: DTO, nulidad, orden, múltiples colas, empates, ubicación, renderizado y simulador | Pruebas locales; no verifican la cola real de L2 |
| TypeScript y build FIFO | Pasaron antes de publicar; el servidor también completó el empaquetado | No equivalen a una prueba física de planta |
| Retiro/reposicionamiento del checkpoint manual | Pruebas locales documentadas en su rama | No equivalen a aceptación del comando en planta |
| REMOVE real de `7fc34e8`, evento `154605` | POST 202 y lectura directa posterior con REMOVED, posición nula y huella vacía | La UI histórica esperaba ausencia; no demuestra comportamiento del ajuste local ni efectos PLC/auditoría |
| Pruebas directas API 0.44 del 13 de octubre, evento `237102` | Operador null rechazado con 400; motivo null con operador informado aceptado 202 y GET posterior REMOVED sin posiciones | Ejecución por el usuario fuera del proxy/formulario; no acredita nuevo frontend desplegado, nulidad en Reposition/legacy, PLC ni auditoría |
| Ajustes locales del 9 de octubre: regresiones | 50/50: FIFO 8, REMOVE 4, Reposition 4, preflight manual 7, integración 2, ciclo de vida 9, transporte reset 11 y estado reset 5 | Datos ficticios, pruebas en memoria y simuladores propios; no se ejecutaron comandos de planta |
| Ajustes locales del 9 de octubre: compilación | `pnpm typecheck` y `pnpm build` aprobados, build live con proxy relativo, Node 24.21.0 | Build local previo al checkpoint; sin generar nuevo paquete ni despliegue |
| Ajustes locales del 9 de octubre: navegador | 11 escenarios aprobados contra standalone y simulador loopback propios: retiro retenido REMOVED, conteos, confirmaciones, revalidación, reset sin cuerpo, bloqueos y respuesta incierta sin reintentos | Reset exclusivamente ficticio; no acredita autorización operativa, efectos PLC ni commissioning real |
| Servicio Windows del kit | Herramientas y procedimiento preparados; ver informe específico del kit | Instalación real, permisos y reinicio en el servidor no están acreditados aquí |
| `pnpm lint` | No acreditado: esta base no entrega la configuración/dependencia ESLint necesaria | No afirmar que todos los checks posibles pasaron |

## 6. Pendientes para el cierre, con responsable a confirmar

- [ ] L2/Tracking: confirmar membresía FIFO nula del caso reportado y facilitar datos para comparar orden.
- [ ] Frontend + operación: comparar al menos dos secuencias conocidas en Overview/Bay 2; revisar más de cinco filas, conteos y estado stale.
- [ ] Frontend + operación: validar tras despliegue el filtro REMOVED y criterio estricto de retiro retenido; el ajuste está en código local, no en el paquete histórico.
- [ ] L2/Tracking: permitir ocultar operador sin valores ficticios mediante cambio de API o identidad acordada; API 0.44 rechazó `OperatorId: null` en REMOVE.
- [x] REMOVE con comentario nulo en API 0.44: 202/evento 237102 y lectura posterior REMOVED sin posiciones. No es evidencia de despliegue del nuevo formulario ni de PLC/auditoría.
- [ ] L2/Tracking + frontend: confirmar `Reason: null` en Reposition/corrección legacy y actualizar contrato. El código local sólo relaja REMOVE; no se probó el rechazo o aceptación de las otras variantes.
- [ ] Frontend + operación: entregar y validar el formulario REMOVE con comentario opcional; fuente incluido en el checkpoint del 16 de octubre, pendiente de despliegue.
- [ ] L2/Tracking + operación: autorizar ventana/alcance y validar el nuevo reset global, incluyendo estado posterior y auditoría; no se probó sobre planta.
- [ ] L2/Tracking + operación: acreditar limpieza PLC y auditoría de los eventos `154605` y `237102`; conciliar por separado el caso anterior `134331`.
- [ ] IT/operación: validar cuenta del servicio, permisos, red y arranque después de reinicio, si se adopta ese mecanismo.
- [x] Fuente integrado: commit `7fc34e8` publicado en el repositorio de trabajo.
- [ ] Responsables de entrega: confirmar destino corporativo, versión a entregar y correspondencia fuente/runtime; tener acceso al servidor no implica acceso al Git de la empresa.
- [x] Base funcional `7fc34e8`: regresiones FIFO/manuales/combinadas, TypeScript, build live y comprobaciones de navegador contra simulador aprobados localmente en su momento.
- [x] Cambios del 9 de octubre: 50 regresiones, TypeScript/build live y 11 escenarios de navegador aprobados; incluidos en el checkpoint del día 13. Empaquetado y despliegue pendientes; entonces Operator ID/Comments seguían pendientes de acuerdo (actualización de nulidad en la sección 3).
- [x] Checkpoint del 13 de octubre: 58 regresiones y TypeScript revalidados antes de guardar la base para los siguientes cambios visuales; la evidencia de build y cuatro verificaciones de layout en navegador se describe arriba. Publicar Git no equivale a desplegar el servidor.
- [x] Despliegue integrado en la instancia acordada de 3000; se observó operación real de la UI, respuesta POST y estado directo del servicio en 8085.
- [ ] Entrega: generar fuente/runtime identificados desde el commit integrado aprobado, sin herramientas o notas ajenas; verificar manifiestos y hashes.

No cerrar estos puntos solamente porque un endpoint responde 200, una solicitud responde 202, un proceso está Running o una captura se ve correcta.

## 7. Registro para la siguiente validación

| Campo | Completar durante la prueba |
| --- | --- |
| Fecha/hora y zona horaria | |
| Fuente/commit y estado del árbol de trabajo | |
| Identificador de `RELEASE.txt` y hash del ZIP | |
| Host HMI, puerto y mecanismo de arranque | |
| Host/API, versión y escenario | |
| TrackingId, CurrentZone, LogicalBufferName, QueueSequence | |
| Solicitud/resultado observado y evidencia | |
| Responsable, aceptación o siguiente acción | |

Para la sesión, decir: **“La última versión desplegada documentada del frontend es 7fc34e8. En el retiro histórico el backend reportó REMOVED y huella vacía, pero la pantalla esperaba ausencia. Ya tenemos un ajuste local que separa vistas activas del snapshot y verifica ese resultado estrictamente, además del reset de mantenimiento. Después, una prueba directa contra API 0.44 confirmó REMOVE con comentario nulo, por lo que el código local permite dejarlo vacío; no hemos desplegado ese formulario. Operator ID sigue obligatorio porque la API rechazó null. Para Reposition/legacy aún debemos confirmar comentarios opcionales con backend. La prueba operativa, PLC y auditoría siguen siendo verificaciones separadas.”**

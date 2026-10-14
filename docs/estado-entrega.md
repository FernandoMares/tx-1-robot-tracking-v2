# Estado de versiones, entregables y validación

Corte de evidencia de servidor: **8 de octubre de 2026, UTC**, incluida la respuesta HTTP de las `02:11:48 GMT` del retiro descrito abajo. Actualización de código/documentación local: **13 de octubre de 2026**. Este documento no consulta automáticamente el servidor ni acredita aceptación industrial; distingue lo desplegado de los cambios locales nuevos.

## 1. Qué versión estamos explicando

**Rama de trabajo: `release/integrated-hmi`.** Base funcional desplegada documentada **`7fc34e8`**, que combina FIFO `77f79bf` y acciones manuales `5338300`, con HMI **3000** y Tracking **8085**. El checkpoint anterior de documentación es **`c7df85a`**. Este checkpoint de fuente del **13 de octubre** reúne los ajustes del día 9 y el layout Bundler; su identificador exacto se consulta con `git log -1 --oneline`. Guardar/publicar esta rama no modifica el paquete instalado: **empaquetado, despliegue y validación en planta siguen pendientes**.

### Cambios solicitados y estado local del 9 de octubre

| Solicitud | Estado real |
| --- | --- |
| Ocultar bundles removidos | Implementado localmente: proyección REMOVED para listado, contadores, banner, diagramas y peso; snapshot completo conservado |
| Confirmar el REMOVE retenido | Implementado localmente: ausencia o registro único del mismo escenario con REMOVED, zona null y OccupiedZones explícitamente vacío; preflight bloquea removidos |
| Ocultar Operator ID | Pendiente de acuerdo: v0.39 exige operador para REMOVE y v0.6 para correcciones; implementación mantiene campo/validación obligatorios, sin operador ficticio |
| Comments opcional | Pendiente de acuerdo: v0.39 exige Reason para REMOVE; en reposicionamiento sólo consta en el ejemplo. La implementación todavía lo exige en todos los caminos de corrección, sin relleno automático |
| Botón de reset global | Implementado localmente como mantenimiento separado, POST sin cuerpo, confirmaciones, preflight fresco, lock compartido y verificación posterior; sin reset real ejecutado |

El filtrado no borra historia. Una huella residual de un REMOVED permanece disponible para controles de ocupación/verificación y no satisface el criterio de retiro. La nueva UI no autentica usuarios. El reset exige capability anunciada y distingue acuse de resultado observado; un estado inicialmente vacío no acredita finalización. Ver [commissioning de reset](tracking-reset-commissioning.md).

### Layout Bundler solicitado el 13 de octubre

Implementado localmente: Bundler reutiliza el Overview sin el bloque marcado en azul (ERT1A/B, ERT2C/D, STRT1/2, LFRT1/2/3 y sus flechas). Conserva las otras 20 zonas, el peso SGRT2, las cuatro tarjetas CCH con FIFO/desplazamiento y Robot 2. El Overview conserva sus 29 zonas visibles; los datos de la rama oculta no se eliminan del Tracking ni del listado global. Incluido en el checkpoint del día 13 en la misma rama, pendiente de despliegue.

Validación del 13 de octubre: **58/58 regresiones** (las 50 anteriores más 8 de `test-bundler-layout.mjs`), TypeScript y build live aprobados. `test-manual-actions-ui.mjs --layout-only` aprobó cuatro comprobaciones en navegador contra standalone/simulador propios: zonas exactas, geometría/alineación compartida, scroll en 760 px y retorno al Overview completo. Ese modo bloquea toda petición que no sea GET. Captura local: `dist/bundler-overview-desktop.png`; no acredita datos ni ejecución en planta.

**Pendientes para el mensaje posterior a Andrés/David:** confirmar cómo permitirá backend ocultar/omitir `OperatorId` en fase 1 y hacer opcional `Reason`/Comments (v0.39 exige ambos para REMOVE). Siguen visibles y obligatorios en el código; no se inventa identidad ni motivo. También sigue pendiente la prueba coordinada del reset real; no se ha enviado ningún mensaje externo ni comando de planta como parte de este cambio de layout.

### Pestaña Stacker adicional, posterior al checkpoint 90c849c

El checkpoint Bundler/REMOVED/reset y documentación quedó guardado y publicado como **`90c849c`** en `release/integrated-hmi`. Sobre esa base, este nuevo checkpoint de fuente añade **Stacker**, en singular, como pestaña nueva; **Stackers**, en plural, mantiene intacto su componente anterior y sus 14 zonas, incluido IMRT1. El identificador del nuevo checkpoint se consulta con `git log -1 --oneline`. El cambio Stacker sigue pendiente de empaquetado, despliegue y validación en planta; guardar/publicar Git no modifica la instancia instalada.

Stacker reutiliza `MainSchematic` con `variant="stacker"`: muestra 13 zonas ERT1A/B, ERT2C/D, STRT1/2, LFRT1/2/3, SGRT1/2 y NCCT1/2, con el peso de SGRT2. No dibuja Bundler/RTOUT, RTTY1/2, IMRT1/2, secciones Bay 2 ni sus conexiones. Se recorta espacio vacío mediante una traslación vertical común, sin cambiar posiciones API. Overview conserva 29 zonas y Bundler 20; el snapshot y las acciones manuales no cambian.

Validación local: **66/66 regresiones**, TypeScript y build live aprobados. El modo `test-manual-actions-ui.mjs --layout-only` aprobó **8 comprobaciones** GET-only en navegador: incluye geometría del Overview, lienzo Stacker 1104 × 440, escala máxima 1.3, scroll a 760 px y navegación independiente a Stackers. Sin errores de ejecución/intercepción; no se usó backend de planta. Capturas locales en `dist/stacker-overview-desktop.png` y variantes `-narrow-left.png`/`-narrow-right.png`. No se repitió en este cambio la secuencia completa de comandos manuales en navegador.

Carpeta fuente utilizada en el servidor: `C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8`. Para la sesión de código se abre esa carpeta; el navegador apunta a `http://127.0.0.1:3000`. No hace falta cambiar a otra rama ni levantar un simulador para mostrar el flujo real. Las modificaciones documentales posteriores no cambian el build ya desplegado.

El empaquetador y `start.cmd` siguen siendo la variante legacy. No se incorporaron `service.ps1`, `test-deployment.ps1`, el JSON de servicio ni el empaquetador ampliado del kit.

| Variante | Identificador | Qué contiene | Qué NO debe asumirse |
| --- | --- | --- | --- |
| Checkpoint de fuente del 13 de octubre | `release/integrated-hmi`, posterior a `c7df85a`; consultar `git log -1 --oneline` | Filtro/confirmación REMOVED, reset separado, Bundler compartido, pruebas y documentación | No está desplegado ni certificado en planta; OperatorId/Reason todavía obligatorios |
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
| Ajustes locales del 9 de octubre: regresiones | 50/50: FIFO 8, REMOVE 4, Reposition 4, preflight manual 7, integración 2, ciclo de vida 9, transporte reset 11 y estado reset 5 | Datos ficticios, pruebas en memoria y simuladores propios; no se ejecutaron comandos de planta |
| Ajustes locales del 9 de octubre: compilación | `pnpm typecheck` y `pnpm build` aprobados, build live con proxy relativo, Node 24.21.0 | Build local previo al checkpoint; sin generar nuevo paquete ni despliegue |
| Ajustes locales del 9 de octubre: navegador | 11 escenarios aprobados contra standalone y simulador loopback propios: retiro retenido REMOVED, conteos, confirmaciones, revalidación, reset sin cuerpo, bloqueos y respuesta incierta sin reintentos | Reset exclusivamente ficticio; no acredita autorización operativa, efectos PLC ni commissioning real |
| Servicio Windows del kit | Herramientas y procedimiento preparados; ver informe específico del kit | Instalación real, permisos y reinicio en el servidor no están acreditados aquí |
| `pnpm lint` | No acreditado: esta base no entrega la configuración/dependencia ESLint necesaria | No afirmar que todos los checks posibles pasaron |

## 6. Pendientes para el cierre, con responsable a confirmar

- [ ] L2/Tracking: confirmar membresía FIFO nula del caso reportado y facilitar datos para comparar orden.
- [ ] Frontend + operación: comparar al menos dos secuencias conocidas en Overview/Bay 2; revisar más de cinco filas, conteos y estado stale.
- [ ] Frontend + operación: validar tras despliegue el filtro REMOVED y criterio estricto de retiro retenido; el ajuste está en código local, no en el paquete histórico.
- [ ] L2/Tracking + frontend: acordar el contrato de OperatorId/Reason para ocultar operador y permitir comentarios vacíos; se mantienen obligatorios mientras tanto.
- [ ] L2/Tracking + operación: autorizar ventana/alcance y validar el nuevo reset global, incluyendo estado posterior y auditoría; no se probó sobre planta.
- [ ] L2/Tracking + operación: acreditar limpieza PLC y auditoría del evento `154605`; conciliar por separado el caso anterior `134331`.
- [ ] IT/operación: validar cuenta del servicio, permisos, red y arranque después de reinicio, si se adopta ese mecanismo.
- [x] Fuente integrado: commit `7fc34e8` publicado en el repositorio de trabajo.
- [ ] Responsables de entrega: confirmar destino corporativo, versión a entregar y correspondencia fuente/runtime; tener acceso al servidor no implica acceso al Git de la empresa.
- [x] Base funcional `7fc34e8`: regresiones FIFO/manuales/combinadas, TypeScript, build live y comprobaciones de navegador contra simulador aprobados localmente en su momento.
- [x] Cambios del 9 de octubre: 50 regresiones, TypeScript/build live y 11 escenarios de navegador aprobados; incluidos en el checkpoint del día 13. Empaquetado y despliegue pendientes; Operator ID/Comments pendientes de acuerdo.
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

Para la sesión, decir: **“La última versión desplegada documentada es 7fc34e8. En ese retiro el backend reportó REMOVED y huella vacía, pero la pantalla esperaba ausencia. Ya tenemos un ajuste local que separa vistas activas del snapshot y verifica ese resultado estrictamente, además del reset de mantenimiento. No está desplegado todavía. Operator ID y comentarios siguen obligatorios en la implementación; para REMOVE el contrato exige ambos, y para los otros caminos debemos confirmar qué admite backend antes de cambiarlo. La prueba operativa, PLC y auditoría siguen siendo verificaciones separadas.”**

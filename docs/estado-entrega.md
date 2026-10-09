# Estado de versiones, entregables y validación

Corte de evidencia: **8 de octubre de 2026, UTC**, incluida la respuesta HTTP de las `02:11:48 GMT` del retiro descrito abajo. El frontend integrado está publicado y fue desplegado en el servidor. Este documento registra la evidencia recibida; no es una consulta automática al servidor ni una aprobación de todos los efectos en planta.

## 1. Qué versión estamos explicando

**Fuente actual: `release/integrated-hmi`, commit `7fc34e8`**, publicado en el repositorio de trabajo y desplegado como un único frontend en **3000**. Combina FIFO `77f79bf` y las operaciones manuales del checkpoint `5338300` sobre la base común. El servidor usa Tracking en **8085**. Las pruebas locales integradas se completaron y la prueba real de REMOVE produjo la nueva evidencia de la sección 3.

Carpeta fuente utilizada en el servidor: `C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8`. Para la sesión de código se abre esa carpeta; el navegador apunta a `http://127.0.0.1:3000`. No hace falta cambiar a otra rama ni levantar un simulador para mostrar el flujo real. Las modificaciones documentales posteriores no cambian el build ya desplegado.

El empaquetador y `start.cmd` siguen siendo la variante legacy. No se incorporaron `service.ps1`, `test-deployment.ps1`, el JSON de servicio ni el empaquetador ampliado del kit.

| Variante | Identificador | Qué contiene | Qué NO debe asumirse |
| --- | --- | --- | --- |
| **Fuente integrado actual** | **`7fc34e8`, `release/integrated-hmi`, publicado y desplegado en 3000** | **FIFO + REMOVE + reposicionamiento, selecciones globales, diagramas, peso y regresiones** | **La prueba de REMOVE reportó REMOVED con huella vacía; retención del registro, criterio de éxito HMI y efectos PLC/auditoría siguen por conciliar** |
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

## 3. Retiro manual: nueva evidencia real y diferencia con la HMI

### Prueba actual del integrado: evento 154605

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

**Por qué la HMI sigue mostrando pendiente:** `manualOutcomeObserved` en `lib/tracking-api/manual-position.ts` confirma REMOVE sólo cuando no encuentra el TrackingId en `state.Bundles`. No reconoce un registro retenido con Status REMOVED. Por eso se puede ver `REMOVED / Unknown zone` en la lista y al mismo tiempo el mensaje de resultado aún no confirmado. No es evidencia de que el POST no se haya enviado.

El contrato indica retiro del tracking **activo** y preservación del histórico; no define expresamente aquí si `/state` debe omitir el registro o conservarlo con Status REMOVED. Está pendiente confirmar con backend que ésta sea la representación final prevista y acordar el criterio de finalización. **No se ha cambiado ese criterio en el código.** La lista y el KPI cuentan actualmente todos los registros del arreglo, incluidos los retenidos; eso también requiere revisar la semántica de “activo” si la retención es el comportamiento confirmado.

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
| Fuente/runtime integrado utilizado en el servidor | `7fc34e8`, carpeta `tx1-integrated-release-7fc34e8` | Versión actual para capacitación y operación en 3000; comprobar el `RELEASE.txt` del runtime activo antes de una futura sustitución |

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
| REMOVE real del integrado, evento `154605` | POST 202 y lectura directa posterior con `Status: REMOVED`, posición nula y huella vacía | Registro retenido: la HMI aún espera ausencia; semántica final, auditoría y efectos PLC pendientes de confirmar |
| Servicio Windows del kit | Herramientas y procedimiento preparados; ver informe específico del kit | Instalación real, permisos y reinicio en el servidor no están acreditados aquí |
| `pnpm lint` | No acreditado: esta base no entrega la configuración/dependencia ESLint necesaria | No afirmar que todos los checks posibles pasaron |

## 6. Pendientes para el cierre, con responsable a confirmar

- [ ] L2/Tracking: confirmar membresía FIFO nula del caso reportado y facilitar datos para comparar orden.
- [ ] Frontend + operación: comparar al menos dos secuencias conocidas en Overview/Bay 2; revisar más de cinco filas, conteos y estado stale.
- [ ] L2/Tracking + frontend: confirmar retención de REMOVED en `/state` y acordar el criterio de éxito/“activo” para el evento `154605`; no hay ajuste de código aplicado aún.
- [ ] L2/Tracking + operación: acreditar limpieza PLC y auditoría del evento `154605`; conciliar por separado el caso anterior `134331`.
- [ ] IT/operación: validar cuenta del servicio, permisos, red y arranque después de reinicio, si se adopta ese mecanismo.
- [x] Fuente integrado: commit `7fc34e8` publicado en el repositorio de trabajo.
- [ ] Responsables de entrega: confirmar destino corporativo, versión a entregar y correspondencia fuente/runtime; tener acceso al servidor no implica acceso al Git de la empresa.
- [x] Release integrado: regresiones FIFO/manuales/combinadas, TypeScript, build live y comprobaciones de navegador contra simulador aprobados localmente.
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

Para la sesión, decir: **“Estamos revisando el integrado 7fc34e8 que corre en 3000. FIFO, retiro y reposicionamiento están juntos. En el último retiro el backend reportó REMOVED y huella vacía; la pantalla quedó pendiente porque hoy espera que desaparezca el registro. Estamos confirmando con backend la representación final antes de cambiar esa validación. La comprobación PLC y de auditoría es independiente.”**

# Estado de versiones, entregables y validación

Corte de evidencia: **7 de octubre de 2026**. Este documento distingue código implementado, versión publicada, paquete compilado y aceptación en planta. No es una consulta en tiempo real del servidor ni una aprobación de commissioning.

## 1. Qué versión estamos explicando

**Esta carpeta es `release/integrated-hmi`**. Combina las funciones de FIFO `77f79bf` y las operaciones manuales del checkpoint `5338300` sobre la base común. El propósito es desplegar un único frontend en el puerto 3000. Las pruebas locales integradas ya se completaron como se indica abajo. Al redactar esta revisión, el commit final, el push y el despliegue aún deben registrarse; no se dan por realizados por unir los archivos.

El empaquetador y `start.cmd` siguen siendo la variante legacy. No se incorporaron `service.ps1`, `test-deployment.ps1`, el JSON de servicio ni el empaquetador ampliado del kit.

| Variante | Identificador | Qué contiene | Qué NO debe asumirse |
| --- | --- | --- | --- |
| **Fuente integrado actual** | **`release/integrated-hmi`; commit final por registrar** | **FIFO + REMOVE + reposicionamiento, selecciones globales, diagramas, peso y regresiones** | **Integrar el código no confirma efectos en PLC/L2 ni sustituye las pruebas/deploy pendientes** |
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

## 3. Evidencia histórica de retiro manual: pendiente, no aprobado

En una prueba anterior de la rama manual se envió una solicitud de retiro para `TRK-0000100822`. La API respondió HTTP 202, `accepted: true`, `eventId: 134331`, `eventType: MANUAL_CORRECTION`.

Una consulta posterior conservaba el bundle en `/api/tracking/state`, con `CurrentZone: null`, `OccupiedZones: []` y `Status: WAITING_QMOS_ID`. No se encontró el evento dentro de los eventos recientes disponibles. Ese endpoint puede tener una ventana limitada; la ausencia allí no prueba que nunca se haya creado el evento.

Conclusión: la solicitud fue aceptada, pero no se confirmó la ejecución final. Revisar el procesamiento/auditoría con el responsable del servicio antes de repetirla. No presentar este caso como retiro exitoso, no convertirlo en RESET y no probar sobre otro bundle sin autorización específica. `OperatorId` es un dato de auditoría suministrado por el cliente, no un login.

## 4. Inventario de artefactos existentes

Rutas relativas al espacio de trabajo de preparación; no son rutas universales del servidor destino.

| Artefacto | Versión comprobada | Uso correcto |
| --- | --- | --- |
| `dist/Entregables/tx1-handoff-2026-10-01.zip` | Kit de sesión anterior | Conservar como entrega histórica; no anunciarlo como actualizado a FIFO |
| `dist/Entregables/unzipped/tx1-handoff-2026-10-01/tx1-hmi-source.zip` | `600d20f-session-20261001` en `SOURCE-RELEASE.txt` | Fuente del kit anterior, sin FIFO/manual |
| `dist/Entregables/unzipped/tx1-handoff-2026-10-01/tx1-tracking-windows.zip` | `600d20f-session-20261001`; build del 1 de octubre | Ejecutable del kit anterior; no es el build de producción FIFO |
| `dist/tx1-tracking-windows.zip` y carpeta homónima de la raíz | `9b7d216`, build del 11 de septiembre | Artefacto antiguo; no elegirlo por llamarse igual que un paquete actual |
| Paquete FIFO generado en el servidor | `77f79bf`, build indicado arriba | Versión usada para la prueba reciente; su existencia en el servidor no implica que haya una copia descargada en este equipo |

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
| Servicio Windows del kit | Herramientas y procedimiento preparados; ver informe específico del kit | Instalación real, permisos y reinicio en el servidor no están acreditados aquí |
| `pnpm lint` | No acreditado: esta base no entrega la configuración/dependencia ESLint necesaria | No afirmar que todos los checks posibles pasaron |

## 6. Pendientes para el cierre, con responsable a confirmar

- [ ] L2/Tracking: confirmar membresía FIFO nula del caso reportado y facilitar datos para comparar orden.
- [ ] Frontend + operación: comparar al menos dos secuencias conocidas en Overview/Bay 2; revisar más de cinco filas, conteos y estado stale.
- [ ] L2/Tracking + operación: confirmar resultado del evento de retiro y criterio de finalización observable.
- [ ] IT/operación: validar cuenta del servicio, permisos, red y arranque después de reinicio, si se adopta ese mecanismo.
- [ ] Responsables de código: registrar commit integrado final, publicación, correspondencia del paquete y repositorio corporativo destino.
- [x] Release integrado: regresiones FIFO/manuales/combinadas, TypeScript, build live y comprobaciones de navegador contra simulador aprobados localmente.
- [ ] Despliegue: preparar paquete del commit integrado, conservar el release previo y sustituir únicamente la instancia HMI acordada en 3000; verificar lecturas y pantalla.
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

Para una presentación de esta carpeta, decir **“FIFO y operaciones manuales están integrados en un mismo fuente; publicación, despliegue y aceptación se registran por separado”**. El despliegue histórico confirmado es `77f79bf`; no atribuir ese resultado al nuevo release antes de cambiar la instancia. Para acciones manuales, **“implementadas, con ejecución real y auditoría pendientes de confirmar”**.

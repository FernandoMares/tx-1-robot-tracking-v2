# Transferencia técnica del HMI TX1

Esta guía permite explicar el código, seguir un dato desde la API hasta la pantalla y delimitar qué está validado. Para el inventario de versiones y evidencias, consultar [Estado de entrega](estado-entrega.md). Esta copia contiene documentación compartible del producto; no incluye apuntes privados del presentador.

## 1. Qué código se está explicando

**Esta carpeta corresponde a `release/integrated-hmi`**: integra FIFO de `77f79bf` y las acciones manuales de `5338300` en el mismo frontend. El commit final, publicación y despliegue integrados deben registrarse al completarse; esta guía no los da por realizados. Las referencias siguientes explican su procedencia histórica.

| Referencia | Alcance que se puede afirmar |
| --- | --- |
| Base `600d20f` | Lectura de Tracking, diagramas, listado de bundles y selección global de Mill Order, Destination e impresora. No tiene acciones manuales en el panel. |
| FIFO `77f79bf` | Añade presentación FIFO a las tarjetas de zonas. Es la versión publicada y reportada en ejecución en el puerto 3000. No incorpora retiro ni reposicionamiento manual. |
| Manual `5338300` | Rama separada con retiro `REMOVE` y reposicionamiento; este checkpoint es local. La referencia remota conocida de esa rama es `ce3c8a9`, anterior al checkpoint. No confundirla con la versión FIFO desplegada. |
| Preparación de entrega en la raíz | Documentación, empaquetado y helpers de Windows adicionales. Su presencia en la raíz no significa que estén en el commit o ZIP FIFO. |

Esta guía se comparte entre las copias fuente; no agrega funciones por sí misma. Confirmar la versión del fuente, del paquete compilado y del proceso en ejecución por separado. No describir una rama como desplegada sólo porque existe en el equipo del desarrollador.

## 2. Objetivo, material y agenda

El mantenedor debe poder localizar una función, explicar su contrato, reproducir una prueba aislada y reconocer cuándo necesita al responsable del backend o de infraestructura.

Llevar el fuente de la versión elegida, el paquete standalone identificado, requisitos de Node/WinSW cuando correspondan, checksums y evidencia de pruebas. Un ZIP fuente y un ZIP ejecutable son entregables diferentes. Usar una copia separada para la capacitación.

Agenda sugerida de 90 minutos:

1. Versiones, alcance y límites de la evidencia: 10 minutos.
2. Recorrido del dato y lectura de código: 25 minutos.
3. Simulador aislado, Network y fallos de comunicación: 20 minutos.
4. FIFO y acciones manuales, integrados pero con contratos distintos: 10 minutos.
5. Empaquetado, servicio, diagnóstico, rollback y Git: 15 minutos.
6. Preguntas y pendientes de commissioning: 10 minutos.

Para una sesión de 60 minutos, dejar el detalle de despliegue y las [preguntas técnicas](preguntas-tecnicas.md) como consulta posterior.

## 3. Datos que confirmar con el equipo

| Dato | Decisión del entorno |
| --- | --- |
| Servidor HMI | Host/IP, Windows x64 y ruta permanente. |
| MaterialTrackingService | Host/IP y puerto; el valor habitual es 8085, no una obligación del protocolo. |
| URL del operador | DNS/IP, HTTP o HTTPS y acceso aprobado por IT. |
| Puerto del HMI | La instancia actual usa 3000. La capacitación usa 3100 en loopback; no desplazar producción. |
| Node | Ruta absoluta y versión aprobada para el paquete. |
| Servicio Windows | Nombre único, cuenta, permisos y dueño del proceso. El helper del kit de entrega admite LocalService; otra cuenta requiere revisión. |
| Red | Acceso desde operadores, salida del servidor HMI al backend, firewall y TLS. |
| Git | Repositorio corporativo, mantenedor, ramas y autenticación. |
| Pruebas operativas | Responsable, ventana, bundle y valores expresamente autorizados. |

Cambiar sólo el host del backend o el puerto de escucha no exige reconstruir el frontend; sí requiere aplicar la configuración al proceso correcto y reiniciarlo de forma coordinada. Cambiar variables `NEXT_PUBLIC_*` de una compilación requiere otro build.

## 4. Arquitectura y recorrido de una lectura

```text
Navegador → Next.js /tracking-api → MaterialTrackingService
                                         → QMOS / DB / PLC / impresión
```

El navegador recibe la aplicación y hace peticiones de mismo origen. El proxy de Next.js limita rutas y métodos; el servicio de Tracking es el dueño del estado y de las reglas industriales. El HMI no se conecta directamente a SQL ni al PLC.

`localhost` en `TRACKING_API_PROXY_TARGET` significa el equipo donde corre Node. RDP no crea un túnel y el navegador del operador no necesita llegar directamente al puerto del backend cuando se usa el proxy.

Seguir un ejemplo: un bundle llega con `CurrentZone: "CCH2A"`. El cliente valida el JSON; el hook conserva la lectura; `groupTrackingBundlesByZone` lo agrupa por esa zona; el diagrama pasa el grupo a `TrackingZoneSlot`. La interfaz no deduce una zona a partir de flechas, un número de bundle o una secuencia FIFO.

## 5. Recorrido del código, con responsabilidades reales

| Archivo o símbolo | Qué mostrar y qué no hace |
| --- | --- |
| [app/page.tsx](../app/page.tsx), [Dashboard](../components/dashboard.tsx) | Entrada y selección de vistas. Dashboard comparte el estado de planta; cambiar de vista no crea una fuente de verdad distinta. |
| [usePlantState](../hooks/use-plant-state.ts) | Integra mock/live, agrupa bundles y expone datos a las vistas. Las variaciones ficticias de mock no se usan como sustituto de una API live caída. |
| [useTrackingApi](../hooks/use-tracking-api.ts) | Bootstrap, polling, cancelación, recuperación y antigüedad del snapshot. |
| [TrackingApiClient](../lib/tracking-api/client.ts) | Métodos HTTP, timeout, errores y validación de cada respuesta. No reintenta automáticamente escrituras. |
| [Tipos](../lib/tracking-api/types.ts), [validadores](../lib/tracking-api/validation.ts), [parseApiDate](../lib/tracking-api/date.ts) | TypeScript describe el contrato; los validadores comprueban el JSON real. Las fechas aceptan ISO y el formato .NET `/Date(...)/`. |
| [Configuración](../lib/tracking-api/config.ts), [.env.example](../.env.example) | Modo de datos, URL pública, intervalos y destino privado del proxy. No incluir secretos en variables públicas. |
| [Route Handler](../app/tracking-api/%5B...path%5D/route.ts) | Allowlist por método, validación de cuerpos y reenvío al backend. No es un sistema de autenticación. |
| [groupTrackingBundlesByZone y catálogo](../lib/tracking-zone-layout.ts) | Agrupa por `CurrentZone` y valida el mapa frente al layout conocido. No genera automáticamente la geometría de una zona nueva. |
| [Overview](../components/plant/main-schematic.tsx), [componentes de planta](../components/plant) | Ubicación visual de los equipos. El dibujo y sus animaciones no son mediciones de sensores. |
| [TrackingZoneSlot](../components/plant/tracking-zone-slot.tsx) | Identidad visible, color, contador y scroll. En FIFO incorpora el helper de orden lógico. |
| [ScaleWeightReadout](../components/plant/scale-weight-readout.tsx) | Muestra el peso reportado para la zona exacta `SGRT2`, no `SGRT2A/B`. |
| [TrackingBundlesPanel](../components/tracking-bundles-panel.tsx) | En esta versión integrada: listado, búsqueda, REMOVE, Reposition y verificación posterior. El listado general no se ordena por FIFO. |
| [GlobalMillOrderPanel](../components/mill-order-selection-panel.tsx) | Catálogos, selecciones globales, confirmaciones, PUT y GET de verificación. Incluye el selector independiente de impresora. |
| [Simulador](../scripts/tracking-api-simulator.mjs) | Backend ficticio en memoria para comprobar el intercambio HTTP. No representa persistencia ni efectos en planta. |
| [Empaquetador](../scripts/package-windows-standalone.ps1), [archivos Windows](../deployment/windows) | Creación y arranque del standalone. Revisar las diferencias del kit de entrega antes de explicar helpers que el ZIP desplegado no contiene. |

### Leer el polling sin confundirlo con las selecciones

Al iniciar en live, `useTrackingApi` consulta en secuencia `status → capabilities → map → state`. Verifica que el servicio esté ejecutándose y que los escenarios sean compatibles. Después consulta normalmente sólo `state`.

El siguiente ciclo se programa después de terminar el anterior: 1000 ms configurados no significan exactamente una petición por segundo si la red tarda. El bucle no solapa sus propias solicitudes. Tras fallos usa espera creciente con variación y tope de 30 segundos; vuelve a cargar metadatos al recuperarse. Al desmontar, cancela la petición pendiente y el temporizador.

Con una lectura previa conserva el último snapshot y muestra `reconnecting` o `stale`; sin lectura previa puede mostrar `offline`. `Received` mide recepción local exitosa; `State changed` usa `LastUpdateUtc` del backend. Un estado sin cambios puede recibirse correctamente muchas veces.

Los catálogos y selecciones globales tienen ciclos separados: se cargan al montar el panel y con sus controles Refresh, además del GET posterior a guardar. El selector de impresora tiene su propio Refresh y se vuelve a cargar al abrirlo. No existe polling continuo de todas las selecciones; otra estación puede cambiarlas sin que el panel las vea inmediatamente.

## 6. Escrituras globales: explicación, no demostración productiva

Consultar el detalle en [Integración API](tracking-api-integration.md). El casing forma parte del contrato:

| Operación | Cuerpo |
| --- | --- |
| PUT `/api/tracking/mill-order` | `{ "millOrder": "..." }` |
| PUT `/api/tracking/destination` | `{ "destinationId": 3773 }` |
| PUT `/api/tracking/printer` | `{ "PrinterId": 4 }` |

Los valores son ilustrativos. En capacitación, escribir únicamente después de verificar que frontend y proxy apuntan al simulador local.

`handleSubmit` guarda primero Destination si cambió, después Mill Order si cambió y finalmente lee ambos. Son dos operaciones, no una transacción atómica. Si falla la segunda, la primera puede haber quedado aplicada. El manejo de error vuelve a consultar, pero no deshace automáticamente el cambio.

`handlePrinterSubmit` actualiza la impresora, valida la respuesta y consulta el valor activo. Seleccionar una impresora no es un comando de impresión. Persistencia SQL, `PRINT_NEXT`, precedencia de reglas y efecto en QMOS corresponden al backend y necesitan commissioning propio.

Capabilities habilita los controles de Mill Order/Destination según las operaciones anunciadas; la impresora consulta sus endpoints directamente. Ninguna de estas comprobaciones autentica al operador ni implementa un bloqueo entre estaciones.

## 7. FIFO integrado: qué demuestra y qué no

Desde `77f79bf` y también en esta versión integrada, `lib/tracking-fifo.ts` implementa `getFifoMembership` y `orderBundlesByLogicalFifo`. Se aplica dentro de las tarjetas de zona, después de agrupar por `CurrentZone`; no mueve bundles de zona y no ordena el listado general “Tracked bundles”.

Los campos `LogicalBufferName` y `QueueSequence` pueden faltar o ser nulos. Para ordenar, el helper requiere un nombre no vacío y una secuencia numérica entera segura. Agrupa por el nombre lógico exacto, ordena cada grupo por secuencia ascendente y reutiliza sólo las posiciones que ese grupo ya ocupaba en la lista. Las entradas sin datos suficientes mantienen su lugar. No se comparan secuencias entre buffers distintos.

En empates conserva el orden recibido y marca la condición incompleta; no inventa desempates por ID. La tarjeta muestra un asterisco/ayuda cuando hay integrantes FIFO y datos incompletos o secuencias duplicadas. El contador sigue siendo el total de bundles, no el tamaño de una cola global ni una posición mecánica.

Evidencia de planta pendiente: una lectura directa del backend v0.42 del bundle `101637697`, `TrackingId: TRK-0000103919`, en `CurrentZone: CCH2A`, devolvió ambos campos FIFO nulos. Eso no demuestra un fallo del proxy ni una aceptación FIFO exitosa. Estar físicamente en CCH2A no prueba pertenencia a una cola lógica activa. Se necesita una muestra confirmada con valores FIFO para contrastar API y tarjeta.

## 8. Acciones manuales incluidas en esta versión integrada

El checkpoint `5338300` aporta a esta rama los métodos `removeBundle` y `repositionBundle` de `TrackingApiClient`, los validadores, el proxy y el panel manual. `lib/tracking-api/manual-position.ts` está incluido en este mismo fuente, junto con FIFO. No es necesario cambiar de rama para explicar o probar localmente esos caminos.

El retiro envía `TrackingId, Operation: "REMOVE", OperatorId, Reason`. El reposicionamiento envía `TrackingId, OperatorId, Reason, CurrentZone`, sin `Operation`. No existe una operación inventada `MOVE`, ni un botón `RETIRE` implementado.

El panel vuelve a leer servicio, capacidades, mapa y, al final, estado después de la confirmación nativa. Revalida identidad, escenario, origen y destino. Mantiene un bloqueo local compartido entre ambas acciones, incluso al cerrar el detalle. Luego observa lecturas iniciadas después de la respuesta: ausencia para retiro, zona destino para reposicionamiento. Durante unos 60 segundos verifica cada dos segundos entre lecturas; si no obtiene evidencia, ofrece volver a comprobar mediante GET, no repetir automáticamente el POST.

HTTP 202 y `accepted: true` sólo acreditan aceptación del comando. En una prueba histórica de retiro de `TRK-0000100822`, el evento aceptado fue `134331`, de tipo `MANUAL_CORRECTION`; el bundle permaneció en estado y el evento no apareció en la ventana consultada de eventos recientes. Resultado: pendiente/no confirmado, no retiro exitoso. La ausencia en una ventana reciente tampoco prueba que nunca se haya registrado.

Explicar estos caminos mediante el código. No usarlos como demostración sobre bundles productivos ni deducir reglas de capacidad/rutas que corresponden al backend.

## 9. Demostración aislada y lectura de Network

Seguir [Simulador local](tracking-api-simulator.md): API ficticia en `127.0.0.1:18085` y frontend de capacitación en `127.0.0.1:3100`. Mantener intactos 3000, 3001 y 8085.

Antes de cualquier escritura, mostrar el estado del simulador tanto directamente como a través del proxy: servicio `MaterialTrackingServiceSimulator`, escenario `LOCAL_HMI_SIMULATOR` y estado/mapa con el mismo escenario.

Mostrar:

1. Bundle móvil, estado amarillo y prioridad del identificador visible.
2. Peso de SGRT2 y seis filas del buffer con `BUFFER_DEMO`.
3. Datos desordenados de `FIFO_DEMO` y orden parcial de la tarjeta.
4. GET continuo de estado frente a GET/PUT explícitos de selecciones.
5. Caída y recuperación deteniendo sólo el simulador de la capacitación.
6. Solo en el simulador confirmado: retiro y reposicionamiento de un bundle ficticio, con GET posterior; usar los procedimientos de commissioning incluidos.

La demo es modo live contra HTTP ficticio. No acredita sensores, impresión, QMOS CREATE, SQL, reglas industriales ni aceptación FIFO en planta.

## 10. Operación, entrega y cierre

Usar [Despliegue Windows](windows-standalone-deployment.md), [Servicio Windows](windows-service.md) y [Entrega Git](entrega-git.md) para los procedimientos vigentes. No instalar, reiniciar, publicar ni cambiar de versión sólo para explicar un concepto durante la sesión.

Esta rama mantiene el empaquetador legacy y no incluye `test-deployment.ps1`, `service.ps1` ni el JSON del servicio. Esos helpers pertenecen al kit de preparación separado; la guía del servicio se conserva únicamente como referencia condicionada a disponer del kit aprobado. Su presencia no acredita que el servicio Windows esté instalado o probado.

El Tracking interno no necesita internet para sus consultas una vez compilado el paquete. Instalar dependencias y compilar fuentes web sí puede requerir red. La base incluye Vercel Analytics en producción; el standalone no instala ese servicio y puede aparecer una solicitud no soportada a `/_vercel/insights/script.js`. No confundirla con una falla de `/tracking-api` ni asumir que se verificó una política de cero conexiones externas.

Registrar equipo, fecha, commit/paquete, URL del backend, versión reportada, responsable y resultado. Mantener la versión anterior disponible para rollback. Separar lecturas de diagnóstico de pruebas de escritura expresamente autorizadas.

Queda por validar, según el entorno: permisos de servicio, firewall desde otra estación, cierre de RDP, reinicio planificado, recuperación, valores reales de SGRT2, muestras FIFO utilizables y persistencia/efecto de selecciones globales. No reiniciar el backend o el equipo ni modificar selecciones para “ver qué pasa”.

Para repaso y preguntas de seguimiento: [Preguntas técnicas](preguntas-tecnicas.md). Para saber qué se puede afirmar hoy: [Estado de entrega](estado-entrega.md).

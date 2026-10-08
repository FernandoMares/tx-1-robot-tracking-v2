# Preguntas técnicas para la transferencia TX1

Respuestas basadas en el código revisado, no en funciones supuestas del backend. Esta carpeta `release/integrated-hmi` reúne FIFO y las operaciones manuales. “Base” (`600d20f`), “FIFO” (`77f79bf`) y “manual” (`5338300`) identifican la procedencia histórica de sus cambios. El despliegue integrado no se da por realizado ni se acredita una prueba de planta por combinar el código.

Para ampliar: [Recorrido del código](handoff-session.md), [Integración API](tracking-api-integration.md), [Simulador](tracking-api-simulator.md) y [Estado de entrega](estado-entrega.md).

## Arquitectura y orientación

### 1. ¿Qué entrega este proyecto y qué no entrega?

Entrega el frontend HMI, su proxy HTTP y herramientas de desarrollo/empaquetado. No es MaterialTrackingService, una base de datos, un driver PLC ni el motor de impresión. Los cambios de reglas industriales se revisan con el dueño del backend; una pantalla no reemplaza esa lógica.

### 2. ¿Por dónde empiezo a leer el código?

Abrir [app/page.tsx](../app/page.tsx), que renderiza [Dashboard](../components/dashboard.tsx). Seguir después `usePlantState → useTrackingApi → TrackingApiClient`. En sentido inverso, seguir un `CurrentZone` del JSON hasta `groupTrackingBundlesByZone` y `TrackingZoneSlot`. Ese recorrido explica el sistema mejor que empezar por los componentes visuales genéricos.

### 3. ¿Qué stack y versiones debo tomar como referencia?

El [package.json](../package.json) revisado declara Next.js 16.3.0, React 19.2.4 y TypeScript 5.7.3. El lockfile fija la resolución instalada. No aplicar ejemplos de otra versión de Next sin comprobarlos: consultar la guía pertinente de `node_modules/next/dist/docs/` antes de escribir código, además de las instrucciones locales que incluya el repositorio receptor.

### 4. ¿Hay una consulta distinta del estado por cada pantalla?

Dashboard comparte el resultado de [usePlantState](../hooks/use-plant-state.ts) entre las vistas. Cambiar Overview/Bay/Stackers no cambia la fuente de verdad. Otros paneles sí pueden realizar consultas independientes de catálogos o selecciones; eso no equivale a otro motor de tracking por vista.

### 5. ¿El frontend se conecta a SQL o al PLC?

No. El cliente consulta HTTP y el servidor HMI reenvía las operaciones permitidas a MaterialTrackingService. SQL, PLC, QMOS y reglas de impresión pertenecen al servicio. No se deben agregar credenciales industriales a variables públicas para resolver una falla de conectividad.

### 6. ¿Por qué existe /tracking-api si el backend ya tiene una API?

Es un proxy de mismo origen para el navegador. [route.ts](../app/tracking-api/%5B...path%5D/route.ts) controla qué rutas y métodos pueden pasar y valida los cuerpos de escritura. Así el navegador no necesita acceso directo al puerto 8085. El proxy no convierte una red no autorizada en una red segura ni sustituye login.

### 7. ¿A qué equipo se refiere localhost dentro del destino del proxy?

Al equipo donde se ejecuta Node/Next.js. No al equipo del operador ni automáticamente al del backend. Una sesión RDP no crea un túnel; si Tracking está en otro host, Node debe poder alcanzar ese host con la configuración y permisos aprobados.

### 8. ¿Qué diferencia hay entre fuente, build y standalone?

El fuente permite desarrollar y reconstruir. El build genera la aplicación compilada; el empaquetador prepara el standalone con los archivos necesarios para ejecutar `server.js` mediante Node. Un ZIP ejecutable no sustituye al repositorio fuente y Git no es requisito del servidor que sólo ejecuta ese ZIP. Ver [Despliegue Windows](windows-standalone-deployment.md).

## Configuración, comunicación y errores

### 9. ¿Qué cambia entre mock, live y simulador?

Mock genera datos internos y no consulta Tracking. Live usa HTTP. El simulador es un backend HTTP ficticio: para probarlo se usa live apuntando a loopback. Si live falla, la aplicación no debe inventar datos pasando a mock.

### 10. ¿Qué configuración requiere otro build?

Las variables `NEXT_PUBLIC_*` quedan incorporadas al frontend compilado. Cambiarlas en producción exige reconstruir. `TRACKING_API_PROXY_TARGET` es configuración del servidor en ejecución; cambiarla exige aplicar el entorno y reiniciar el proceso correcto, no reconstruir. Un cambio de puerto de escucha tampoco exige recompilar.

### 11. ¿Qué se consulta al iniciar?

[useTrackingApi](../hooks/use-tracking-api.ts) realiza `status → capabilities → map → state`. Comprueba servicio activo y escenarios compatibles. Tras completar el bootstrap consulta normalmente sólo `state`; después de fallos vuelve a cargar los metadatos.

### 12. ¿“Polling de 1000 ms” significa exactamente una petición por segundo?

No. El temporizador se programa después de completar el ciclo, por lo que se suma la duración de la petición. El bucle no solapa sus propias solicitudes. Los GET de selecciones, diagnósticos o verificación manual son flujos independientes y pueden coincidir.

### 13. ¿Qué hace cuando falla la API?

Sin snapshot previo puede quedar offline; con snapshot conserva datos y muestra reconexión o antigüedad. Los reintentos de lectura usan espera creciente, variación y tope de 30 segundos. Al desmontar el hook cancela petición y temporizadores. No reintenta automáticamente comandos PUT/POST.

### 14. ¿Por qué Received cambia y State changed no?

Received deriva de la última recepción local exitosa; State changed deriva de `LastUpdateUtc` del backend. Puede haber comunicación sana sin cambios en el estado industrial. También puede responder el servicio HTTP aunque PLC/QMOS tengan un problema: son diagnósticos diferentes.

### 15. ¿Para qué sirven los validadores si ya usamos TypeScript?

TypeScript no valida JSON recibido en ejecución. [validation.ts](../lib/tracking-api/validation.ts) comprueba las formas reales antes de que el cliente acepte la respuesta. Los DTOs admiten propiedades adicionales para compatibilidad, pero los campos conocidos no se convierten indiscriminadamente ni se rellenan con datos inventados.

### 16. ¿Cómo se distinguen error HTTP, timeout y respuesta incompatible?

[TrackingApiClient](../lib/tracking-api/client.ts) genera categorías de error para HTTP, red, timeout, cancelación, JSON inválido y payload incompatible. Un 200 con HTML no es un estado válido. Un timeout de escritura tampoco demuestra rechazo: el servidor pudo aplicarla antes de perderse la respuesta.

### 17. ¿Por qué no se bloquea por apiVersion diferente?

El código usa esa versión como diagnóstico y valida capacidades/datos efectivos. Un número nuevo no garantiza todos los campos poblados, y un número diferente no demuestra incompatibilidad. Añadir un bloqueo por versión sin acuerdo rompería compatibilidad que hoy se resuelve mediante validación de contrato.

### 18. ¿Cómo localizo una falla: navegador, proxy o backend?

Comparar GET de status/state desde el servidor directamente al backend y a través del HMI. Revisar Network, código HTTP, escenario y JSON sin publicar datos sensibles. Directo correcto y proxy incorrecto orienta al destino/configuración/proxy; ambos incorrectos no demuestra por sí solo la causa industrial. El [diagnóstico de integración](tracking-api-integration.md) incluye un ejemplo de sólo lectura.

## Selecciones globales y contrato

### 19. ¿Mill Order, Destination e impresora se actualizan con cada poll?

No. [GlobalMillOrderPanel](../components/mill-order-selection-panel.tsx) tiene ciclos de carga/Refresh separados del estado. Orden/destino cargan según capacidades; impresora consulta sus endpoints al montar, al abrir su selector y con su propio Refresh. Otra estación puede cambiar un valor global entre esas lecturas.

### 20. ¿Qué campos exactos envían los tres PUT?

`updateGlobalMillOrder` envía `millOrder`; `updateGlobalDestination`, `destinationId`; `updateGlobalPrinter`, `PrinterId`. El casing no es uniforme. GET de impresora usa PascalCase y su respuesta PUT usa camelCase. Copiar un campo de una respuesta al request sin revisar el DTO puede ser incorrecto.

### 21. ¿Guardar orden y destino es una sola transacción?

No. `handleSubmit` guarda Destination primero si cambió, después Mill Order si cambió y finalmente lee ambos. Ante fallo intenta recuperar los valores activos y advierte posibles cambios parciales. No implementa rollback ni exclusión multiusuario; coordinar operaciones entre estaciones.

### 22. ¿Cambiar una selección reescribe bundles existentes o imprime?

El frontend cambia selecciones globales y verifica mediante GET; no envía por ello una orden de impresión ni reescribe todo el estado. Según el contrato, el backend aplica las selecciones a acciones posteriores; reglas específicas pueden tener prioridad. Persistencia SQL, QMOS CREATE y PRINT_NEXT requieren pruebas del backend, no sólo una respuesta del selector.

### 23. ¿Por qué faltan opciones de destino en la lista visible?

El selector muestra hasta 80 coincidencias y busca por descripción o ID. El catálogo real puede contener muchas más; las 1,476 ubicaciones observadas previamente no son un número fijo. El cliente normaliza `Id/Description` y `id/description`; no se debe mantener una lista manual duplicada de IDs.

### 24. ¿Capabilities autoriza al operador? ¿OperatorId equivale a login?

No a ambas. Capabilities anuncia funciones del servicio; el HMI lo usa para disponibilidad de controles, no identidad. `OperatorId` de correcciones es texto provisto por el cliente. La entrega no implementa autenticación ni roles; acceso, identidad, auditoría y permisos deben acordarse con IT y backend.

## Presentación y FIFO

### 25. ¿Qué define la posición y qué ID se ve?

La ubicación viene de `CurrentZone`, no de la animación. La identidad visible prioriza `BundleId`, después `L2Id` y finalmente `TrackingId`. Los comandos técnicos usan TrackingId; no sustituirlo por el número visible sólo porque sea más familiar al operador.

### 26. ¿Qué significa amarillo y qué pasa con los LCH ocultos?

La tarjeta usa amarillo para `WAITING_QMOS_ID` o `UNMATCHED`; leer ambos campos antes de inferir una falla. Ocultar tarjetas LCH en Overview/Bay 2 no elimina bundles: permanecen en el snapshot, agrupaciones y listado. El dibujo no es el inventario completo por sí solo.

### 27. ¿De dónde sale el peso y por qué no muestra una unidad?

[ScaleWeightReadout](../components/plant/scale-weight-readout.tsx) recibe bundles cuya zona es exactamente SGRT2. Presenta `Weight`, incluido cero, y distingue ausencia de bundle/peso. No usa SGRT2A/B ni agrega kg/lb porque esos datos no vienen definidos para esa lectura.

### 28. ¿Dónde se aplica FIFO y dónde no?

En esta versión integrada, heredado de `77f79bf`, `TrackingZoneSlot` llama al helper `lib/tracking-fifo.ts`. Se ordena la presentación dentro de tarjetas de zona; no cambia CurrentZone ni el arreglo de estado original. El panel general “Tracked bundles” conserva el orden recibido y no es la evidencia visual correcta para esa función.

### 29. ¿Qué diferencia hay entre CurrentZone y LogicalBufferName?

CurrentZone es la ubicación reportada. LogicalBufferName identifica membresía en una cola lógica. No tienen que coincidir por definición y el frontend no completa uno usando el otro. Estar en CCH2A no prueba que exista una secuencia FIFO activa para ese bundle.

### 30. ¿Qué hace FIFO con nulos, campos ausentes o grupos mezclados?

Los campos FIFO son opcionales y anulables. El helper exige nombre no vacío y secuencia entera segura; ordena cada nombre lógico exacto sólo en los índices que ya ocupaban sus miembros. Las entradas sin membresía válida mantienen su sitio y los grupos distintos no se comparan entre sí. No se transforma null en cero ni se ordena por ID como sustituto.

### 31. ¿Y si dos bundles tienen la misma secuencia? ¿Qué significa el asterisco?

El orden recibido se conserva en el empate; no se inventa cuál entró primero. El helper marca duplicados y la tarjeta señala FIFO incompleto cuando hay miembros ordenables junto con datos insuficientes o secuencias duplicadas. El contador sigue siendo total de bundles, y cinco filas visibles más scroll no equivalen a cinco posiciones físicas.

### 32. ¿FIFO ya quedó aceptado en planta porque el backend dice 0.42?

No. En la muestra directa revisada, el bundle `101637697 / TRK-0000103919` estaba en CCH2A con ambos campos FIFO nulos. Eso no prueba error del proxy, ni prueba orden FIFO, ni basta para atribuir un fallo al backend. Falta contrastar una muestra con membresía lógica y secuencias válidas; el simulador sólo verifica el frontend con datos ficticios.

## Acciones manuales, pruebas y mantenimiento

### 33. ¿Qué versión tiene retiro y reposicionamiento?

Esta rama `release/integrated-hmi` incluye ambos, heredados de `5338300`, junto con FIFO de `77f79bf`. Las ramas históricas separadas no se convierten por ello en el release integrado. Para desplegar, usar el commit final de esta rama y comprobar `RELEASE.txt`; disponibilidad del código no equivale a aceptación operativa.

### 34. ¿REMOVE, RETIRE y reposicionamiento son lo mismo?

No. La UI manual implementa REMOVE; no implementa RETIRE. `removeBundle` envía `Operation: "REMOVE"`; `repositionBundle` envía `CurrentZone` sin Operation, junto con TrackingId, OperatorId y Reason. No existe una operación MOVE inventada. La corrección legacy MillOrder1 sigue siendo otro camino y no debe mezclarse con el request de reposicionamiento.

### 35. ¿Cómo evita el panel actuar con una confirmación vieja o duplicada?

En el panel manual incluido, tras la confirmación nativa vuelve a leer estado del servicio, capacidades y mapa, y consulta estado al final. `manualPreflightProblem`, en `lib/tracking-api/manual-position.ts`, compara identidad, escenario, posición y destino. Un bloqueo local compartido persiste al cerrar el detalle. Esto reduce carreras de UI, pero no crea una transacción con el PLC ni un bloqueo entre estaciones.

### 36. ¿HTTP 202 o accepted:true significa “retirado”?

No: significa aceptado/encolado. El panel verifica mediante lecturas iniciadas después de la respuesta: ausencia para retiro, presencia única en destino para reposicionamiento. En la prueba de `TRK-0000100822`, el ACK del evento `134331` fue `MANUAL_CORRECTION`, el bundle siguió presente y no se encontró el evento en la ventana reciente. Resultado pendiente, no éxito. La ventana reciente no es una auditoría histórica completa.

### 37. ¿Qué se hace si un comando manual queda incierto?

No reenvía automáticamente POST. El panel mantiene el bloqueo y verifica mediante GET durante una ventana de unos 60 segundos, con esperas de dos segundos entre lecturas; después ofrece comprobar nuevamente sólo por lectura. Un resultado observado en estado tampoco prueba movimiento físico ni explica por sí solo toda la auditoría. Coordinar con backend antes de repetir, resetear o intentar otra operación.

### 38. ¿Cómo hago una capacitación sin tocar producción?

Seguir [Simulador](tracking-api-simulator.md) en una copia separada: API 127.0.0.1:18085 y frontend 127.0.0.1:3100. Antes de cualquier escritura, comprobar directa y vía proxy el servicio MaterialTrackingServiceSimulator y escenario LOCAL_HMI_SIMULATOR en status/map/state. No detener listeners de 3000/3001/8085. Este fuente integrado incluye las pruebas FIFO y manuales; ejecutarlas localmente no modifica el backend de planta.

### 39. ¿Qué reviso antes de modificar una zona, un DTO o un comando?

Localizar el contrato y versión, leer la guía Next pertinente, comprobar tipos, validadores, cliente, allowlist del proxy y consumidor de UI. Para una zona revisar [tracking-zone-layout.ts](../lib/tracking-zone-layout.ts) y diagramas: recibirla no crea su geometría. Añadir pruebas de campos ausentes/nulos, errores HTTP, escenario y efectos parciales. No habilitar reset, OPC write o POST QMOS como “solución rápida”.

### 40. ¿Qué debe quedar registrado al entregar y qué sigue pendiente?

Commit del fuente, identidad del paquete/build, configuración sin secretos, responsable, resultados y limitaciones de pruebas. Esta versión integrada mantiene el empaquetador legacy y no incluye los helpers de servicio del kit histórico. No confundir el código integrado, el ZIP generado y el proceso que realmente está corriendo. La aceptación FIFO real y el retiro histórico siguen no confirmados; persistencia, reglas, servicio Windows y recuperación requieren su propia evidencia según el entorno. Ver [Entrega Git](entrega-git.md), [Despliegue](windows-standalone-deployment.md) y [Estado de entrega](estado-entrega.md).

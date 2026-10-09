# Preguntas técnicas para la transferencia TX1

Respuestas basadas en el **integrado `7fc34e8`, rama `release/integrated-hmi`, publicado y desplegado**: FIFO y operaciones manuales conviven en el HMI de 3000, con Tracking en 8085. La sesión se realiza sobre el servidor real y el fuente `C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8`; no se basa en una demo de simulador. “Base” (`600d20f`), “FIFO” (`77f79bf`) y “manual” (`5338300`) identifican antecedentes históricos, no ramas que deban intercambiarse durante el training.

Las respuestas cortas están escritas para decirse en la sesión. Cuando pidan demostrar algo, abrir el archivo enlazado y buscar el símbolo indicado con Ctrl+F. Una explicación del código no sustituye la validación de efectos PLC/auditoría; el caso real REMOVE del evento 154605 permite mostrar esa diferencia con evidencia.

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

Para enseñarlo: buscar `const run` y `if (!bootstrapped)`; después `commitState`. Ahí se ve dónde se guarda el snapshot válido y se actualizan las marcas de tiempo, sin abrir una base de datos.

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

Para mostrarlo: buscar `private async request`, después `response.ok`, `validate(body)` y `timedOut`. La interpretación final del error visible está en el hook o en el panel que hizo la operación; no todo error del frontend equivale a un HTTP 500 del backend.

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

Abrir `components/mill-order-selection-panel.tsx` y buscar `handleSubmit` y `refreshActiveValuesAfterFailure`. Para impresora, buscar `handlePrinterSubmit`: es otro flujo con PUT y GET de comprobación propios.

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

El integrado **`7fc34e8`**, que corre en 3000, incluye ambos junto con FIFO. No hay que abrir un puerto QA para encontrar el botón ni cambiar entre ramas. Abrir `TrackingBundlesPanel`: las dos acciones están en cada tarjeta del listado. Si se ve un panel sin ellas, primero verificar versión/URL/build; una capability faltante deshabilita los controles, no agrega la función a un build antiguo.

### 34. ¿REMOVE, RETIRE y reposicionamiento son lo mismo?

No. La UI manual implementa REMOVE; no implementa RETIRE. `removeBundle` envía `Operation: "REMOVE"`; `repositionBundle` envía `CurrentZone` sin Operation, junto con TrackingId, OperatorId y Reason. No existe una operación MOVE inventada. La corrección legacy MillOrder1 sigue siendo otro camino y no debe mezclarse con el request de reposicionamiento.

### 35. ¿Cómo evita el panel actuar con una confirmación vieja o duplicada?

En el panel manual incluido, tras la confirmación nativa vuelve a leer estado del servicio, capacidades y mapa, y consulta estado al final. `manualPreflightProblem`, en `lib/tracking-api/manual-position.ts`, compara identidad, escenario, posición y destino. Un bloqueo local compartido persiste al cerrar el detalle. Esto reduce carreras de UI, pero no crea una transacción con el PLC ni un bloqueo entre estaciones.

### 36. ¿HTTP 202 o accepted:true significa “retirado”?

No: significa aceptado/encolado. En la prueba más reciente, evento **154605** para `TRK-0000103919`, además del 202 se observó después **Status REMOVED, CurrentZone null y OccupiedZones vacío** directamente en 8085. Son dos evidencias distintas. La HMI todavía exige ausencia total del TrackingId para cerrar REMOVE, por eso quedó pendiente al conservarse el registro. Falta confirmar con backend esa retención y los efectos PLC/auditoría, no demostrar otra vez que el POST sí se envió.

El evento anterior `134331`, de otro TrackingId (`TRK-0000100822`), quedó `WAITING_QMOS_ID` y no apareció en la ventana reciente consultada. No mezclar ambos resultados. La ventana reciente no es una auditoría histórica completa.

### 37. ¿Qué se hace si un comando manual queda incierto?

No reenvía automáticamente POST. El panel mantiene el bloqueo y verifica mediante GET durante una ventana de unos 60 segundos, con esperas de dos segundos entre lecturas; después ofrece comprobar nuevamente sólo por lectura. Un resultado observado en estado tampoco prueba movimiento físico ni explica por sí solo toda la auditoría. Coordinar con backend antes de repetir, resetear o intentar otra operación.

### 38. ¿Cómo hacemos la capacitación en el servidor real sin alterar la operación?

Abrir el fuente de `tx1-integrated-release-7fc34e8`, el HMI `127.0.0.1:3000` y Network. Seguir peticiones GET reales de status/state y catálogos; navegar por las vistas no requiere cambiar selecciones. Para explicar un comando, recorrer `handleCommand` y mostrar la captura del evento 154605. No levantar un simulador, parar servicios, hacer pull/build ni confirmar escrituras sólo para enseñar el recorrido. Una nueva prueba de REMOVE se coordina con el responsable, un bundle concreto y un horario; no se presupone por estar en una sesión de código.

### 39. ¿Qué reviso antes de modificar una zona, un DTO o un comando?

Localizar el contrato y versión, leer la guía Next pertinente, comprobar tipos, validadores, cliente, allowlist del proxy y consumidor de UI. Para una zona revisar [tracking-zone-layout.ts](../lib/tracking-zone-layout.ts) y diagramas: recibirla no crea su geometría. Añadir pruebas de campos ausentes/nulos, errores HTTP, escenario y efectos parciales. No habilitar reset, OPC write o POST QMOS como “solución rápida”.

### 40. ¿Qué debe quedar registrado al entregar y qué sigue pendiente?

Commit del fuente (`7fc34e8`), identidad del paquete/build, configuración sin secretos, responsable, resultados y límites de pruebas. Esta versión mantiene el empaquetador legacy y no incluye los helpers de servicio del kit histórico. El integrado ya fue publicado y desplegado; no describirlo como una integración futura. Queda confirmar FIFO con secuencias reales, semántica del REMOVED retenido y evidencia PLC/auditoría. Servicio Windows, recuperación, persistencia y reglas necesitan su propia prueba. Ver [Entrega Git](entrega-git.md), [Despliegue](windows-standalone-deployment.md) y [Estado de entrega](estado-entrega.md).

## Preguntas sobre la prueba real y dónde demostrar cada respuesta

### 41. ¿La HMI guarda un log de quién pulsó Remove y a qué hora?

No tiene una bitácora persistente propia de acciones. Envía `OperatorId` y `Reason` al backend y muestra el `eventId` recibido en memoria. Para demostrarlo, abrir `TrackingBundlesPanel`: `commandMessage` se guarda con `useState`; después abrir `POST` del proxy: reenvía la petición/respuesta, no las escribe a un archivo. La auditoría formal pertenece a L2/backend. Network sirve para capturar esta prueba, pero hay que haberlo abierto y guardar la evidencia; no reconstruye automáticamente una prueba pasada.

### 42. ¿Qué captura concreta le entrego al responsable del backend?

De la fila POST `correct` en Network: **Headers** con URL/método/HTTP/Date; **Payload** con los cuatro campos reales; **Response** con ACK/eventId o error. Añadir una lectura posterior de state filtrada por TrackingId. No hace falta duplicar Response con Preview. Para el caso actual: `TRK-0000103919`, bundle `101637697`, evento `154605`, HTTP 202, Date `Thu, 08 Oct 2026 02:11:48 GMT`. El Date es la marca reportada en la respuesta, no una certificación de la hora exacta del clic o del cambio PLC.

### 43. ¿Por qué sale REMOVED / Unknown zone y al mismo tiempo “pendiente”?

Porque hoy se usan dos criterios diferentes. El listado presenta el Status recibido y convierte una zona nula en “Unknown zone”. El verificador `manualOutcomeObserved` exige `matches.length === 0` para REMOVE: si el backend conserva el registro como REMOVED, nunca cumple esa condición. Abrir [manual-position.ts](../lib/tracking-api/manual-position.ts) y después [tracking-bundles-panel.tsx](../components/tracking-bundles-panel.tsx), buscando `manualOutcomeObserved`, `bundle.Status` y `Unknown zone`. No es que el frontend invente REMOVED ni que faltara enviar la solicitud.

### 44. ¿Entonces sólo cambiamos el if a Status REMOVED y ya quedó?

Primero confirmar con backend qué significa el estado final y qué condiciones de ocupación/membresía deben acompañarlo. El contrato indica retiro del tracking activo y conservación de histórico, pero no define aquí la representación del histórico en `/state`. Si se confirma retención, hay que alinear resultado observado, lista/conteo de activos y acciones permitidas sobre retirados, con pruebas de estado inconsistente, duplicados y escenarios distintos. **Ese ajuste aún no está implementado.** No basta ocultar la tarjeta ni mostrar éxito basándose en el 202.

### 45. ¿El contador de activos ya excluye los retirados?

No. En `components/kpi-cards.tsx`, `KpiCards` usa `liveBundles.length`; el panel también cuenta todo `state.Bundles`. Buscar esas expresiones. El mapa es diferente: `groupTrackingBundlesByZone` agrupa por CurrentZone, de modo que un REMOVED con zona nula no ocupa CCH2A visualmente, pero sigue en lista y contador. Es parte de la misma semántica por acordar, no evidencia de que el bundle continúe físicamente en la mesa.

### 46. ¿Puedo refrescar la página y volver a enviar para que quite el pendiente?

No como método de diagnóstico. Recargar borra el bloqueo local, pero no revierte ni cancela el comando aceptado por el backend. Actualmente no hay un filtro específico que impida seleccionar un registro retenido sólo por Status REMOVED después de recargar. Usar **Check state again (read only)** y consultar backend con el eventId; no repetir POST, cambiar a RETIRE o hacer RESET para forzar el resultado visual.

### 47. ¿Dónde puedo seguir un dato desde la API hasta una tarjeta?

Abrir estos archivos y símbolos en orden; no hace falta modificar código ni poner breakpoints que pausen el polling:

| Paso | Archivo | Símbolo o texto para buscar | Qué demuestra |
| --- | --- | --- | --- |
| Solicitud de estado | `lib/tracking-api/client.ts` | `getState`, `private async request` | Endpoint, validación y JSON recibido. |
| Ruta del servidor HMI | `app/tracking-api/[...path]/route.ts` | `GET`, `getProxyTarget`, `upstream.arrayBuffer` | Destino privado y paso del cuerpo sin eliminar campos FIFO. |
| Guardado del snapshot | `hooks/use-tracking-api.ts` | `commitState`, `const run` | Estado aceptado y marcas de tiempo locales/backend. |
| Preparación para las vistas | `hooks/use-plant-state.ts` | `groupTrackingBundlesByZone` | Agrupación compartida del snapshot. |
| Ubicación | `lib/tracking-zone-layout.ts` | `groupTrackingBundlesByZone` | CurrentZone decide la agrupación, no el índice del arreglo. |
| Presentación de la tarjeta | `components/plant/tracking-zone-slot.tsx` | `TrackingZoneSlot`, `orderBundlesByLogicalFifo` | Contenido, contador, estados y orden. |
| Regla FIFO visual | `lib/tracking-fifo.ts` | `getFifoMembership`, `orderBundlesByLogicalFifo` | Secuencia lógica, grupos independientes y datos parciales. |

Para peso, terminar en `components/plant/scale-weight-readout.tsx`, `ScaleWeightReadout`: ver `bundle.Weight == null`. Para un bundle seleccionado y REMOVE, seguir el recorrido de [Integración API](tracking-api-integration.md) desde `handleCommand` hasta el POST y el GET posterior.

### 48. ¿Qué respondo si durante la sesión la API no entrega un valor o falla una llamada?

“Vamos a distinguir qué respondió el servicio y qué hace la pantalla con esa respuesta. No voy a completar el dato ni cambiar producción para que la demo se vea de cierta forma.” Mostrar Network, escenario, HTTP y campo exacto; conservar evidencia del caso. Continuar con el código y la captura disponible si falla la conexión. No diagnosticar PLC sólo con un 200 de status, ni presentar datos históricos como si fueran la posición actual. Registrar la pregunta pendiente y el responsable que puede confirmarla.

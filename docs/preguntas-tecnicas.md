# Preguntas técnicas para la transferencia TX1

Respuestas para `release/integrated-hmi`: base funcional desplegada documentada **`7fc34e8`**, checkpoint documental anterior `c7df85a` y checkpoint de fuente del **13 de octubre de 2026**, pendiente de despliegue. La nueva proyección REMOVED, el reset y el layout compartido de Bundler no deben atribuirse al paquete antiguo de 3000. El servidor documentado usa Tracking en 8085 y el fuente `C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8`. Los commits de base/FIFO/manual son antecedentes, no ramas para intercambiar durante el training.

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

No: significa aceptado/encolado. En el evento **154605** para `TRK-0000103919`, además del 202 se observó después **REMOVED, CurrentZone null y OccupiedZones vacío** directamente en 8085. La HMI de `7fc34e8` quedó pendiente porque exigía ausencia total. El cambio local reconoce ese resultado sólo con identidad única, mismo escenario y posiciones explícitamente vacías. Aún se deben verificar despliegue, PLC y auditoría; no reenviar para demostrar otra vez el POST.

El evento anterior `134331`, de otro TrackingId (`TRK-0000100822`), quedó `WAITING_QMOS_ID` y no apareció en la ventana reciente consultada. No mezclar ambos resultados. La ventana reciente no es una auditoría histórica completa.

### 37. ¿Qué se hace si un comando manual queda incierto?

No reenvía automáticamente POST. El panel mantiene el bloqueo y verifica mediante GET durante una ventana de unos 60 segundos, con esperas de dos segundos entre lecturas; después ofrece comprobar nuevamente sólo por lectura. Un resultado observado en estado tampoco prueba movimiento físico ni explica por sí solo toda la auditoría. Coordinar con backend antes de repetir, resetear o intentar otra operación.

### 38. ¿Cómo hacemos la capacitación en el servidor real sin alterar la operación?

Abrir el fuente de `tx1-integrated-release-7fc34e8`, el HMI `127.0.0.1:3000` y Network. Seguir peticiones GET reales de status/state y catálogos; navegar por las vistas no requiere cambiar selecciones. Para explicar un comando, recorrer `handleCommand` y mostrar la captura del evento 154605. No levantar un simulador, parar servicios, hacer pull/build ni confirmar escrituras sólo para enseñar el recorrido. Una nueva prueba de REMOVE se coordina con el responsable, un bundle concreto y un horario; no se presupone por estar en una sesión de código.

### 39. ¿Qué reviso antes de modificar una zona, un DTO o un comando?

Localizar el contrato y versión, leer la guía Next pertinente, comprobar tipos, validadores, cliente, allowlist del proxy y consumidor de UI. Para una zona revisar [tracking-zone-layout.ts](../lib/tracking-zone-layout.ts) y diagramas: recibirla no crea su geometría. Añadir pruebas de campos ausentes/nulos, errores HTTP, escenario y efectos parciales. No habilitar reset, OPC write o POST QMOS como “solución rápida”.

### 40. ¿Qué debe quedar registrado al entregar y qué sigue pendiente?

Commit del fuente y cambios locales, identidad del paquete/build, configuración sin secretos, responsable y límites de pruebas. `7fc34e8` fue desplegado; los cambios nuevos aún no. Antes de entregar deben identificarse y probarse desde su versión final. Quedan FIFO con secuencias reales, commissioning del filtro/confirmación y reset, PLC/auditoría y acuerdo de campos obligatorios. Se conserva empaquetador legacy sin los helpers del kit. Ver [Entrega Git](entrega-git.md), [Despliegue](windows-standalone-deployment.md) y [Estado de entrega](estado-entrega.md).

## Preguntas sobre la prueba real y dónde demostrar cada respuesta

### 41. ¿La HMI guarda un log de quién pulsó Remove y a qué hora?

No tiene una bitácora persistente propia de acciones. Envía `OperatorId` y `Reason` al backend y muestra el `eventId` recibido en memoria. Para demostrarlo, abrir `TrackingBundlesPanel`: `commandMessage` se guarda con `useState`; después abrir `POST` del proxy: reenvía la petición/respuesta, no las escribe a un archivo. La auditoría formal pertenece a L2/backend. Network sirve para capturar esta prueba, pero hay que haberlo abierto y guardar la evidencia; no reconstruye automáticamente una prueba pasada.

### 42. ¿Qué captura concreta le entrego al responsable del backend?

De la fila POST `correct` en Network: **Headers** con URL/método/HTTP/Date; **Payload** con los cuatro campos reales; **Response** con ACK/eventId o error. Añadir una lectura posterior de state filtrada por TrackingId. No hace falta duplicar Response con Preview. Para el caso actual: `TRK-0000103919`, bundle `101637697`, evento `154605`, HTTP 202, Date `Thu, 08 Oct 2026 02:11:48 GMT`. El Date es la marca reportada en la respuesta, no una certificación de la hora exacta del clic o del cambio PLC.

### 43. ¿Por qué sale REMOVED / Unknown zone y al mismo tiempo “pendiente”?

Eso se observó en `7fc34e8`: el listado mostraba el registro, mientras `manualOutcomeObserved` sólo aceptaba ausencia. El código local ya filtra REMOVED de vistas activas y confirma un único registro retenido del mismo escenario con zona null y huella explícita vacía. Abrir [bundle-lifecycle.ts](../lib/tracking-api/bundle-lifecycle.ts), [manual-position.ts](../lib/tracking-api/manual-position.ts) y el panel. El snapshot completo sigue disponible; pendientes por ocupación residual no se convierten artificialmente en éxito.

### 44. ¿Entonces sólo cambiamos el if a Status REMOVED y ya quedó?

No basta Status ni HTTP 202. El ajuste local comprueba además identidad única, escenario coincidente, `CurrentZone === null` y `OccupiedZones` array explícitamente vacío. También admite ausencia; duplicados, zona/huella residual o estado no removido no confirman. Las vistas usan una proyección separada y el preflight bloquea nuevas acciones sobre removidos. Pruebas locales no sustituyen validar efectos operativos y auditoría.

### 45. ¿El contador de activos ya excluye los retirados?

Sí en el nuevo código local: KPI, banner, listado, agrupación de zonas y peso usan `getActiveBundles`. Sólo excluye REMOVED normalizado, sin inventar otros estados terminales. `state.Bundles` conserva todos los registros: la HMI no borra historia ni pierde evidencia de una huella inconsistente. El paquete histórico `7fc34e8` no tenía ese filtro.

### 46. ¿Puedo refrescar la página y volver a enviar para que quite el pendiente?

No como diagnóstico. Recargar borra el bloqueo local, pero no revierte ni cancela el comando backend. El nuevo filtro/preflight impide seleccionar removidos, pero eso no proporciona idempotencia de backend ni justifica repetir una acción incierta. Usar **Check state again (read only)** y consultar el eventId; no repetir POST ni usar RETIRE/RESET para forzar el resultado visual.

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

### 49. ¿Ya está oculto Operator ID y puedo omitir Comments?

Operator ID todavía no se oculta: API 0.44 rechazó `OperatorId: null` con 400 y el mensaje `OperatorId is required for HMI corrections.`. Se requiere un cambio del backend o mecanismo de identidad acordado, no un operador fijo. **Comments sí es opcional en el código local de REMOVE**: vacío/espacios → `Reason: null`, texto no vacío recortado. La prueba directa con operador informado y Reason null recibió 202/evento 237102 y posteriormente reportó REMOVED sin posiciones para `TRK-0000110850`; no prueba que el nuevo formulario esté desplegado ni acredita PLC/auditoría.

Reposition y corrección legacy aún conservan comentario obligatorio: sus variantes no se han probado con null. El apéndice histórico v0.39 exigía ambos campos para REMOVE y v0.6 operador en correcciones; pedir actualización del contrato según la evidencia 0.44. No inventar identidad ni motivo automático. Operator ID es texto de auditoría, no autenticación. Ver [Estado de entrega](estado-entrega.md#prueba-directa-api-044-nulidad-de-campos-evento-237102).

### 50. ¿Reset reinicia Windows o equivale a retirar un bundle?

No es un reinicio de Windows ni de Node. Es el comando **global de Tracking** `POST /api/tracking/reset`, sin cuerpo, separado de `/correct`. Su efecto industrial/histórico exacto se valida con backend y operación; no usarlo para resolver un pending individual. La UI exige RESET escrito, casilla de autorización, confirmación global y preflight fresco. Ver [commissioning de reset](tracking-reset-commissioning.md).

### 51. ¿Cómo sé que el reset terminó y qué protege el botón?

El acuse HTTP 202 con `accepted`, `eventId` y `eventType: RESET` no demuestra finalización. La UI verifica con GET posterior y no usa un estado inicialmente vacío como prueba. El lock compartido evita simultaneidad manual/reset sólo en ese Dashboard; una respuesta incierta no se reenvía automáticamente. Header explícito, capability, casilla y diálogo no son autenticación/roles ni bloqueo multiusuario. La auditoría y efectos PLC se confirman por separado.

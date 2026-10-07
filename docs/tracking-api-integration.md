# Integracion con Tracking API

Para probar el flujo completo sin acceso al servidor, consulta [Simulador local de Tracking API](./tracking-api-simulator.md).

La integracion conecta el frontend con las lecturas de tracking y permite seleccionar la Mill Order y el Destination globales para las siguientes operaciones QMOS CREATE, ademas de la impresora global para las siguientes impresiones automaticas. El panel Tracked bundles permite solicitar retiros y reposicionamientos manuales; la correccion de MillOrder1 por bundle permanece en el cliente tecnico y no forma parte de la seleccion global de produccion. El modo predeterminado sigue siendo `mock`, de modo que clonar y ejecutar el proyecto no genera trafico hacia el entorno de pruebas.

## Arquitectura elegida

El navegador consulta una ruta del mismo frontend. Next.js reenvia exclusivamente las operaciones aprobadas hacia el servicio:

```text
Navegador -> /tracking-api -> proxy con allowlist de Next.js -> MaterialTrackingService :8085
```

Esto evita que el navegador necesite acceso directo al puerto 8085 y elimina bloqueos de CORS, contenido mixto o permisos de red local durante las pruebas. El proxy usa listas permitidas por metodo, filtra los cuerpos y publica exclusivamente las operaciones aprobadas.

El acceso por RDP no crea por si mismo un tunel de red. El proceso de Next.js debe ejecutarse en una maquina que pueda alcanzar al servicio configurado en `TRACKING_API_PROXY_TARGET`.

## Configuracion

Copia `.env.example` como `.env.local` y cambia solamente los valores necesarios:

```powershell
Copy-Item -LiteralPath .env.example -Destination .env.local
```

| Variable | Valor de ejemplo | Funcion |
| --- | --- | --- |
| `NEXT_PUBLIC_PLANT_DATA_MODE` | `mock` | Selecciona `mock` o `live`. |
| `NEXT_PUBLIC_TRACKING_API_URL` | `/tracking-api` | Ruta de mismo origen que usara el navegador en modo `live`. |
| `TRACKING_API_PROXY_TARGET` | `http://localhost:8085` | URL privada que usara Next.js para llegar al servicio. |
| `NEXT_PUBLIC_TRACKING_POLL_MS` | `1000` | Intervalo normal entre lecturas de estado. |
| `NEXT_PUBLIC_TRACKING_STALE_MS` | `3500` | Tiempo sin una lectura exitosa antes de considerar viejos los datos. |
| `NEXT_PUBLIC_TRACKING_TIMEOUT_MS` | `4000` | Limite de tiempo de cada solicitud HTTP. |

Para activar datos reales en el entorno de pruebas:

```dotenv
NEXT_PUBLIC_PLANT_DATA_MODE=live
NEXT_PUBLIC_TRACKING_API_URL=/tracking-api
TRACKING_API_PROXY_TARGET=http://localhost:8085
```

Las variables `NEXT_PUBLIC_*` quedan expuestas al navegador y normalmente se incorporan durante el build de Next.js. `TRACKING_API_PROXY_TARGET` solo se usa en el servidor, pero tampoco debe contener credenciales. Despues de modificar estas variables hay que reiniciar `pnpm dev`; para un despliegue hay que reconstruir la aplicacion con los valores del ambiente destino.

El modo `live` no debe caer silenciosamente a datos simulados cuando la API falle. Debe conservar, si existe, la ultima lectura valida y marcarla como desconectada o desactualizada. El modo `mock` debe identificarse como tal y no realizar solicitudes a la API.

## Como probar dentro del RDP

1. Clona o copia el repositorio dentro de la sesion RDP.
2. Confirma que el servicio responde desde esa misma sesion:

   ```powershell
   curl.exe -i --connect-timeout 3 --max-time 5 http://localhost:8085/api/tracking/status
   ```

3. Crea `.env.local`, configura `NEXT_PUBLIC_PLANT_DATA_MODE=live`, usa `/tracking-api` como URL publica y conserva `http://localhost:8085` como `TRACKING_API_PROXY_TARGET` si el servicio corre en la misma maquina.
4. Instala dependencias y arranca el frontend:

   ```powershell
   pnpm install
   pnpm dev
   ```

5. Abre `http://localhost:3000` en un navegador dentro del RDP y revisa tambien la pestana Network de las herramientas de desarrollo.

Si la API corre en otro equipo, sustituye `TRACKING_API_PROXY_TARGET` por el host real solo despues de validar conectividad y firewall desde la maquina que ejecuta Next.js.

## Endpoints usados en esta etapa

Las operaciones principales son:

| Endpoint | Uso | Frecuencia esperada |
| --- | --- | --- |
| `/api/tracking/status` | Salud basica, escenario y version reportada por el servicio. | Al iniciar. |
| `/api/tracking/capabilities` | Capacidades publicadas por la compilacion activa. | Al iniciar. |
| `/api/tracking/map` | Catalogo de zonas, rutas, destinos y reglas. | Al iniciar. |
| `/api/tracking/state` | Estado actual de los bundles. | Polling, inicialmente cada segundo. |
| `/api/qmos/mill-orders?max=50` | Candidatos de Mill Order para seleccion del operador. | Al abrir o actualizar el selector. |
| `/api/qmos/bundle-locations` | Destinos QMOS validos para busqueda y seleccion del operador. | Al abrir o actualizar el selector. |
| `/api/qmos/printers` | Catalogo QMOS de impresoras (`PrinterId`, `PrinterName`). | Al abrir o actualizar el selector de impresora. |
| `GET /api/tracking/mill-order` | Mill Order global activa y fecha de actualizacion. | Al abrir la pantalla, al actualizar y despues de guardar. |
| `PUT /api/tracking/mill-order` | Guarda la Mill Order global para los siguientes QMOS CREATE. | Solo tras confirmacion del operador. |
| `GET /api/tracking/destination` | Destination global activo y fecha de actualizacion. | Al abrir la pantalla, al actualizar y despues de guardar. |
| `PUT /api/tracking/destination` | Guarda el Destination global para los siguientes QMOS CREATE. | Solo tras confirmacion del operador. |
| `GET /api/tracking/printer` | Impresora global activa (`PrinterId`, `PrinterName`, `UpdatedUtc`), o valores nulos si aun no se ha seleccionado. | Al abrir la pantalla, al actualizar y despues de guardar. |
| `PUT /api/tracking/printer` | Guarda la impresora global mediante `{ "PrinterId": n }`; devuelve `updated`, `printerId`, `printerName`, `updatedUtc` y `appliesTo`. | Solo tras confirmacion del operador. |
| `POST /api/tracking/correct` con `Operation: "REMOVE"` | Solicita retirar un solo bundle del tracking activo usando su `TrackingId`, operador y motivo. | Solo tras seleccion y confirmacion explicita. |
| `POST /api/tracking/correct` con `CurrentZone`, sin `Operation` | Solicita corregir la posicion registrada de un bundle. No ordena movimiento fisico. | Solo tras seleccion, confirmacion y nueva lectura del estado. |

El servicio `0.12` se observo devolviendo `/api/qmos/mill-orders` como un arreglo JSON directo. Algunas respuestas/herramientas anteriores lo mostraron envuelto como `{ "value": [...], "Count": n }`. El cliente acepta ambos formatos y los normaliza internamente para no acoplar la pantalla a esa diferencia de serializacion.

El servicio `0.35` devuelve `/api/qmos/bundle-locations` como un arreglo directo con `Id` y `Description`. El contrato previo documento `id` y `description`; el cliente acepta ambas variantes y las normaliza. En la validacion de produccion se observaron 1,476 ubicaciones, por lo que el HMI utiliza busqueda por descripcion o ID y limita los resultados visibles.

La version devuelta en `apiVersion` se conserva como dato diagnostico. De acuerdo con el equipo de backend, sus cambios actuales corresponden a distintas compilaciones y no a cambios del contrato, por lo que no se debe codificar una comparacion rigida contra un unico valor como `0.12`.

El cliente tambien tipa las lecturas de bundle individual, eventos, OPC y estado de QMOS para diagnostico y actualizacion puntual.

## Representacion de zonas y peso

La posicion de cada bundle proviene de `CurrentZone` en `/api/tracking/state`. En Plant Overview y Bay 1, la tarjeta de la bascula muestra el campo `Weight` de los bundles cuya zona actual es exactamente `SGRT2`, junto a su identificador. Si no hay un bundle en `SGRT2`, lo indica; si el bundle no tiene `Weight`, muestra que el peso no esta disponible. El HMI no calcula pesos ni agrega unidades que la API no proporciona.

Plant Overview y Bay 2 ya no dibujan las posiciones `LCH1A`, `LCH1B`, `LCH2A` y `LCH2B`. Estas zonas permanecen en el catalogo y en los datos de Tracking: ocultar su tarjeta no elimina ni reasigna los bundles que la API reporte ahi.

Las tarjetas de `CCH1A/B` y `CCH2A/B` tienen altura para mostrar cinco identificadores completos de bundles. Si hay mas de cinco, la lista de la tarjeta se desplaza verticalmente; el contador sigue mostrando el total reportado por Tracking. La lista no representa una secuencia fisica dentro del buffer.

## Seleccion global y correccion individual

La seleccion normal de produccion no depende de un bundle. El HMI consulta los catalogos QMOS y los valores globales actuales, exige una Mill Order y un Destination, solicita confirmacion antes del cambio, ejecuta los PUT necesarios y vuelve a leer ambos valores para verificar que quedaron activos.

Los dos valores se guardan mediante endpoints independientes y no forman una transaccion atomica. El HMI guarda primero Destination, verifica finalmente ambos valores y, ante un error parcial, vuelve a leer el estado y advierte que uno de los valores puede haber cambiado.

La impresora se selecciona por separado. El HMI consulta `/api/qmos/printers`, muestra las opciones recibidas sin codificar nombres ni IDs, consulta `/api/tracking/printer` y envia el `PrinterId` elegido a `PUT /api/tracking/printer`. El servicio valida el ID contra el catalogo QMOS; un ID inexistente devuelve HTTP 400 y no modifica la seleccion. El GET posterior confirma el valor activo. En produccion, Tracking lo persiste en SQL Server y sobrevive a reinicios del HMI y del servicio.

La impresora global se utiliza en acciones automaticas `PRINT_NEXT` posteriores. Una regla `BufferEventRule` con `PrinterId` no nulo conserva prioridad sobre la seleccion global. El contrato del comando explicito `POST /api/qmos/print` no cambia: quien lo invoque debe seguir enviando la impresora requerida por ese comando.

El cambio no reescribe bundles existentes ni reenvia transacciones QMOS terminadas. Tracking aplica la precedencia definida por backend: orden especifica del bundle, orden global activa y finalmente el fallback INI si existe.

`POST /api/tracking/correct` conserva su semantica de correccion manual para un bundle existente, pero el HMI no debe invocarlo para asignar rutinariamente la orden de produccion.

### Retiro manual de un bundle

Desde el panel **Tracked bundles**, el operador selecciona un bundle y captura `OperatorId` y `Reason`. La HMI muestra el `TrackingId` real, solicita una segunda confirmacion y envia exclusivamente `{ TrackingId, Operation: "REMOVE", OperatorId, Reason }` a `POST /api/tracking/correct`. No usa el `BundleId`, LPN, tag ni la zona como identidad del comando. El retiro no invoca `/api/tracking/reset`.

Una respuesta `accepted: true` confirma que la solicitud fue aceptada, **no** que el bundle ya desaparecio. La HMI inicia una nueva consulta de Tracking despues de recibir la respuesta y muestra la ausencia solo cuando ese estado ya no contiene el `TrackingId`. Mientras esta pendiente bloquea tanto el retiro como el reposicionamiento; ante timeout o respuesta ambigua advierte que el comando pudo haberse aceptado y debe verificarse antes de repetirlo. El backend es responsable de limpiar HEAD/TAIL y ocupacion PLC, y preservar historial y auditoria; la HMI no escribe esas posiciones individualmente.

Despues de la confirmacion se vuelven a leer status, capabilities y map, y finalmente state inmediatamente antes de validar/enviar. El operador puede tomarse tiempo para leer el dialogo: ya no depende de aceptar antes de `staleMs`. Si cambia el escenario o la posicion/huella del bundle, o falla alguna lectura, no se envia el POST y se pide revisar de nuevo. El bloqueo evita dobles envios dentro del panel montado, incluso si se cierra y reabre; no persiste al recargar el navegador ni sustituye idempotencia en el backend.

La verificacion posterior consulta state cada dos segundos, sin solapar sus propias consultas, durante un minuto. Si no observa el resultado, conserva el bloqueo y permite **Check state again (read only)**, que solo repite lecturas; nunca reenvia el comando. Estos GET de verificacion pueden coincidir con el polling normal del dashboard. El resultado observado no certifica por si solo la auditoria o el PLC.

La accion solo se habilita con conexion `live` y cuando `capabilities.commands` anuncia `/api/tracking/correct`. El `OperatorId` se captura como texto: **la HMI no autentica la identidad del operador**. Antes del uso operativo deben acordarse permisos, identidad y pruebas de commissioning con el equipo de planta.

Anunciar ese endpoint no demuestra por si solo soporte de `REMOVE`, porque ya existia para correcciones. Confirmar la version/implementacion del backend. Ver [procedimiento de prueba en servidor](manual-bundle-removal-commissioning.md). Esta HMI usa `REMOVE`, la operacion recomendada en el apendice; no agrega un selector `RETIRE`.

### Reposicionamiento manual de un bundle

El apartado 7 del apendice v0.39 documenta `POST /api/tracking/correct` con `{ TrackingId, OperatorId, Reason, CurrentZone }`, **sin Operation**. El panel **Tracked bundles** incluye busqueda por numero/TrackingId/zona y una accion **Reposition** independiente de **Remove from Tracking**. Requiere operador, motivo y una posicion distinta de la actual. `OperatorId` admite texto alfanumerico; no autentica al usuario.

Las posiciones se obtienen de `map.Zones` con `IsEnabled: true` y nombre no ambiguo. No se usa el catalogo QMOS Destination ni una lista fija del dibujo. Las LCH ocultas en el diagrama siguen siendo candidatas si el backend las mantiene habilitadas. Se muestran ocupacion reportada y capacidad configurada como informacion, no como permiso o interlock.

La confirmacion identifica TrackingId, origen, destino y ocupacion reportada. Despues se revalidan los datos frescos: un cambio en la configuracion u ocupantes reportados del destino tambien cancela el envio. La HMI no inventa reglas de cruce de rutas, capacidad, buffer o HEAD/TAIL: su validacion atomica corresponde al backend. Entre GET y POST existe una ventana de concurrencia; el contrato no proporciona version esperada/ETag ni llave de idempotencia para cerrarla desde el cliente.

El cliente `repositionBundle` y el proxy solo envian los cuatro campos documentados. El proxy rechaza reposiciones con `Operation` o `MillOrder1` mezclados, sin reinterpretarlas como otra correccion. Tras el acuse verifica que una consulta posterior al comando reporte el mismo TrackingId en `CurrentZone` igual al destino; un HTTP 202 solo deja el comando pendiente. No se modifica el estado local de forma optimista ni se dibuja un movimiento simulado como confirmacion.

Esta funcionalidad corrige tracking L2; no es una orden de movimiento de maquinaria. Las pruebas de simulador no validan reglas, PLC ni auditoria reales. Ver [comisionamiento de reposicionamiento](manual-bundle-reposition-commissioning.md) antes de habilitar uso operativo.

## Operaciones fuera de alcance

El proxy admite `PUT /api/tracking/mill-order`, limitado a `millOrder`; `PUT /api/tracking/destination`, limitado a `destinationId`; y `PUT /api/tracking/printer`, limitado a `PrinterId`. `POST /api/tracking/correct` admite tres cuerpos independientes: correccion de orden (`TrackingId`, `OperatorId`, `Reason`, `MillOrder1`), retiro (`TrackingId`, `Operation: "REMOVE"`, `OperatorId`, `Reason`) o reposicionamiento (`TrackingId`, `OperatorId`, `Reason`, `CurrentZone`). Los comandos exigen `Content-Type: application/json`. Se eliminan propiedades ajenas; mezclar `CurrentZone` y `MillOrder1` se rechaza en vez de elegir implicitamente una operacion. Siguen fuera de alcance:

- `POST /api/tracking/reset`
- `POST /api/tracking/opc/write`
- `POST /api/tracking/event`
- cualquier operacion `POST` bajo `/api/qmos/*`, incluidas creacion, actualizacion de peso e impresion

Que `/api/tracking/capabilities` anuncie una operacion no significa que el usuario este autorizado para ejecutarla. La identidad enviada en `OperatorId` es dato proporcionado por el cliente hasta que se vincule a una identidad autenticada en el servidor. El despliegue debe acordar autenticacion, permisos, confirmacion del operador, idempotencia, auditoria y comportamiento ante timeout.

La respuesta `accepted: true` de una correccion individual confirma que el evento fue encolado, no que el cambio ya aparezca en el bundle. El cliente tecnico debe volver a consultar el bundle hasta observar `MillOrder1`, y verificar estado o eventos antes de reintentar tras un timeout para evitar comandos duplicados.

## Proxy, HTTP y seguridad

Una respuesta exitosa en Postman, navegacion directa o `curl` no garantiza que Chrome permita un `fetch` entre puertos o redes diferentes. Por eso el HMI utiliza el proxy de mismo origen `/tracking-api`.

El proxy mantiene listas explicitas por metodo. Solicitudes GET fuera de las lecturas aprobadas, solicitudes POST distintas de `/api/tracking/correct` y solicitudes PUT distintas de las tres selecciones globales reciben 404.

El salto entre el navegador y Next.js debe usar el protocolo aprobado para el HMI. Next.js puede comunicarse internamente por HTTP con el servicio dentro de la red controlada, sujeto a la arquitectura de produccion que se acuerde.

## Verificacion minima

Antes de considerar validada la conexion live, comprueba que:

- las lecturas principales responden a traves de `/tracking-api`;
- la consulta de Mill Orders respeta el limite solicitado;
- el catalogo de bundle locations permite buscar por descripcion e ID;
- el catalogo de impresoras muestra los IDs y nombres enviados por QMOS;
- los `GET` de Mill Order, Destination e impresora coinciden con las selecciones almacenadas por Tracking;
- cada `PUT` autorizado puede confirmarse con su `GET` posterior;
- `PUT /api/tracking/printer` rechaza IDs inexistentes sin cambiar la impresora activa;
- la orden nueva solo se aplica a QMOS CREATE posteriores y no modifica bundles existentes;
- la impresora global se usa en `PRINT_NEXT` posteriores salvo que una regla tenga `PrinterId` explicito;
- la bascula muestra el `Weight` del bundle ubicado en `SGRT2`, sin inventar un valor o una unidad cuando falte;
- las zonas `LCH1A/B` y `LCH2A/B` siguen disponibles como datos de Tracking aunque no se dibujen en Plant Overview ni Bay 2;
- el retiro manual envia el `TrackingId` del bundle seleccionado, requiere operador, motivo y confirmacion, y no usa reset global;
- una aceptacion de retiro no se presenta como finalizada hasta que un GET iniciado despues del acuse ya no muestra ese `TrackingId`;
- reposicionar envia `CurrentZone` sin `Operation` y solo muestra el resultado cuando un GET posterior reporta la posicion solicitada;
- cancelar, campos vacios, destino igual al origen y cambios detectados durante la confirmacion no envian comandos;
- `CCH1A/B` y `CCH2A/B` muestran hasta cinco IDs completos antes de requerir desplazamiento vertical, sin ocultar bundles adicionales del contador;
- cada bucle de lectura de `/api/tracking/state` evita solapar sus propias solicitudes; prevalidacion y verificacion manual agregan lecturas al polling normal;
- al detener la API se muestra un estado stale/offline y no aparecen datos mock;
- al levantar nuevamente la API el polling se recupera;
- cambiar `.env.local` requiere reiniciar el servidor de desarrollo;
- ningun secreto aparece en el bundle del navegador o el repositorio.

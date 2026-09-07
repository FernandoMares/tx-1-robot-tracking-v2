# Integracion de solo lectura con Tracking API

Para probar el flujo completo sin acceso al servidor, consulta [Simulador local de Tracking API](./tracking-api-simulator.md).

Esta primera integracion permite conectar el frontend con la API de tracking sin habilitar operaciones que modifiquen el estado del proceso. El modo predeterminado sigue siendo `mock`, de modo que clonar y ejecutar el proyecto no genera trafico hacia el entorno de pruebas.

## Arquitectura elegida

El navegador consulta una ruta del mismo frontend. Next.js reenvia exclusivamente los endpoints GET aprobados hacia el servicio:

```text
Navegador -> /tracking-api -> proxy GET de Next.js -> MaterialTrackingService :8085
```

Esto evita que el navegador necesite acceso directo al puerto 8085 y elimina bloqueos de CORS, contenido mixto o permisos de red local durante las pruebas. El proxy usa una lista permitida y no expone los endpoints POST del backend.

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

La capa inicial utiliza exclusivamente estas operaciones `GET`:

| Endpoint | Uso | Frecuencia esperada |
| --- | --- | --- |
| `/api/tracking/status` | Salud basica, escenario y version reportada por el servicio. | Al iniciar. |
| `/api/tracking/capabilities` | Capacidades publicadas por la compilacion activa. | Al iniciar. |
| `/api/tracking/map` | Catalogo de zonas, rutas, destinos y reglas. | Al iniciar. |
| `/api/tracking/state` | Estado actual de los bundles. | Polling, inicialmente cada segundo. |

La version devuelta en `apiVersion` se conserva como dato diagnostico. De acuerdo con el equipo de backend, sus cambios actuales corresponden a distintas compilaciones y no a cambios del contrato, por lo que no se debe codificar una comparacion rigida contra un unico valor como `0.12`.

Otros endpoints de lectura ya observados, como bundle individual, eventos, OPC y estado de QMOS, quedan para incrementos posteriores. No son necesarios para conectar la primera vista al estado central.

## Operaciones fuera de alcance

Esta entrega es deliberadamente **GET-only**. No se llaman ni se exponen controles para:

- `POST /api/tracking/correct`
- `POST /api/tracking/reset`
- `POST /api/tracking/opc/write`
- `POST /api/tracking/event`
- cualquier operacion `POST` bajo `/api/qmos/*`, incluidas creacion, actualizacion de peso e impresion

Que `/api/tracking/capabilities` anuncie una operacion no significa que el usuario este autorizado para ejecutarla. Antes de incorporar cualquier comando se deben acordar autenticacion, permisos, confirmacion del operador, idempotencia, auditoria y comportamiento ante timeout.

## Proxy, HTTP y seguridad

Una respuesta exitosa en Postman, navegacion directa o `curl` no garantiza que Chrome permita un `fetch` entre puertos o redes diferentes. Por eso el HMI utiliza el proxy de mismo origen `/tracking-api`.

El proxy solo implementa `GET` y mantiene una lista explicita de rutas. Solicitudes hacia otros paths reciben 404 y Next.js no publica manejadores POST en esa ruta.

El salto entre el navegador y Next.js debe usar el protocolo aprobado para el HMI. Next.js puede comunicarse internamente por HTTP con el servicio dentro de la red controlada, sujeto a la arquitectura de produccion que se acuerde.

## Verificacion minima

Antes de considerar validada la conexion live, comprueba que:

- las cuatro solicitudes `GET` responden a traves de `/tracking-api`;
- `/api/tracking/state` se consulta sin solicitudes solapadas;
- al detener la API se muestra un estado stale/offline y no aparecen datos mock;
- al levantar nuevamente la API el polling se recupera;
- cambiar `.env.local` requiere reiniciar el servidor de desarrollo;
- ningun secreto aparece en el bundle del navegador o el repositorio.

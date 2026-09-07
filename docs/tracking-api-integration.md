# Integracion de solo lectura con Tracking API

Esta primera integracion permite conectar el frontend con la API de tracking sin habilitar operaciones que modifiquen el estado del proceso. El modo predeterminado sigue siendo `mock`, de modo que clonar y ejecutar el proyecto no genera trafico hacia el entorno de pruebas.

## Arquitectura elegida para las pruebas

Durante esta etapa, el navegador consulta la API directamente:

```text
Navegador dentro del RDP -> http://localhost:8085 -> MaterialTrackingService
```

Esta arquitectura es adecuada para validar la lectura en el entorno de pruebas porque el frontend y el servicio pueden ejecutarse en la misma maquina remota. No implica que sea la arquitectura definitiva de produccion. Para produccion se debe decidir entre acceso directo con HTTPS y CORS restringido, o un reverse proxy/API route de mismo origen.

El acceso por RDP no crea por si mismo un tunel de red. Si el frontend se ejecuta en la computadora local y la API solo es accesible dentro del RDP, el navegador local no podra consultar `localhost:8085`: `localhost` siempre se refiere a la maquina donde corre el navegador.

## Configuracion

Copia `.env.example` como `.env.local` y cambia solamente los valores necesarios:

```powershell
Copy-Item -LiteralPath .env.example -Destination .env.local
```

| Variable | Valor de ejemplo | Funcion |
| --- | --- | --- |
| `NEXT_PUBLIC_PLANT_DATA_MODE` | `mock` | Selecciona `mock` o `live`. |
| `NEXT_PUBLIC_TRACKING_API_URL` | `http://localhost:8085` | URL base que usara el navegador en modo `live`. |
| `NEXT_PUBLIC_TRACKING_POLL_MS` | `1000` | Intervalo normal entre lecturas de estado. |
| `NEXT_PUBLIC_TRACKING_STALE_MS` | `3500` | Tiempo sin una lectura exitosa antes de considerar viejos los datos. |
| `NEXT_PUBLIC_TRACKING_TIMEOUT_MS` | `4000` | Limite de tiempo de cada solicitud HTTP. |

Para activar datos reales en el entorno de pruebas:

```dotenv
NEXT_PUBLIC_PLANT_DATA_MODE=live
NEXT_PUBLIC_TRACKING_API_URL=http://localhost:8085
```

Las variables `NEXT_PUBLIC_*` quedan expuestas al navegador y normalmente se incorporan durante el build de Next.js. Nunca deben contener contrasenas, API keys ni tokens. Despues de modificarlas hay que reiniciar `pnpm dev`; para un despliegue hay que reconstruir la aplicacion con los valores del ambiente destino.

El modo `live` no debe caer silenciosamente a datos simulados cuando la API falle. Debe conservar, si existe, la ultima lectura valida y marcarla como desconectada o desactualizada. El modo `mock` debe identificarse como tal y no realizar solicitudes a la API.

## Como probar dentro del RDP

1. Clona o copia el repositorio dentro de la sesion RDP.
2. Confirma que el servicio responde desde esa misma sesion:

   ```powershell
   curl.exe -i --connect-timeout 3 --max-time 5 http://localhost:8085/api/tracking/status
   ```

3. Crea `.env.local`, configura `NEXT_PUBLIC_PLANT_DATA_MODE=live` y conserva `http://localhost:8085` si el servicio corre en la misma maquina.
4. Instala dependencias y arranca el frontend:

   ```powershell
   pnpm install
   pnpm dev
   ```

5. Abre `http://localhost:3000` en un navegador dentro del RDP y revisa tambien la pestaña Network de las herramientas de desarrollo.

Si la API corre en otro equipo, sustituye la URL por el host real solo despues de validar conectividad y firewall desde el RDP. La direccion configurada debe apuntar realmente a la maquina que hospeda el servicio.

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

## CORS, HTTP y seguridad

Los headers observados actualmente incluyen `Access-Control-Allow-Origin: *`, por lo que los `GET` simples deberian poder probarse directamente desde el navegador. Aun asi, una respuesta exitosa en Postman o `curl` no comprueba CORS; la validacion final debe hacerse desde el frontend abierto en un navegador.

Si despues se agregan credenciales o un header `Authorization`, backend tendra que ajustar CORS. Un origen comodin no debe combinarse con credenciales. Para produccion conviene permitir solo los origenes conocidos.

Una pagina servida por HTTPS puede ser bloqueada al intentar consultar una API HTTP por contenido mixto. En las pruebas dentro del RDP ambos servicios pueden usar HTTP. En produccion, la API debe publicarse por HTTPS o quedar detras de un proxy de mismo origen.

## Verificacion minima

Antes de considerar validada la conexion live, comprueba que:

- las cuatro solicitudes `GET` responden correctamente en el navegador;
- `/api/tracking/state` se consulta sin solicitudes solapadas;
- al detener la API se muestra un estado stale/offline y no aparecen datos mock;
- al levantar nuevamente la API el polling se recupera;
- cambiar `.env.local` requiere reiniciar el servidor de desarrollo;
- ningun secreto aparece en `.env.local`, el bundle del navegador o el repositorio.

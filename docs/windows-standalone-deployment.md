# Despliegue standalone en Windows

Este proyecto utiliza una ruta dinamica de Next.js como proxy hacia
`MaterialTrackingService`, por lo que no puede publicarse como HTML estatico.
El paquete standalone conserva un servidor Node minimo, pero excluye el
repositorio fuente, Git, las dependencias de desarrollo y `.env.local`.

## Generar el paquete

Desde la raiz del repositorio, ejecuta:

```powershell
pnpm package:windows
```

El comando fuerza los valores publicos de compilacion para el modo `live`,
ejecuta el build de produccion y genera:

```text
dist\tx1-tracking-windows\
dist\tx1-tracking-windows.zip
```

El ZIP contiene `server.js`, las dependencias minimas trazadas por Next.js,
`public`, `.next/static`, `start.cmd`, instrucciones y `RELEASE.txt` con el
commit utilizado para la compilacion.

## Instalar en el servidor

1. Copia `dist\tx1-tracking-windows.zip` al servidor.
2. Extraelo en una carpeta nueva y versionada. No reemplaces todavia la
   version anterior.
3. Confirma que Node.js y la API respondan:

   ```powershell
   node --version
   curl.exe -i http://localhost:8085/api/tracking/status
   ```

4. Deten la instancia anterior del Front para liberar el puerto 3000.
5. Ejecuta `start.cmd` desde la carpeta extraida.
6. Valida:

   ```powershell
   curl.exe -i http://localhost:3000/
   curl.exe -i http://localhost:3000/tracking-api/api/tracking/status
   ```

7. Abre `http://SERVER_IP:3000` desde la red autorizada y confirma tracking
   live, las 33 zonas y el flujo controlado de Mill Order.

El lanzador usa por defecto:

```text
TRACKING_API_PROXY_TARGET=http://localhost:8085
HOSTNAME=0.0.0.0
PORT=3000
```

Si David confirma otro endpoint para el servicio, configura
`TRACKING_API_PROXY_TARGET` en el entorno del proceso antes de iniciar. Esa
variable apunta al servicio HTTP; el Front nunca debe contener credenciales
de la base de datos de QMOS.

## Operacion sin una terminal abierta

El paquete no es un ejecutable nativo unico. Para operacion permanente,
registra `node server.js` como servicio de Windows o tarea de inicio, con:

- directorio de trabajo: la carpeta extraida;
- reinicio automatico ante fallas;
- cuenta de servicio con los permisos minimos;
- variables `TRACKING_API_PROXY_TARGET`, `HOSTNAME` y `PORT`;
- apertura de red limitada al segmento autorizado.

Las variables `NEXT_PUBLIC_*` ya quedaron incorporadas durante el build. Un
cambio en ellas requiere generar un paquete nuevo. Los cambios al destino
privado del proxy requieren, como minimo, reiniciar el proceso.

## Actualizacion y rollback

Genera cada version desde un commit conocido y conserva `RELEASE.txt`. Instala
la version nueva en otra carpeta, deten la anterior, inicia la nueva y ejecuta
las verificaciones. Si alguna falla, deten la nueva e inicia de nuevo la
carpeta de la version anterior.

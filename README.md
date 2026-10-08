# TX1 Tracking HMI — release integrado

Frontend de seguimiento de bundles para Texas 1 / Nucor. **Esta rama reúne FIFO, retiro manual y reposicionamiento en una sola aplicación**, además de Mill Order, Destination, impresora global, peso de SGRT2 y las cinco vistas de planta.

## Versión y alcance

Rama: `release/integrated-hmi`. Procedencia: FIFO `77f79bf` + operaciones manuales `5338300`, sobre la base común `600d20f`.

Las pruebas locales de integración ya se completaron: FIFO 8/8, retiro 4/4, reposicionamiento 4/4, prevalidación 7/7, casos combinados 2/2, TypeScript, build live y siete comprobaciones de navegador real contra simulador local. El commit final, la publicación y el despliegue deben registrarse al completarse. El destino operativo previsto es el **mismo puerto 3000**; incorporar código no reemplaza por sí mismo la aplicación que ya está corriendo. La última evidencia de servidor corresponde al release FIFO anterior y API 0.42.

| Incluido en este fuente | Comportamiento |
| --- | --- |
| Plant Overview, Stackers, Bundler, Bay 1, Bay 2 | Posiciones según `CurrentZone`; diagramas no controlan equipos |
| Selecciones globales | Mill Order, Destination e impresora con confirmación y GET posterior |
| Báscula | `Weight` de la zona exacta SGRT2; no calcula peso ni inventa unidad |
| Buffers CCH | Cinco filas y desplazamiento; LCH ocultas en las vistas acordadas, sin borrar datos |
| FIFO v0.42 | `LogicalBufferName` + `QueueSequence`, orden ascendente dentro de cada buffer |
| Remove from Tracking | POST `/api/tracking/correct`, `Operation: "REMOVE"`, identidad técnica, operador y motivo |
| Reposition | Mismo endpoint, `CurrentZone` destino y **sin Operation**, con revalidación y lectura posterior |

No se agrega un comando `MOVE`, botón `RETIRE`, reset global, escritura OPC ni impresión QMOS desde el HMI. Las acciones manuales requieren una prueba coordinada: pueden afectar Tracking y ocupación PLC, aunque no sean órdenes directas de movimiento de maquinaria.

## Por dónde empezar

- [Índice de documentación](docs/README.md).
- [Transferencia técnica del código](docs/handoff-session.md).
- [API y contratos](docs/tracking-api-integration.md).
- [Preguntas técnicas](docs/preguntas-tecnicas.md).
- [Demo y regresiones aisladas](docs/tracking-api-simulator.md).
- [Estado de versiones y pruebas pendientes](docs/estado-entrega.md).
- [Commissioning de retiro](docs/manual-bundle-removal-commissioning.md) y [reposicionamiento](docs/manual-bundle-reposition-commissioning.md).
- [Despliegue Windows](docs/windows-standalone-deployment.md) y [entrega a Git](docs/entrega-git.md).

Esta copia no incluye guion privado, notas personales ni credenciales. La guía de [servicio Windows](docs/windows-service.md) es referencia a un kit separado: **sus helpers no forman parte de esta rama**.

## Arquitectura

```text
Navegador: Dashboard → usePlantState → useTrackingApi → TrackingApiClient
    → servidor Next: /tracking-api/[...path]
    → MaterialTrackingService → integraciones QMOS / L2 / PLC / equipos
```

Cada navegador tiene su polling de estado; los paneles de selección y verificación manual realizan lecturas adicionales. El cliente valida JSON en ejecución. Ante falla conserva la última lectura válida, comunica antigüedad y no cambia silenciosamente a datos ficticios.

`CurrentZone` determina la tarjeta. FIFO solo ordena integrantes del mismo buffer lógico dentro de esa tarjeta, sin moverlos de zona. El listado general **Tracked bundles** no se ordena por FIFO.

## Desarrollo y demo segura

Versiones de referencia ensayadas anteriormente: Node Windows x64 **24.21.0**, pnpm **10.34.5**, Next **16.3.0**, React **19.2.4**, TypeScript **5.7.3**. El lockfile fija la resolución; `package.json` aún no declara `engines` ni `packageManager`. Next instalado exige Node >=20.9.0, mínimo técnico que no acredita soporte vigente.

En una copia de desarrollo, no sobre el directorio que ejecuta producción:

```powershell
node --version
pnpm --version
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Falló la instalación; no continuar.' }
if (-not (Test-Path -LiteralPath '.env.local')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env.local'
}
pnpm dev
```

El ejemplo de entorno usa mock; no consulta planta. Para probar contratos y botones, seguir [Simulador](docs/tracking-api-simulator.md): backend ficticio en loopback 18085 y HMI de demostración 3100. Confirmar escenario tanto directo como por proxy antes de cualquier PUT/POST. Otro puerto de frontend conectado al mismo backend real **no aísla** el efecto.

Instalar dependencias requiere registros de paquetes; el build con `next/font/google` puede necesitar descargar fuentes. Después las fuentes se sirven desde la compilación.

## Configuración

| Variable | Uso |
| --- | --- |
| `NEXT_PUBLIC_PLANT_DATA_MODE` | mock/live incorporado al cliente durante build |
| `NEXT_PUBLIC_TRACKING_API_URL` | Habitualmente `/tracking-api` del mismo origen |
| `TRACKING_API_PROXY_TARGET` | Backend visto desde el servidor Node, configurable al arrancar |
| `NEXT_PUBLIC_TRACKING_POLL_MS` | Espera normal posterior a la solicitud: referencia 1000 ms |
| `NEXT_PUBLIC_TRACKING_STALE_MS` | Sin recepción válida: referencia 3500 ms |
| `NEXT_PUBLIC_TRACKING_TIMEOUT_MS` | Timeout del HMI: referencia 4000 ms |
| `PORT` | Puerto de ejecución; operativo previsto 3000 |
| `HOSTNAME` | Bind de Node; este `start.cmd` legacy siempre lo fija a 0.0.0.0 |

`localhost` en el target es el servidor HMI, no cada estación. Cambiar variables públicas requiere rebuild; cambiar target/puerto requiere aplicar entorno y reiniciar el proceso correcto. No guardar secretos en variables públicas ni entregar `.env.local`.

## Pruebas antes de publicar

Desde la raíz de esta copia, con dependencias instaladas:

```powershell
node scripts/test-fifo-ordering.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló FIFO.' }
node scripts/test-manual-removal.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló retiro manual.' }
node scripts/test-manual-reposition.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló reposicionamiento.' }
node scripts/test-manual-position.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló prevalidación manual.' }
node scripts/test-integrated-tracking.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló integración FIFO/manual.' }
pnpm typecheck
if ($LASTEXITCODE -ne 0) { throw 'Falló TypeScript.' }
$env:NEXT_PUBLIC_PLANT_DATA_MODE = 'live'
$env:NEXT_PUBLIC_TRACKING_API_URL = '/tracking-api'
pnpm build
if ($LASTEXITCODE -ne 0) { throw 'Falló el build.' }
```

La regresión UI adicional `scripts/test-manual-actions-ui.mjs` requiere Node 22 o posterior, navegador Chromium local y el standalone live generado por el bloque anterior: revisar su configuración antes de ejecutarla. Usa procesos propios en loopback; no necesita abrir ni cambiar la instancia de planta. Las pruebas de simulador no certifican efectos PLC, persistencia SQL ni aceptación en planta. El script heredado `lint` carece de configuración/dependencia ESLint funcional; no declararlo aprobado.

## Empaquetar y ejecutar

Esta rama conserva el **empaquetador legacy**, no el ampliado del kit histórico. Usa `pnpm package:windows`, sin `-SourceVersion` ni `-PackageName`, y puede reemplazar sus salidas fijas `dist/tx1-tracking-windows` y ZIP. Empaquetar en un checkout aislado del commit final, conservar el release anterior y no ejecutar el script sobre la única copia o la carpeta desde la que corre producción.

El standalone requiere Windows/Node compatibles, no pnpm, Git ni editor. El receptor debe verificar `RELEASE.txt`, hash y procedencia; un SHA de Git no acredita cambios locales sin commit.

Desde el paquete aprobado, solo con puerto libre y durante el cambio coordinado:

```powershell
$env:TRACKING_API_PROXY_TARGET = 'http://localhost:8085'
$env:PORT = '3000'
.\start.cmd
```

Este ejemplo apunta al Tracking de esa máquina, **no a una demo aislada**. Mantener la consola abierta. No detener todos los Node ni la API de 8085. El procedimiento de cambio de versión y rollback está en [Despliegue Windows](docs/windows-standalone-deployment.md). Arranque permanente/servicio es una integración separada; los helpers de otro kit no están incluidos.

## Seguridad y pendientes reales

- Allowlist no es autenticación: no hay login, roles ni terminación TLS propios.
- `OperatorId` es texto de auditoría, no identidad autenticada ni necesariamente numérica.
- HTTP 202/accepted confirma recepción, no ejecución. El panel observa ausencia del bundle o zona destino mediante GET nuevo; no reintenta POST automáticamente.
- El bloqueo manual es local al panel montado, no una transacción con PLC ni bloqueo multiusuario; no sobrevive a recargar la página.
- Mill Order y Destination usan dos PUT independientes, no una transacción atómica.
- Seleccionar impresora no imprime; persistencia, reglas y operación corresponden al backend.
- El caso FIFO real revisado devolvió membresía/secuencia null. Se necesita una muestra válida antes de aceptar el orden en planta.
- El retiro histórico obtuvo 202/evento134331, pero su resultado no quedó confirmado; no repetir ese comando para forzar una respuesta.
- El layout conserva Analytics en producción; revisión de telemetría y red según política de IT.
- Combinar las funciones no cierra esos pendientes; registrar prueba, responsable y resultado en [Estado de entrega](docs/estado-entrega.md).

Los ZIP históricos del 1 de octubre no se actualizan al modificar este fuente o sus guías. Entregar código y runtime del mismo commit integrado aprobado, sin mezclar artefactos de ramas anteriores.

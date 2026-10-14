# TX1 Tracking HMI — release integrado

Frontend de seguimiento de bundles para Texas 1 / Nucor. **Esta rama reúne FIFO, retiro manual y reposicionamiento en una sola aplicación**, además de Mill Order, Destination, impresora global, peso de SGRT2 y las cinco vistas de planta.

## Versión y alcance

Rama: `release/integrated-hmi`. Última base funcional desplegada documentada: **`7fc34e863ed0a9b12e955ae28a224996e84fd011`**. Checkpoint anterior de documentación: `c7df85a`. Este checkpoint de fuente del **13 de octubre de 2026** reúne el filtro de removidos, la confirmación de retiro retenido y el reset de mantenimiento del día 9, más Bundler reutilizando el Overview sin la rama Stackers/STRT/LFRT. El identificador exacto se consulta con `git log -1 --oneline`; guardar/publicar el fuente no actualiza el servidor ni los ZIP existentes. Estos ajustes siguen pendientes de empaquetado, despliegue y validación en planta. Procedencia funcional: FIFO `77f79bf` + operaciones manuales `5338300`, sobre `600d20f`.

El checkpoint anterior está guardado/publicado como `90c849c`. Este nuevo checkpoint de fuente añade una pestaña **Stacker** (singular), independiente de **Stackers** (plural), que conserva su vista anterior. El cambio Stacker no forma parte de `90c849c` ni del paquete instalado; guardar/publicar Git no equivale a desplegarlo.

La base funcional `7fc34e8` se publicó y desplegó en el servidor sobre el **puerto 3000**, contra Tracking 8085/API 0.42. Sus verificaciones locales previas fueron FIFO 8/8, retiro 4/4, reposicionamiento 4/4, prevalidación 7/7, integración 2/2, TypeScript, build live y siete comprobaciones de navegador. No equivalen a aceptación física de planta ni validan los nuevos cambios de trabajo.

**Hallazgo histórico y ajuste local:** el evento REMOVE **154605** dejó un registro `REMOVED` sin zona ni posiciones ocupadas. En `7fc34e8` la HMI seguía pendiente al exigir ausencia completa. El código de trabajo ahora oculta `REMOVED` de vistas activas y acepta ausencia o un único registro del mismo escenario con `REMOVED`, `CurrentZone: null` y `OccupiedZones: []`. Conserva el snapshot completo para verificar comandos; no acredita efectos PLC. Ver [evidencia y pendientes](docs/estado-entrega.md).

| Incluido en este fuente | Comportamiento |
| --- | --- |
| Plant Overview, Stackers, Stacker, Bundler, Bay 1, Bay 2 | Posiciones según `CurrentZone`; diagramas no controlan equipos |
| Tab Stacker (singular) | Nueva vista del Overview limitada a ERT, STRT, LFRT, SGRT1/2, NCCT1/2 y báscula SGRT2; sin Bundler, RTTY, IMRT ni secciones Bay 2. Stackers (plural) conserva su pantalla anterior |
| Tab Bundler | Mismo layout del Overview, sin ERT1A/B, ERT2C/D, STRT1/2 ni LFRT1/2/3; conserva báscula, SGRT/NCCT, buffers y Robot 2. Overview permanece completo |
| Selecciones globales | Mill Order, Destination e impresora con confirmación y GET posterior |
| Báscula | `Weight` de la zona exacta SGRT2; no calcula peso ni inventa unidad |
| Buffers CCH | Cinco filas y desplazamiento; LCH ocultas en las vistas acordadas, sin borrar datos |
| FIFO v0.42 | `LogicalBufferName` + `QueueSequence`, orden ascendente dentro de cada buffer |
| Remove from Tracking | POST `/api/tracking/correct`, `Operation: "REMOVE"`, identidad técnica, operador y motivo |
| Reposition | Mismo endpoint, `CurrentZone` destino y **sin Operation**, con revalidación y lectura posterior |
| Bundles removidos | Fuera de listas, diagramas, peso y contadores activos; snapshot original conservado |
| Reset de mantenimiento | POST `/api/tracking/reset` sin cuerpo, confirmación global explícita, preflight y verificación por GET; pendiente de commissioning |

No se agrega un comando `MOVE`, botón `RETIRE`, escritura OPC ni impresión QMOS desde el HMI. El reset global se incorpora como acción separada de mantenimiento, no como alternativa a retirar un bundle ni como recuperación de un comando incierto. Toda escritura requiere coordinación con operación.

**Operator ID y comentarios:** ocultar Operator ID y hacer comentarios opcionales **sigue pendiente**. v0.39, sección 4, exige `OperatorId` y `Reason` para **REMOVE**; el contrato base v0.6, sección 5.8, exige operador para correcciones. No hay evidencia de que Reason sea obligatorio por contrato en todas las variantes: en reposicionamiento aparece en el ejemplo. La implementación actual exige ambos en los tres caminos de `/correct`; se conserva así hasta acordar el cambio con backend, sin operador ficticio ni motivo automático. Reset no lleva esos campos.

## Por dónde empezar

- **Capacitación sobre el servidor:** [arquitectura y recorrido técnico del código](docs/handoff-session.md).
- **Ubicar código:** [mapa por carpetas, archivos y funciones](docs/mapa-codigo.md).
- [Índice de documentación](docs/README.md).
- [Transferencia técnica del código](docs/handoff-session.md).
- [API y contratos](docs/tracking-api-integration.md).
- [Preguntas técnicas](docs/preguntas-tecnicas.md).
- [Regresiones aisladas, referencia de desarrollo fuera de la sesión](docs/tracking-api-simulator.md).
- [Estado de versiones y pruebas pendientes](docs/estado-entrega.md).
- [Commissioning de retiro](docs/manual-bundle-removal-commissioning.md) y [reposicionamiento](docs/manual-bundle-reposition-commissioning.md).
- [Commissioning de reset global](docs/tracking-reset-commissioning.md): alcance, confirmación, evidencia y límites.
- [Despliegue Windows](docs/windows-standalone-deployment.md) y [entrega a Git](docs/entrega-git.md).

Mapa, manual y referencias de API son documentación para quienes mantienen el fuente. El guion y la chuleta personales se conservan localmente y están excluidos de Git; no son necesarios para consultar esta documentación. Revisar qué documentos se entregan al cliente antes de exportar: las guías no contienen credenciales, pero no debe agregarse toda la carpeta de trabajo indiscriminadamente. **Los helpers de servicio de otro kit no forman parte de esta rama**.

## Abrir el proyecto en el servidor para el training

```text
Fuente: C:\Users\ven.f.garciamares\Projects\tx1-integrated-release-7fc34e8
Runtime: esa carpeta\dist\tx1-tracking-windows
HMI: http://127.0.0.1:3000
Tracking: http://localhost:8085
```

Abrir el **fuente**, no los archivos compilados del runtime. Comprobar `git log -1 --oneline`, `git status` y `RELEASE.txt`; no arrancar otra HMI ni recompilar para explicar el código. La guía de capacitación usa el servidor y respuestas reales, **sin simulador**. Las escrituras por botones se prueban únicamente con valores/bundle acordados con operación.

## Arquitectura

```text
Navegador: Dashboard → usePlantState → useTrackingApi → TrackingApiClient
    → servidor Next: /tracking-api/[...path]
    → MaterialTrackingService → integraciones QMOS / L2 / PLC / equipos
```

Cada navegador tiene su polling de estado; los paneles de selección y verificación manual realizan lecturas adicionales. El cliente valida JSON en ejecución. Ante falla conserva la última lectura válida, comunica antigüedad y no cambia silenciosamente a datos ficticios.

`CurrentZone` determina la tarjeta. FIFO solo ordena integrantes del mismo buffer lógico dentro de esa tarjeta, sin moverlos de zona. El listado general **Tracked bundles** no se ordena por FIFO.

## Desarrollo en otra copia — no es el procedimiento de la sesión

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

El ejemplo de entorno usa mock; no consulta planta. Es un modo disponible para desarrollo, no el utilizado en esta capacitación. La referencia de regresiones aisladas se conserva para mantenimiento, pero el [recorrido técnico](docs/handoff-session.md) sigue la aplicación real de 3000. Otro puerto de frontend conectado al mismo backend real no aísla sus efectos.

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
| `PORT` | Puerto de ejecución; operativo 3000 |
| `HOSTNAME` | Bind de Node; este `start.cmd` legacy siempre lo fija a 0.0.0.0 |

`localhost` en el target es el servidor HMI, no cada estación. Cambiar variables públicas requiere rebuild; cambiar target/puerto requiere aplicar entorno y reiniciar el proceso correcto. No guardar secretos en variables públicas ni entregar `.env.local`.

## Pruebas antes de publicar

En una copia preparada para desarrollo, con dependencias instaladas; no ejecutar este bloque sobre el release activo durante el training:

```powershell
node scripts/test-fifo-ordering.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló FIFO.' }
node scripts/test-manual-removal.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló retiro manual.' }
node scripts/test-manual-reposition.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló reposicionamiento.' }
node scripts/test-manual-position.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló prevalidación manual.' }
node scripts/test-bundle-lifecycle.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló ciclo de vida de bundles.' }
node scripts/test-tracking-reset.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló contrato de reset.' }
node scripts/test-tracking-reset-state.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló verificación de estado de reset.' }
node scripts/test-integrated-tracking.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló integración FIFO/manual.' }
node scripts/test-bundler-layout.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló layout Bundler/Overview.' }
node scripts/test-stacker-layout.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló layout Stacker o preservación de Stackers.' }
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
- HTTP 202/accepted confirma recepción, no ejecución. REMOVE admite ausencia o registro REMOVED único, del mismo escenario y sin ninguna posición reportada; Reposition exige coincidencia activa en destino. El reset también verifica con GET y no trata un estado inicialmente vacío como prueba suficiente. Ninguna escritura se reintenta automáticamente.
- El bloqueo local se comparte entre acciones manuales y reset en el Dashboard montado. No es autenticación, transacción PLC ni bloqueo multiusuario; no sobrevive a recargar la página.
- Mill Order y Destination usan dos PUT independientes, no una transacción atómica.
- Seleccionar impresora no imprime; persistencia, reglas y operación corresponden al backend.
- El caso FIFO real revisado devolvió membresía/secuencia null. Se necesita una muestra válida antes de aceptar el orden en planta.
- El evento histórico 154605 sí tiene evidencia de REMOVED y huella vacía; la UI de `7fc34e8` quedó pendiente. El ajuste local aún requiere desplegarse y validarse. El evento anterior 134331 correspondía a otro bundle y no quedó confirmado. No repetir ninguno para forzar una respuesta.
- El layout conserva Analytics en producción; revisión de telemetría y red según política de IT.
- Combinar las funciones no cierra esos pendientes; registrar prueba, responsable y resultado en [Estado de entrega](docs/estado-entrega.md).

Los ZIP históricos del 1 de octubre no se actualizan al modificar este fuente o sus guías. Entregar código y runtime del mismo commit integrado aprobado, sin mezclar artefactos de ramas anteriores.

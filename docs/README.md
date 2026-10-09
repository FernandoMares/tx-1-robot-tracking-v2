# Documentación TX1 — versión integrada

Este fuente reúne **FIFO + retiro REMOVE + reposicionamiento manual**, junto con las selecciones globales, diagramas y peso de SGRT2. Rama: `release/integrated-hmi`, código `7fc34e8`. La capacitación se realiza sobre el servidor **3000 → 8085**, sin simulador. La inclusión de una función no equivale a su aceptación en planta: consultar [estado de entrega](estado-entrega.md).

## Empieza aquí

1. [Transferencia técnica](handoff-session.md): arquitectura, archivos y funciones que revisar, con el recorrido de datos de la API real.
2. [Mapa de código](mapa-codigo.md): estructura, responsabilidades y lugares donde implementar cambios.
3. [Preguntas técnicas](preguntas-tecnicas.md): respuestas y límites de la implementación.

## Para mantenimiento y capacitación

| Necesidad | Guía |
| --- | --- |
| Localizar carpetas, funciones, imports y consumidores | [Mapa de código](mapa-codigo.md) |
| Arquitectura, carpetas y recorrido API → tarjeta | [Transferencia técnica](handoff-session.md) |
| Respuestas específicas y límites del sistema | [Preguntas técnicas](preguntas-tecnicas.md) |
| Endpoints, casing, DTO y validación | [Integración API](tracking-api-integration.md) |
| Regresiones aisladas para desarrollo, fuera de esta capacitación | [Simulador HTTP](tracking-api-simulator.md) |
| Validar retiro sin confundir Accepted con ejecución | [Commissioning de retiro](manual-bundle-removal-commissioning.md) |
| Validar corrección de posición registrada | [Commissioning de reposicionamiento](manual-bundle-reposition-commissioning.md) |

## Para instalación y transferencia

| Necesidad | Guía |
| --- | --- |
| Versiones, evidencia y pendientes reales | [Estado de entrega](estado-entrega.md) |
| Empaquetador legacy, puerto 3000, cambio de release y rollback | [Despliegue Windows](windows-standalone-deployment.md) |
| Identificar proceso/servicio actual y planificar continuidad; sin helpers incluidos | [Servicio Windows](windows-service.md) |
| Exportar una copia limpia e importarla al repositorio corporativo | [Entrega Git](entrega-git.md) |

Mapa de código, manual y referencias son documentación de mantenimiento. El apoyo personal del presentador se conserva localmente, fuera de Git, y no es necesario para seguir estas guías. Al exportar el fuente corporativo, no agregar notas privadas, credenciales, paquetes anteriores o perfiles de navegador.

## Convenciones

- **Esta versión integrada** significa esta rama; `600d20f`, `77f79bf` y `5338300` son antecedentes cuando se describen como historia.
- **Solo lectura** significa GET o inspección; no modifica selecciones ni ocupación.
- **Solo simulador** requiere identificar `MaterialTrackingServiceSimulator` y `LOCAL_HMI_SIMULATOR` directa y vía proxy. Otro puerto de frontend no aísla planta.
- **Pendiente de commissioning** significa que no se ha acreditado el resultado real.
- Pegar solo el contenido de bloques PowerShell, sin `PS>`, `>>` ni cercas Markdown.
- Marcadores de rutas, hosts o repositorios deben completarse con valores aprobados.
- Actualizar documentación no regenera ZIPs ni instala servicios.

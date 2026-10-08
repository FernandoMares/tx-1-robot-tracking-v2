# Documentación TX1 — versión integrada

Este fuente reúne **FIFO + retiro REMOVE + reposicionamiento manual**, junto con las selecciones globales, diagramas y peso de SGRT2. Rama: `release/integrated-hmi`. La inclusión de una función no equivale a su aceptación en planta: consultar [estado de entrega](estado-entrega.md).

## Para mantenimiento y capacitación

| Necesidad | Guía |
| --- | --- |
| Arquitectura, carpetas y recorrido API → tarjeta | [Transferencia técnica](handoff-session.md) |
| Respuestas específicas y límites del sistema | [Preguntas técnicas](preguntas-tecnicas.md) |
| Endpoints, casing, DTO y validación | [Integración API](tracking-api-integration.md) |
| Demostración aislada de FIFO y acciones manuales | [Simulador HTTP](tracking-api-simulator.md) |
| Validar retiro sin confundir Accepted con ejecución | [Commissioning de retiro](manual-bundle-removal-commissioning.md) |
| Validar corrección de posición registrada | [Commissioning de reposicionamiento](manual-bundle-reposition-commissioning.md) |

## Para instalación y transferencia

| Necesidad | Guía |
| --- | --- |
| Versiones, evidencia y pendientes reales | [Estado de entrega](estado-entrega.md) |
| Empaquetador legacy, puerto 3000, cambio de release y rollback | [Despliegue Windows](windows-standalone-deployment.md) |
| Referencia de servicio del kit separado; helpers no incluidos aquí | [Servicio Windows](windows-service.md) |
| Exportar una copia limpia e importarla al repositorio corporativo | [Entrega Git](entrega-git.md) |

Las guías privadas del presentador no forman parte de esta copia compartible. No agregar notas personales, credenciales, paquetes anteriores o perfiles de navegador al producto.

## Convenciones

- **Esta versión integrada** significa esta rama; `600d20f`, `77f79bf` y `5338300` son antecedentes cuando se describen como historia.
- **Solo lectura** significa GET o inspección; no modifica selecciones ni ocupación.
- **Solo simulador** requiere identificar `MaterialTrackingServiceSimulator` y `LOCAL_HMI_SIMULATOR` directa y vía proxy. Otro puerto de frontend no aísla planta.
- **Pendiente de commissioning** significa que no se ha acreditado el resultado real.
- Pegar solo el contenido de bloques PowerShell, sin `PS>`, `>>` ni cercas Markdown.
- Marcadores de rutas, hosts o repositorios deben completarse con valores aprobados.
- Actualizar documentación no regenera ZIPs ni instala servicios.

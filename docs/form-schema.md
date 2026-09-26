# Formulario versionado

## Registro

| ID                                 | Versión | Fuente                                              | Secciones / preguntas principales |
| ---------------------------------- | ------- | --------------------------------------------------- | --------------------------------- |
| commercial-to-residential          | 0.1.0   | `schemas/common/change-use-base.json`               | 2 / 6                             |
| commercial-to-residential-zaragoza | 0.1.0   | Overlay histórico vacío + base histórica            | 2 / 6                             |
| commercial-to-residential          | 0.2.0   | `schemas/common/change-use-base.v0.2.0.json`        | 28 / 185                          |
| commercial-to-residential-zaragoza | 0.2.0   | Base común + `schemas/zaragoza/overlay.v0.2.0.json` | 28 / 186                          |

La base tiene además 13 subcampos de grupos repetibles (5 de hueco y 8 de estancia): 198 definiciones en total, 199 con Zaragoza. Hay 46 preguntas principales críticas y 57 obligatorias en el schema completo. Siete críticas/obligatorias del patio se ocultan si no se ha declarado que existe, por lo que el denominador visible cambia. Los subcampos obligatorios determinan si el grupo está completo, sin sumarse por separado al porcentaje principal.

La visita fija explícitamente el par ID/versión. No se reinterpretan respuestas 0.1.0 como 0.2.0. Los schemas publicados se conservan; cambios de significado requieren otra versión. Una versión desconocida muestra error y conserva la visita, sin aplicar silenciosamente la actual.

## Composición

`registry.ts` valida la base con Zod y aplica un overlay cuyo `extends` debe coincidir exactamente. El overlay contiene metadata, `overrides` por ID y `addFields` con un `section_id` existente. El de Zaragoza cambia ayuda de la consulta municipal y añade una pregunta sobre la información municipal recibida relativa a eje comercial/ordenanza. No duplica las 28 secciones ni contiene conclusiones jurídicas.

## Campos

Campos anidados en `sections[].fields`: su sección es inequívoca. IDs únicos, opciones y referencias se validan con `assertSchema`.

```json
{
  "id": "patio_width",
  "type": "measurement",
  "label": "Ancho del patio",
  "required": true,
  "critical": true,
  "unit": "m",
  "defaultSourceType": "observed",
  "validation": { "min": 0 },
  "visibleWhen": {
    "field": "patio_exists",
    "operator": "equals",
    "value": true
  }
}
```

`required` identifica datos obligatorios para documentar la visita; no impide guardar borradores. `critical` identifica comprobaciones que conviene intentar antes de salir. El progreso asigna peso 3 a críticos, 2 a obligatorios no críticos y 1 a opcionales visibles. Muestra además contadores separados. Ninguno equivale a cumplimiento normativo.

`description`, `placeholder`, `helpText`, `unit`, `inputMode`, `options`, `validation` (min, max, longitud, patrón) controlan UI/validación. Datos inválidos se conservan en el borrador pero no cuentan completos.

| Tipo                                     | JSON de respuesta                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| text / textarea                          | string                                                                   |
| number / measurement                     | number; unidad en el schema                                              |
| boolean                                  | true / false; null indica sin comprobar                                  |
| select                                   | valor de opción                                                          |
| multiselect / checklist                  | array de valores                                                         |
| checklist con itemDetails=severity_notes | array de `{code,severity,notes}`                                         |
| repeatable                               | array de objetos, cada subcampo usa su ID y cada fila nueva un `item_id` |
| photo / document                         | reservado, muestra indicación de función futura; no upload               |

No contestado: `null`. Arrays vacíos solo se generan por una elección explícita de ninguna/no aplica o al quitar los elementos. Una respuesta `false` o `0` es válida. Repeatable requiere los subcampos obligatorios de cada fila presente. Las estancias ofrecen filas iniciales editables para salón, dormitorios 1–3 y cocina; esos ejemplos no cuentan como respuestas hasta que se guardan.

Las fotos actuales son una checklist de tareas, no archivos. `requiresTape` es metadata de la opción que muestra “Requiere cinta métrica”. Las alertas las selecciona la persona, con gravedad low/medium/high/potential_blocker y notas; no las calcula la aplicación.

## Procedencia, evidencia y notas

`defaultSourceType` preselecciona observed, seller_claim, architect_check, municipal_check, documentary o unknown. La persona puede cambiarla en **Detalles**. Los tipos históricos declared/documented/measured se adaptan en memoria a seller_claim/documentary/observed sin editar el JSON histórico.

`verified` empieza siempre en false. Una medición no se marca verificada automáticamente. `seller_claim + false` conserva que lo afirmó el comercial sin acreditar. Las notas están por respuesta. En este incremento la procedencia/verificación del repeatable pertenece a la respuesta del grupo; la normalización posterior podrá ofrecer evidencia individual por hueco/medida.

## Condiciones y resumen

`visibleWhen`: `field`, operador equals/notEquals/includes y `value`. Solo controla visibilidad y progreso; nunca elimina la respuesta oculta. No se usa para autorización.

`autoFillFrom` ofrece copiar explícitamente un dato ya recogido. El resumen `summaryFields` deriva valores en vivo sin duplicarlos; añade notas manuales independientes. La sección final presenta contadores y última sincronización, sin finalizar ni analizar.

# Guardado local y sincronización

## Camino de escritura

UI → transacción IndexedDB → confirmación “Guardado en dispositivo” → cola de sincronización → Supabase → confirmación “Sincronizado”.

Se escribe en IndexedDB en cada cambio, incluidos textos. No hay debounce de guardado local que pueda perder los últimos caracteres al cerrar. El debounce de **red** es de 700 ms, con espera máxima de 4 segundos durante escritura continua. Los controles reaccionan de inmediato; hasta que se confirma la transacción aparece “Guardando”. Errores locales mantienen la edición visible, muestran que no está guardada y ofrecen reintento.

`answers.ts` fusiona cada respuesta en una transacción y mantiene un índice único `[visit_id+question_id]`. Cada edición incrementa `local_revision` y un timestamp monotónico por respuesta. Los guardados no cambian `status=draft` ni la versión de la visita.

## Dexie y recuperación

La base conserva el nombre `localvivienda`. Versión 1 intacta; versión 2 añade `localVisitAnswers` y `visitCursors`, sin borrar ni reconstruir stores existentes. Cada respuesta guarda los campos remotos más `sync_status`, `local_updated_at`, `local_revision`, `sync_error` y `pending_operation`.

Estados: synced, pending_create, pending_update, pending_delete, error. El tombstone local mantiene `pending_operation=delete` incluso si falla su envío; el pull no lo resucita. La UI normalmente vacía un valor mediante null o un array vacío; no hay botón para borrar arbitrariamente filas del servidor.

La ruta carga IndexedDB inmediatamente. La petición remota no bloquea la apertura. Cursor por visita/usuario recupera la sección. El inicio lista borradores para continuarlos. Auth puede usar su sesión ya almacenada para acceder a datos locales offline; ninguna credencial nueva ni sesión de otro usuario se inventa. Al volver la red se renueva la sesión por el SDK y se exige Auth/RLS para enviar datos.

## Disparadores

- Inicio de la app autenticada.
- Apertura de visita.
- Evento online.
- Cambios guardados, agrupados por debounce de red.
- Reintento periódico cada 30 segundos mientras la app está abierta.
- Botón Sincronizar.

Un único ciclo por usuario; una nueva solicitud mientras está activo agenda otra pasada. No hay servicio remoto permanente, CRDT ni requisito de sincronización en segundo plano con la PWA cerrada.

## Orden y errores

Primero properties, luego visits y después visit_answers. Solo se envían hijos con padre confirmado. Upsert por UUID para padres; upsert por `(visit_id,question_id)` para respuestas. Los listados remotos están paginados a 500 filas, para no podar erróneamente una caché al alcanzar el límite REST.

Cada confirmación compara la revisión enviada con la actual dentro de otra transacción. Si el usuario editó mientras llegaba la respuesta, se conserva su cambio pendiente. El pull no pisa datos pendientes o con error. Si desaparece remotamente una visita pero quedan respuestas locales pendientes, se conserva para recuperación y se muestra el error al sincronizar.

Una instantánea remota completa permite retirar de la caché filas previamente sincronizadas borradas en servidor. Si falla cualquier listado, se cancela esa reconciliación. No se descartan cambios locales para resolver un error de permisos, cuota o red.

## Conflictos

LWW por `updated_at` de la **edición**, generado por el dispositivo. `local_updated_at` replica ese tiempo. El trigger `private.visit_answer_lww` ignora actualizaciones con timestamp menor o igual al persistido, preservando ID, propietario, visita, pregunta y created_at. Así un reintento antiguo no sobrescribe una respuesta nueva. El upsert devuelve el valor aceptado para actualizar la réplica local.

No se aplica el trigger foundation de tiempo del servidor a respuestas: transformaría una edición offline antigua en una escritura aparentemente nueva. Quien escriba mediante la API debe incluir el timestamp de su edición; si hace UPDATE sin avanzar updated_at, el trigger conserva la versión anterior.

Limitación deliberada: MVP orientado a una persona y un dispositivo. Relojes desajustados entre dispositivos pueden determinar un ganador inesperado; no hay fusión campo a campo entre dispositivos ni historial de conflictos. Las actualizaciones de properties/visits siguen el protocolo previo y los timestamps de servidor; la UI del incremento crea esos registros y edita las respuestas.

## Estados visibles

| Mensaje                                 | Qué garantiza                                       |
| --------------------------------------- | --------------------------------------------------- |
| Guardando en dispositivo                | La transacción local está en curso                  |
| Guardado en dispositivo · puedes cerrar | Las ediciones de campos ya están en IndexedDB       |
| Sin conexión                            | Se sigue trabajando sobre datos locales             |
| Sincronizando                           | Hay un intento de intercambio con Supabase          |
| Sincronizado                            | No quedan registros locales pendientes en la cuenta |
| Error de sincronización                 | Persisten datos locales; reintentar el envío        |
| Error de guardado local                 | No cerrar: puede haber ediciones solo en memoria    |

La conservación depende del almacenamiento del navegador. No es una copia de seguridad contra borrado del sitio, pérdida del dispositivo, navegación privada o expulsión de almacenamiento por el sistema. El cierre definitivo del proceso antes de confirmarse una transacción no se declara seguro.

# Arquitectura del Incremento 2

## Infraestructura existente

React PWA/Vite en `apps/web`; tipos compartidos en `packages/domain`; motor del formulario en `packages/form-engine`; schemas JSON en `schemas`. Repo `jotakv/VisitasLocales`, rama `main`, Cloudflare Pages `localvivienda` (https://localvivienda.pages.dev), Supabase `cigsvuqbbehqaqlmcjbb` en `eu-west-1`.

La inspección inicial partió del HEAD real `6d8b57d01cb292d510c8b48c4643726f05da1feb`. Había cuatro visitas draft con schema común `0.1.0`, dos propiedades y tres perfiles. No se recreó infraestructura. También existía un check ajeno al Pages objetivo, `Workers Builds: visitaslocales`, que ya fallaba antes del incremento; no se ha alterado ese Worker.

## Límites de responsabilidad

| Operación   | Estado       | Responsabilidad                                                |
| ----------- | ------------ | -------------------------------------------------------------- |
| Guardar     | Implementada | Commit local de cada edición en IndexedDB                      |
| Sincronizar | Implementada | Réplica a la cuenta en Supabase, respetando dependencias y RLS |
| Finalizar   | Pendiente    | No hay cierre ni snapshot de visita                            |
| Exportar    | Pendiente    | No hay ZIP, visit.json, visit.md ni informes                   |
| Analizar    | Pendiente    | No hay IA, clasificación A/B/C/D ni reglas de viabilidad       |

Una respuesta completada es un dato recogido, no una comprobación de cumplimiento. `verified` conserva la evidencia declarada por la persona. Ningún umbral de altura, superficie, incendios o accesibilidad produce un veredicto.

## Datos

Se conservan `profiles`, `properties` y `visits`. `visit_answers` contiene UUID, visita, usuario, pregunta, sección, JSON, fuente, verificación, notas y timestamps. `UNIQUE(visit_id,question_id)` evita duplicados. Una FK compuesta `(visit_id,user_id)` referencia `visits(id,user_id)` y elimina respuestas en cascada. Cuatro políticas RLS combinan la identidad de la respuesta con la propiedad de la visita. `anon` no tiene acceso.

Las medidas simples son números con unidad en el schema. Huecos y estancias son arrays de objetos con IDs de campo estables; las alertas son objetos `{code,severity,notes}` dentro de un array. No se crean todavía tablas `measurements`, `openings`, `photos`, `documents` o `red_flags`.

## Interfaz

`/app/visits/:visitId` carga de Dexie y resuelve exactamente `schema_id + schema_version`. `Inspection` controla navegación y autosave; `FormEngine` interpreta campos/condiciones JSON; `FieldControl` representa tipos genéricos. El índice, progreso, resumen y pendientes se derivan del schema y las respuestas. RouterProvider permite advertir también al salir por navegación del navegador. No se bloquea una salida con críticos pendientes: existe **Salir igualmente**.

Dexie v2 añade dos stores, preservando íntegramente v1. `visitCursors` guarda la última sección solo en este dispositivo; `localVisitAnswers` es la réplica/cola de respuestas. Una identidad previamente autenticada puede recuperar los datos locales aunque su token haya caducado offline. Este caché no autoriza operaciones remotas; Supabase valida Auth y RLS.

## Seguridad y despliegue

Solo URL y clave pública de Supabase llegan al cliente. No hay service role, PAT ni secretos versionados. Buckets privados, sin nuevas políticas Storage. Los cambios se despliegan por la integración GitHub → Pages existente desde `main`; no se migró a Workers.

El advisor de Supabase ya avisaba de protección contra contraseñas filtradas desactivada. No se ha ampliado el plan ni activado un servicio de pago para cambiarlo.

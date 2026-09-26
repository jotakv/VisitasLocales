# Verificación del Incremento 2

Fecha: 26 de septiembre de 2026. Este registro distingue evidencia ejecutada de comprobaciones pendientes; compilar no basta para dar por probada una sesión de producción.

## Estado comprobado

- Repositorio `jotakv/VisitasLocales`, HEAD inicial real `6d8b57d01cb292d510c8b48c4643726f05da1feb`.
- Proyecto Supabase existente `cigsvuqbbehqaqlmcjbb`, `ACTIVE_HEALTHY`, `eu-west-1`.
- Migración nueva **aplicada** `20260926184303_visit_answers`; foundation `20260926142312` intacta.
- `visit_answers` real, RLS habilitado, cuatro políticas. Comprobados dos usuarios temporales bajo rol authenticated: SELECT/INSERT/UPDATE/DELETE, identidad falsa, visita ajena, CRUD propio, unicidad, LWW, JSON y cascada. Transacción revertida.
- Las cuatro visitas antiguas `0.1.0` permanecen; el formulario histórico no se ha modificado.
- Buckets visit-photos, property-documents y generated-reports privados.
- Formulario nuevo 0.2.0: 28 secciones, 185 preguntas comunes + 1 municipal Zaragoza, 46 críticas definidas; 13 subcampos repetibles adicionales.
- 37 tests automatizados pasan (schemas, controles, componentes de app, Dexie y sync con adaptador simulado).
- Lint, TypeScript y build pasan. Service worker y manifest generados.
- Prueba de componentes: propiedad → visita → evidencia → recarga simulada/reapertura → misma sección; índice, todas las 28 secciones, progreso y advertencia no bloqueante de salida.
- Pruebas de persistencia y sync: upgrade v1→v2 sin pérdida, offline, cierre/reapertura DB, reconexión, cambios concurrentes durante envío, errores, eliminación pendiente, LWW y ausencia de duplicados.

## Producción y limitaciones de la verificación

El despliegue inicial de Cloudflare Pages `41506305-bf06-41ba-b31e-2c53ea0eaf60` estaba en success para el HEAD inicial. La URL pública respondió HTTP 200 y el navegador mostró el login. La publicación del nuevo código y el recorrido autenticado se verifican por separado después de los commits; no se presuponen por el build local.

`tests/e2e.mjs` está actualizado para el formulario real, pero requiere sesiones QA A/B y navegador. Los tests con adaptador simulado no prueban por sí solos la red/SDK real ni el modo avión de una PWA instalada. Cualquier recorrido que no se haya ejecutado se informará como pendiente.

## Avisos reales preexistentes

- Check `Workers Builds: visitaslocales` fallido, distinto del Pages `localvivienda` objetivo.
- Advisor Supabase: protección contra contraseñas filtradas desactivada; sin avisos nuevos de RLS. Referencia: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Vite informa de un bundle principal de más de 500 kB sin comprimir; el build y el precache PWA completan. No se ha añadido ningún servicio de pago.

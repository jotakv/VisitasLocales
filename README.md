# LocalVivienda

Cuaderno de inspección de locales con React, TypeScript, Dexie, Supabase y Cloudflare Pages. El Incremento 2 recoge respuestas con procedencia, evidencia y notas en un formulario de 28 secciones. No emite un dictamen de viabilidad.

- Aplicación: https://localvivienda.pages.dev
- Repositorio: https://github.com/jotakv/VisitasLocales (`main`)
- Supabase existente: `localvivienda` · `cigsvuqbbehqaqlmcjbb` · `eu-west-1`
- Nuevas visitas: formulario `0.2.0`, común o compuesto con el overlay Zaragoza.
- Visitas anteriores: se conserva `0.1.0`, con sus seis campos; nunca se convierte automáticamente una visita.

## Uso

Iniciar sesión → crear/abrir propiedad → nueva visita o continuar borrador. Cada campo se guarda inmediatamente en el dispositivo. **Detalles** permite cambiar la fuente, marcar evidencia y añadir notas. **Secciones** abre el índice; **Críticos pendientes** lleva a las comprobaciones que faltan.

Se conserva la última sección. Al reabrir una visita se leen primero los datos locales; la sincronización ocurre en segundo plano. Con conexión se envían los cambios a Supabase. **Sincronizar** permite reintentar. Espera a ver **Guardado en dispositivo · puedes cerrar** antes de cerrar. Sincronizado indica además que se ha confirmado el envío.

Para estrenar una instalación PWA hace falta abrirla online una vez y autenticarse. Después puede reabrirse sin conexión usando la sesión local existente. Las credenciales se validan por Supabase para cada operación remota. No borres los datos del sitio mientras haya cambios pendientes. No se garantiza recuperación si se elimina el almacenamiento del navegador, se usa navegación privada o se cambia de dispositivo antes de sincronizar.

## Desarrollo

Node y npm con las versiones compatibles del lockfile. No es necesario crear proyectos.

```sh
npm ci
cp .env.example .env.local
# Completar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY con URL y clave pública.
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

`VITE_SUPABASE_ANON_KEY` conserva su nombre por compatibilidad con Cloudflare y acepta la clave anon existente o una publishable key. Nunca introducir `service_role`, claves secretas ni PAT en variables VITE, código o Git.

## Base de datos

Migraciones versionadas y aplicadas al proyecto existente:

1. `20260926142312_foundation.sql`
2. `20260926184303_visit_answers.sql`

No editar migraciones ya aplicadas. La segunda añade `visit_answers`, restricciones de propiedad, RLS para las cuatro operaciones y resolución atómica de escrituras antiguas. Los buckets `visit-photos`, `property-documents` y `generated-reports` siguen privados y sin UI de subida.

## Verificación

`npm test`: schemas, nueve tipos de control, visibilidad, progreso, recorrido por 28 secciones, advertencia de salida, recuperación, upgrade Dexie, offline y sync con un adaptador remoto simulado, errores, carreras y deduplicación.

`tests/rls-visit-answers.sql`: pruebas reales con dos identidades temporales y rol `authenticated`; todo se revierte al terminar. Ejecutadas en el Supabase real durante el incremento. No requieren modificar usuarios existentes.

`tests/e2e.mjs`: recorrido completo con Chromium, sesiones reales A/B, reinicio de navegador, PWA offline y REST/RLS. Requiere credenciales QA facilitadas por un canal seguro y navegadores Playwright instalados. No se considera ejecutado simplemente porque pasen los tests unitarios.

```sh
# .env.qa.local: QA_EMAIL_A, QA_PASSWORD_A, QA_EMAIL_B, QA_PASSWORD_B; nunca versionar.
# QA_BASE_URL por defecto http://127.0.0.1:4173. Se puede fijar a producción para verificarla.
node --env-file=.env.local --env-file=.env.qa.local tests/e2e.mjs
```

El E2E crea una propiedad QA y elimina únicamente esa propiedad con sus visitas/respuestas al terminar. Los test-results y los archivos de credenciales están excluidos de Git.

## Documentación

- [Arquitectura](docs/architecture.md)
- [Schemas y composición municipal](docs/form-schema.md)
- [Guardado local y sincronización](docs/offline-sync.md)
- [Verificación del incremento](docs/increment-2-verification.md)

## Alcance

Implementados: **guardar** y **sincronizar**. Pendientes: finalizar, snapshots, exportar y analizar. No existen llamadas OpenAI, ejecución de skills sobre visitas, MCP de la aplicación, plugin ChatGPT ni publicación GitHub de visitas. El despliegue del código por GitHub → Cloudflare Pages es independiente de esas futuras funciones.

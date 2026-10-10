# AGENTS.md

NestJS 12 API (GLD). Node ESM + TypeScript, compiled with Nest CLI.

# Vertical Slice

See this instructions:
SKILLS\vertical-slice-architecture.md

## Commands

- `npm run lint` — oxlint (`src/`, `test/`). There is no ESLint config; do not add one.
- `npm run test` — unit tests via Vitest (`*.spec.ts`, globals enabled, no imports needed).
- `npm run test:e2e` — e2e via Vitest with a separate config (`vitest.config.e2e.ts`, matches `*.e2e-spec.ts`). A unit run will NOT pick up e2e specs — always run both.
- `npm run build` — `nest build`; this is the typecheck step (no `tsc --noEmit` script exists).
- `npm run format` — Prettier (single quotes, trailing commas).
- Verify order: `lint` -> `test` -> `test:e2e` -> `build`.
- Dev server: `npm run start:dev` (port from `PORT` env, default 3000). Swagger UI at `/api`.

## Gotchas

- ESM: package.json has `"type": "module"` and tsconfig uses `module/moduleResolution: nodenext`. All relative imports must use explicit `.js` extensions even in `.ts` files: `import { AppModule } from './app.module.js'`. Omitting `.js` breaks build and tests.
- Vitest replaces Jest: don't create jest configs or `jest.*` scripts. Test files live next to source (`*.spec.ts`) except e2e, which lives in `test/`.
- `app.module.ts` contains `@nestjs/observe` with placeholder `appKey`/`appSecret` values — don't treat them as real credentials.
- tsconfig has `strict: true` but `strictPropertyInitialization: false`; `types` includes `vitest/globals`.
- Control de Almacén (`src/features/almacen/`): toda mutación de stock pasa por `shared/inventario-ledger.ts` dentro de una transacción y con SQL crudo (`db.raw.sql`, cantidades/costos `numeric` casteados a text). `tx` no expone `raw`: arme el plan con `db.raw.sql` y ejecútelo con `tx.query(plan).toArray()` (filas) o `tx.execute(plan)` (filas afectadas). `test/almacen.e2e-spec.ts` escribe en la BD de `DATABASE_URL` y limpia sus propios datos. Plan y decisiones: `planes/04-control-almacen.md`.
- Compras (`src/features/requerimientos/` + `src/features/almacen/recepciones/`): FUR -> aprobación -> OC (`documentosOrigen`) -> recepción -> ingreso `COMPRA`. Los saldos (aprobado -> ordenado -> recibido) **no se guardan**: se calculan en SQL (`requerimientos/shared/requerimiento-saldos.ts`, `almacen/shared/oc-saldos.ts`). Todo lo que consume saldo corre en `db.transaction` con `FOR UPDATE` del FUR o de la OC; dentro de la transacción use `tx.orm.public` y arme la respuesta **después del commit** (otra conexión no ve filas sin confirmar). Un FUR solo genera OC en `APROBADO`; la OC con ingresos (aunque estén anulados) no admite reemplazar su detalle ni eliminarse. Soles = símbolo `S/…`, vacío o `moneda_id` `PEN` (los datos históricos mezclan ids); si no, la recepción exige `tipo_cambio`. Los enums de Prisma Next se guardan como `text` con `CHECK`. Para listas de ids use `= ANY(string_to_array(${csv}::text, ',')::int[])`. `test/compras-flujo.e2e-spec.ts` escribe en la BD de `DATABASE_URL` y limpia sus datos. Plan y decisiones: `planes/05-requerimientos-fur.md`.
- `prisma migration plan` toma `migrations/app/refs/db.json` como punto de partida; si está atrasado respecto a la última migración, pase `--from <hash del contrato vigente>` o generará de nuevo tablas ya creadas. Tras editar `migration.ts` a mano ejecute `node migrations/app/<dir>/migration.ts` desde la raíz del backend para regenerar `ops.json`/`migration.json`.

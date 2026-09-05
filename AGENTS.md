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

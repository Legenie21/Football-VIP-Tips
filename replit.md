# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Future Cybrancee connection: `docs/cybrancee-configuration.md` and
  `config/cybrancee.env.example`. Configuration preparation only; no live DB/SMTP
  connection or direct authentication flows have been implemented or enabled.
- Imported site provenance, preservation and current integration stop:
  `docs/restauration-site.md`. Do not connect business routes to an incidental
  `DATABASE_URL`; wait for the actual Cybrancee engine and SMTP details.
- Production hosting target: Plesk, not the development preview.
  See `docs/deploiement-plesk.md` for the precompiled delivery, initial Node.js
  settings and safe Git branch. Never run a build in Plesk or copy server
  secrets into the public bundle.
  Plesk Git deployment actions must be empty: `app.js` retrieves and verifies
  the precompiled GitHub package on startup, then reuses a verified local cache.

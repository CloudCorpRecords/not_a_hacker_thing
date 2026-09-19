# FiberOps Confirmed-Fact Control Room

FiberOps turns field production captures and evidence into named-reviewer confirmed facts, then reports actual production against sold plan without presenting provisional data as final.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (binds to `PORT`; current dev workflow uses 8080)
- `pnpm --filter @workspace/fiber-operations-poc run dev` — run the web app
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

- `artifacts/fiber-operations-poc/` — React field capture and office control room
- `artifacts/api-server/` — Express API, evidence processing, confirmed-fact read models
- `lib/api-spec/openapi.yaml` — source-of-truth API contract
- `lib/db/src/schema/` — Drizzle/PostgreSQL schema
- `lib/db/migrations/` — append-only and other SQL protections
- `lib/api-client-react/` and `lib/api-zod/` — generated clients and validators
- `README.md` — setup, architecture, and product rules
- `ROADMAP.md` — completed milestones and future work

## Architecture decisions

- Reports aggregate only `confirmed` production items; proposals and refusals remain visible but never count as actuals.
- Evidence bytes live in Replit App Storage; PostgreSQL holds provenance, hashes, retention, extraction, checks, and audits.
- Evidence interpretation is constrained to known work types from the same crew-day and cannot autonomously create final facts.
- Production and evidence review history is append-only.
- Different production units are never summed into a single portfolio quantity.
- Broad company authentication is intentionally outside the current POC; intake is capture-bound and office decisions require a named reviewer.

## Product

- Offline field quantity capture with photo and voice evidence
- Deterministic and AI-assisted evidence checks routed to human review
- Confirm/correct/refuse adjudication with reason codes and override auditing
- Confirmed-fact portfolio and project reporting with provenance drill-down
- Evidence-pack export for confirmed and refused claims

## User preferences

- Preserve the warm mineral, utility green, clay, and brass visual identity.
- Prefer one defensible actual-against-sold report over unsupported metric breadth.

## Gotchas

- Change OpenAPI first, then run codegen; never hand-edit generated API files.
- A successful API mutation must invalidate portfolio, control-room, fact, and evidence queries that consume the changed decision.
- Keep blocking-check overrides server-enforced and append them to both production and linked evidence audit histories.
- Do not report productivity, rework, or forecast metrics unless input completeness and assumptions are visible.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

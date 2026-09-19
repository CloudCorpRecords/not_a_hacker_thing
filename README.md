# FiberOps Confirmed-Fact Control Room

FiberOps is a proof of concept for turning field production captures into office-ready, defensible facts. Crews submit quantities with photo or voice evidence; office reviewers confirm, correct, or refuse proposals; the control room reports actual production against sold plan using **confirmed facts only**.

The product is intentionally not a billing system or a general-purpose BI tool. Its core promise is narrower: every reported quantity can be traced back to the crew-day, review decision, deterministic checks, and original evidence that produced it.

## What is included

- Offline-capable field capture for production quantities, photos, and voice notes
- Durable evidence storage with SHA-256 verification, provenance, and retention metadata
- Constrained media interpretation with confidence, explanation, and deterministic checks
- Named-reviewer adjudication with confirm, correct, and refuse decisions
- Append-only production and evidence audit histories
- Portfolio reporting for confirmed production against sold plan by project and work type
- Project control-room views for activity, review backlog, refusals, site attention, capture lag, and evidence coverage
- Drill-down from confirmed quantities to crew-day, decision history, and evidence
- Downloadable project evidence packs containing confirmed and refused claims
- Honest unavailable and partial-data states for metrics that the stored facts cannot support

## Fact states

FiberOps keeps provisional and final data separate:

| State | Meaning | Included in actual production? |
| --- | --- | --- |
| `captured` / `queued` | Recorded in the field or waiting to synchronize | No |
| `proposed` / `needs_review` | Submitted for office adjudication | No |
| `refused` | Reviewed and rejected with a reason | No |
| `confirmed` | Accepted by a named reviewer | **Yes** |

AI interpretation never becomes a final production fact by itself.

## Architecture

```text
Field capture (React + IndexedDB)
  -> Express API
  -> PostgreSQL production records and append-only audits
  -> Replit App Storage evidence objects
  -> constrained OpenAI media interpretation
  -> office adjudication
  -> confirmed-fact read models and evidence packs
```

The write path and reporting path are deliberately separate:

- The **write path** captures what a crew submitted, preserves the source evidence, runs deterministic and AI-assisted checks, and records a human decision.
- The **reporting path** reads only final `confirmed` items for production actuals. It keeps captured, waiting, and refused quantities visible as workflow context but never adds them to confirmed totals.

This separation prevents a new capture, a high-confidence model output, or an unresolved review from changing a customer-facing production number.

## End-to-end data lifecycle

### 1. Project operational foundation

Creating a project also creates the operational reference data needed by field capture:

- sites
- subcontractors and crews
- work types with units and per-crew-day plausibility limits
- sold production plans by site and work type

The project’s eight stage labels remain useful construction context, but stage status is not the source of measured production progress. Control-room progress is calculated from sold plans and confirmed quantities.

### 2. Field capture

A field capture contains:

- a stable external capture ID
- project, site, and crew context
- work date and capture timestamp
- optional latitude and longitude
- one or more production items
- optional photo and voice-note blobs

Each production item has its own external ID, work type, quantity, unit, and optional note. The server derives project ownership and related context; clients do not get to assign arbitrary server-owned relationships.

Before inserting a capture, the API checks:

- the site belongs to the project
- the crew and work type exist
- the crew is certified for the work type
- the submitted unit matches the work type
- quantities are positive and within configured crew-day limits
- sold plan exists for the site/work-type pair
- external IDs are either new or exact idempotent retries

The capture and its production items are written transactionally with an initial append-only `submitted` audit event.

### 3. Offline queue and synchronization

The field app stores capture metadata and media blobs in IndexedDB. Metadata synchronization and evidence synchronization have separate retry state so a successful capture is not lost when media upload is interrupted.

Important retry behavior:

- Network failures remain retryable.
- Validation and immutable-intent conflicts are shown as durable errors rather than retried forever.
- Reusing an external ID with the same immutable payload returns the existing record.
- Reusing an external ID with different immutable fields returns a conflict.
- Evidence blobs remain in IndexedDB after metadata sync until the evidence workflow reaches a durable final intake state.
- An evidence item already in `processing` is sent through the completion endpoint again. Fresh processing leases return a retryable conflict; stale leases can be reclaimed after the server timeout.

### 4. Evidence upload and verification

Evidence bytes are uploaded directly to Replit App Storage through a short-lived signed URL. PostgreSQL stores:

- object path
- media kind and content type
- byte size
- SHA-256 digest
- source capture context
- capture timestamp and location context
- verification time
- retention policy and retention-until date
- extraction output, checks, status, and error information

The server does not consider an upload complete merely because an upload URL was issued. On completion it reads the object metadata and bytes, verifies size, content type, and SHA-256, then atomically claims the record for processing.

Each distinct capture keeps its own evidence record and object. Duplicate content is detected **after verification** and becomes a blocking review check on the later record. The system does not silently reuse a pending object or erase the second capture’s provenance.

### 5. Interpretation and deterministic checks

Photo and audio interpretation is constrained to work types already present in the same crew-day. The model may propose:

- a candidate work type
- a candidate quantity and unit
- identity and extraction confidence
- an explanation
- an audio transcript where applicable

The model is not the decision-maker. Server-side checks independently evaluate:

- evidence identity/context
- positive quantity
- unit consistency
- remaining sold plan
- per-crew-day plausibility
- duplicate verified content
- cost of error against a uniquely matched submitted item
- confidence routing

Verification failures, interpretation failures, low confidence, ambiguous identity, duplicates, and failed blocking checks route to `manual_review`.

### 6. Office adjudication

An office reviewer supplies a name and chooses:

- **Confirm** — accept the submitted quantity as a fact.
- **Correct** — replace the quantity, with a required reason code and explanation.
- **Refuse** — reject the item, with a required reason code and explanation.

If linked evidence has failed blocking checks, confirmation additionally requires an explicit acknowledgment and override reason. The API enforces this rule even if a caller bypasses the UI.

The review transaction updates the current production item and appends:

- a production audit event with previous/next state, actor, reason, correction, and override metadata
- linked evidence audit events recording the same reviewer decision and failed checks

Historical audit events are never edited or deleted.

### 7. Confirmed-fact reporting

The control room builds read models from sold plans, crew-days, production items, evidence, and audit events:

- confirmed against sold by project and work type
- quantities separated into captured, queued, proposed, needs-review, refused, waiting, and confirmed states
- recent activity with site, crew, item outcomes, and quantities grouped by unit
- review and refusal backlogs
- visited, unvisited, and evidence-attention sites
- capture-to-confirmation lag with sample size
- evidence processing coverage
- latest capture and confirmation timestamps

Only the `confirmed` quantity is used as actual production. Quantities are aggregated within a work type and its declared unit; metres and each are never combined into one total.

### 8. Provenance drill-down and evidence packs

The UI supports this chain:

```text
portfolio project
  -> work-type confirmed/sold row
  -> confirmed production item
  -> crew-day and original capture
  -> production audit decisions
  -> linked evidence
  -> evidence checks and evidence audit history
```

Evidence-pack export produces a self-contained HTML record from the server manifest. It includes confirmed and refused claims, capture identifiers, quantities, decision history, reason text, hashes, retention dates, deterministic checks, and evidence audit events. It is an operational trace, not an invoice or legal certification.

### Source of truth

- `lib/api-spec/openapi.yaml` — API contract
- `lib/db/src/schema/` — PostgreSQL schema
- `artifacts/api-server/src/routes/` — API behavior
- `artifacts/fiber-operations-poc/src/` — field and office web application
- `lib/api-client-react/src/generated/` — generated React Query client
- `lib/api-zod/src/generated/` — generated request and response validation

## Application routes

| Route | Purpose |
| --- | --- |
| `/` | Portfolio control room using confirmed-fact summaries |
| `/projects/:projectId` | Project actual-against-sold view, activity, site attention, fact ledger, provenance, and export |
| `/projects/:projectId/evidence` | Evidence/proposal adjudication queue |
| `/field/:projectId` | Mobile-oriented field capture, offline queue, history, and sync |

## API surface

The OpenAPI server base path is `/api`.

### Project and operational reference data

- `GET /projects`
- `POST /projects`
- `GET /projects/{projectId}`
- `PATCH /projects/{projectId}`
- `GET /projects/{projectId}/field-context`

### Capture and review

- `POST /projects/{projectId}/captures`
- `GET /projects/{projectId}/proposals`
- `GET /projects/{projectId}/facts`
- `GET /projects/{projectId}/field-history`
- `PATCH /production-items/{productionItemId}/review`

### Evidence

- `POST /projects/{projectId}/evidence/uploads/request-url`
- `POST /projects/{projectId}/evidence/{evidenceId}/complete`
- `GET /projects/{projectId}/evidence`
- `GET /projects/{projectId}/evidence/{evidenceId}`
- `GET /projects/{projectId}/evidence/{evidenceId}/content`

### Confirmed-fact read models

- `GET /portfolio-summary`
- `GET /projects/{projectId}/control-room`
- `GET /projects/{projectId}/facts/{productionItemId}`
- `GET /projects/{projectId}/evidence-pack`
- `GET /projects/{projectId}/progress-summary`

All request and response shapes are defined in `lib/api-spec/openapi.yaml`. Runtime request validation uses generated Zod schemas. The web app consumes generated React Query hooks.

## Data model

The central PostgreSQL records are:

| Record | Responsibility |
| --- | --- |
| Project | Commercial/project identity and stage context |
| Site | Project-scoped work location |
| Subcontractor / Crew | Field organization, foreman, headcount, and certifications |
| Work type | Production code, stage, unit, and plausibility threshold |
| Production plan | Sold quantity by project, site, and work type |
| Crew-day | Immutable source capture context and payload hash |
| Production item | Current proposal/fact state and quantity |
| Production audit event | Append-only decision history |
| Evidence item | Object provenance, verification, extraction, checks, and retention |
| Evidence audit event | Append-only evidence lifecycle and review history |

Database triggers in `lib/db/migrations/0001_append_only_production_audit.sql` and `0002_append_only_evidence_audit.sql` reject updates and deletes against audit tables.

## Read-model definitions

### Confirmed against sold

For each work type:

```text
confirmed = sum(production item quantity where status = confirmed)
remaining = max(0, sold plan - confirmed)
ratio     = confirmed / sold plan, or null when no sold plan exists
```

The visual bar is capped at 100% for layout, while the displayed confirmed and sold values remain uncapped so over-plan production is visible.

### Waiting quantity

`waitingTotal` is the sum of captured, queued, proposed, and needs-review quantities within one work type/unit. It is operational backlog, not actual production.

### Capture-to-office lag

Lag samples use confirmed items that have a confirmation timestamp:

```text
lag = confirmedAt - crewDay.capturedAt
```

The API returns the sample size with the average. No sample means the metric is unavailable, not zero.

### Site attention

A site is:

- **unvisited** when no crew-day has been captured for it
- **attention** when evidence is failed or contains a failed blocking check

This is evidence/review attention, not a full construction schedule blocker model.

### Derived metrics

Crew productivity, rework, and forecast finish are nullable. The API must return availability, assumptions, and missing reasons. The current POC intentionally reports them as unavailable rather than manufacture values from incomplete inputs.

## Local development

This repository is a pnpm workspace and is designed to run through Replit workflows.

### Services

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/fiber-operations-poc run dev
```

The API binds to the configured `PORT`. In the current development workflow it serves on port `8080`; the web artifact is routed through Replit's preview proxy.

### Workspace layout

```text
artifacts/
  api-server/              Express API service
  fiber-operations-poc/    React + Vite web artifact
lib/
  api-spec/                OpenAPI contract and codegen configuration
  api-client-react/        generated web client
  api-zod/                 generated runtime validators
  db/                      schema, Drizzle configuration, SQL migrations
  integrations-openai-ai-server/
                            Replit AI Integrations client
scripts/
  post-merge.sh            post-merge reconciliation
```

### Validation

```bash
pnpm run typecheck
pnpm run build
git diff --check
```

### API generation

After changing `lib/api-spec/openapi.yaml`:

```bash
pnpm --dir lib/api-spec codegen
```

Do not edit generated client or Zod files by hand.

### Database changes

```bash
pnpm --filter @workspace/db run push
```

Append-only audit protections also live in `lib/db/migrations/`. Apply the SQL migrations through the repository's migration script when setting up a fresh database.

`pnpm --filter @workspace/db run push` performs both the Drizzle schema push and the repository SQL migration pass. Use `push-force` only when you understand and accept the destructive schema changes Drizzle proposes.

## Validation strategy

Use the cheapest check that covers the change, then validate the coherent flow before delivery:

```bash
# Contract and generated libraries
pnpm --dir lib/api-spec codegen
pnpm run typecheck:libs

# Service checks
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/fiber-operations-poc run typecheck

# Full workspace
pnpm run typecheck
pnpm run build
git diff --check
```

For evidence changes, a meaningful integration check should cover:

1. request a signed URL
2. upload real bytes
3. complete and verify the object
4. confirm manual-review routing for unreadable/ambiguous evidence
5. review the linked proposal
6. confirm the control-room actual changes only after the human decision
7. confirm a refusal remains visible but does not change actual production
8. retry the same capture and evidence completion to verify idempotency

## Environment

The application expects:

- PostgreSQL through `DATABASE_URL`
- Replit App Storage configuration for evidence objects
- Replit AI Integrations OpenAI configuration for media interpretation
- `SESSION_SECRET` for server-side session support

Keep credentials in Replit Secrets. Never commit them to the repository.

The application does not read secret values into browser code. Signed upload URLs are short-lived capabilities and must not be logged, stored in project documentation, or persisted after upload.

## Failure behavior

The product prefers explicit partial states over silent fallbacks:

- A missing project returns `404`.
- Invalid capture context or deterministic validation returns `4xx` and is shown as a validation error.
- Immutable external-ID conflicts return `409`.
- Fresh evidence-processing claims return retryable `409`; stale verified claims can be recovered.
- Object verification failure persists the evidence record as `manual_review` with an audit event.
- AI interpretation failure persists the evidence and routes it to manual review rather than discarding the upload.
- Empty reporting states say what data is missing.
- Unsupported derived metrics return `unavailable` with reasons.

## Security and trust boundaries

- Capture external IDs provide POC intake scoping but are not a substitute for production authentication.
- Project/site/crew relationships are derived or validated server-side.
- Evidence content is served through project-scoped API routes rather than exposing permanent public URLs.
- Review actors are required names, not authenticated identities in this POC.
- The server, not the UI, enforces correction/refusal reasons and blocking-check overrides.
- Audit tables are append-only at the database layer.
- SHA-256 proves the retained bytes match the declared upload; it does not prove the media is truthful.
- Model output is untrusted input and must pass deterministic checks plus human review.

## Troubleshooting

### Generated types do not match the API

Update `lib/api-spec/openapi.yaml`, run `pnpm --dir lib/api-spec codegen`, then typecheck both the API and web artifact. Do not patch generated files as the source fix.

### Preview loads but API data fails

Confirm both Replit workflows are running. Browser code should use the artifact-routed `/api` path through the generated client, not hard-coded `localhost` or a development domain.

### Evidence is stuck in processing

Retry synchronization. The client calls completion for existing processing records; the server rejects a fresh lease as retryable and reclaims a stale verified lease after the configured timeout. Check evidence audit events for `processing_started` and `processing_recovered`.

### A report looks lower than field submissions

Check the status quantities for that work type. Captured, queued, proposed, needs-review, and refused quantities are intentionally excluded from actual production. Open the adjudication queue or fact drill-down instead of changing the aggregate.

### A progress ratio is unavailable

The work type has no sold plan quantity. The UI should show the raw confirmed quantity and an explicit no-plan state rather than treating it as 0%.

## Important product rules

1. Reports aggregate only production items with `status = confirmed`.
2. Quantities with different units are never summed together.
3. Evidence interpretation is constrained to known work types in the same crew-day context.
4. Failed extraction, low confidence, duplicate content, and blocking checks route to human review.
5. Final review history is append-only.
6. Corrections and refusals require a reason code and explanation.
7. Blocking-check confirmations require an explicit reviewer override and recorded reason.
8. Evidence bytes live in App Storage; PostgreSQL stores queryable metadata and audit history.
9. No accounting or billing writes are performed.

## Contribution rules

- Preserve external IDs, enum values, and path-based artifact routing.
- Keep API changes contract-first and regenerate both clients.
- Keep production-item state changes and their audit insert in one transaction.
- Never update or delete audit events.
- Never treat AI confidence as confirmation.
- Add a missing-data reason whenever a metric can be unavailable.
- Invalidate portfolio, control-room, fact, progress, proposal, and evidence queries affected by a review.
- Keep the field flow usable at mobile widths and resilient to offline replay.
- Preserve the existing warm mineral, utility green, clay, and brass visual language unless the product direction explicitly changes.

## Known POC boundaries

- Intake identity is bound to validated capture identifiers and server-derived project context; broad company authentication is not part of this POC.
- Crew productivity, rework rate, and forecast finish remain unavailable unless complete inputs and visible assumptions support them.
- Evidence packs are operational records, not legal certifications or customer invoices.
- Site attention is derived from captured evidence and review conditions; it is not a replacement for a construction scheduling system.

See [ROADMAP.md](ROADMAP.md) for completed milestones and recommended next steps.
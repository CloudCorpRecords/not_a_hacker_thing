# FiberOps Roadmap

This roadmap follows one rule: add richer reporting only when the capture and review chain can defend the resulting number.

## Current product baseline

### Completed: field-to-fact foundation

- Structured field capture for project, site, crew, work type, quantity, date, and notes
- Offline local queue with retry-safe metadata synchronization
- Photo and voice-note evidence intake
- SHA-256 verification, provenance, retention metadata, and durable object storage
- Constrained media interpretation with confidence and explanation
- Deterministic unit, plan, plausibility, duplicate, and cost-of-error checks
- Manual-review routing for extraction and verification failures
- Named-reviewer confirm, correct, and refuse decisions
- Append-only production and evidence audit events

### Completed: confirmed-fact control room

- Portfolio actual-against-sold reporting by project and work type
- Confirmed-only production aggregation
- Separate captured, waiting, refused, and confirmed states
- Today activity, review backlog, refusal, site attention, unvisited-site, lag, and evidence-coverage indicators
- Project-level confirmed production drill-down
- Trace from aggregate to crew-day, production item, review decision, and evidence
- Exportable evidence-pack manifest for confirmed and refused claims
- Honest unavailable states for unsupported productivity, rework, and forecast metrics

## Near-term reliability

### Automated evidence lifecycle checks

Add repeatable integration coverage for:

- interrupted upload and processing recovery
- idempotent capture and completion retries
- duplicate content before and after verification
- append-only audit enforcement
- blocking-check override enforcement and audit metadata
- offline queue replay after browser restart

### Evidence-pack hardening

- Add selectable project, work type, date, site, and claim filters
- Include a human-readable cover sheet and manifest version
- Offer a ZIP containing the manifest plus original media when policy permits
- Add export checksum and generation audit event
- Define redaction behavior for location, transcript, and reviewer data

### Operational freshness

- Add explicit stale thresholds per data source
- Distinguish “no activity,” “not synchronized,” and “source unavailable”
- Add queue age and oldest-waiting indicators
- Surface processing leases that require operator attention

## Product expansion

### Stronger identity and authorization

Only when the POC moves into multi-user production:

- authenticated reviewers and crews
- project and subcontractor roles
- permissioned evidence access
- immutable user identifiers alongside display names
- reviewer delegation and separation-of-duties controls

### Defensible forecasting

Show forecast finish only after the system has:

- enough confirmed crew-days for a stable observed rate
- explicit calendars and non-working days
- remaining quantities by work type and site
- visible assumptions and confidence limits
- no unresolved unit or plan conflicts

### Defensible productivity

Introduce crew productivity only with:

- complete crew identity and headcount history
- confirmed quantities only
- comparable work type, site condition, and shift definitions
- a clear prohibition on ranking or incentives from incomplete data
- review of how the metric may change field behavior

### Rework measurement

Do not infer rework from refusals. Add an explicit rework event model with:

- original fact linkage
- cause and responsibility fields
- quantity and unit
- supporting evidence
- reviewer decision

## Explicitly out of scope

- Customer billing or accounting writes
- A general business-intelligence builder
- Autonomous acceptance of high-impact production claims
- Editable or deletable historical decisions
- Crew rankings based on provisional or incomparable quantities
- A conversational assistant as the primary reporting interface

## Release gate for production use

Before production rollout, require:

- end-to-end automated coverage of the critical capture-to-confirmation path
- threat model and security scan
- authenticated identities and authorization policy
- retention, deletion, and legal-hold policy
- backup and disaster-recovery verification
- object-access and evidence-pack redaction review
- observability for upload, extraction, review, and export failures
- documented data ownership and support procedures
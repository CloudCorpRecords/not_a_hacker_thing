# Locate API v2 — for the Walk the Line front end

> **For Rene — start here.** Live now, no key needed, CORS open (`access-control-allow-origin: *`,
> verified). Your Replit app can fetch these directly from the browser.
>
> **If you only read one section, read [Adjudication](#adjudication--the-part-that-matters-to-you).**
> Your evidence screen says *"This evidence is not linked to a production proposal. Adjudication
> cannot be performed directly."* We serve both halves already joined: a proposal, and evidence
> carrying that proposal's id. The short version: the API changed shape and the
> headline number went from **53 locate marks to 0**. That is not a bug — the detector was
> wrong and we caught it. Read the breaking-change table, then the `verdict` section.
> Questions: John.

Static JSON, CORS-open, served from GitHub Pages. No key, no auth, no rate limit.

**Base:** `https://jymiller.github.io/milbird-walk-the-line/api/`

## Breaking change from v1 — read this first

v1 published **53 detections as findings**. They were colour matches, not locate marks:
the four largest were a red-painted doorstep, a USPS mailbox, a drift of fallen leaves
and a STOP sign. v2 publishes the whole pipeline instead, and the honest count is **zero**.

| | v1 | v2 |
|---|---|---|
| `locates.json` features | 53, all treated as real | **124**, every colour region, kept or rejected |
| Reading a feature | every feature is a locate | check `properties.verdict` |
| `summary.json` | `detections: 53` | `pipeline: {colour_regions, rejected_by_classifiers, machine_candidates, human_confirmed}` |
| `stage2.json` | `quantity: 53` | `quantity: 0` |
| New | — | `rules.json` |

**Geometry is unchanged.** Every feature still carries a `Point` derived from the same
±7m GPS anchor, so an existing map layer keeps working. Filter before you plot.

## Endpoints

| Endpoint | Returns |
|---|---|
| `summary.json` | The funnel: 124 regions in → 122 rejected → 2 to human → 0 confirmed. Plus `rejections_by_rule` and `provenance`. |
| `rules.json` | The seven classifiers, their thresholds, and how many regions each rejected. |
| `locates.json` | GeoJSON FeatureCollection, 124 features — every region with its verdict and the seven measurements behind it. |
| `stage2.json` | The proposed Stage 2 (Utility Locates) record. `quantity: 0`, `requiresHumanDecision: true`. |
| `health.json` | Liveness and counts. |

## The one field that matters

```js
const { features } = await (await fetch(BASE + 'locates.json')).json();

features.filter(f => f.properties.verdict === 'candidate');  // 2 — reached a human
features.filter(f => f.properties.verdict === 'rejected');   // 122 — and why, below
```

`verdict` is `"candidate"` or `"rejected"`. **Nothing in this API is `confirmed`** —
no human confirmed any region as a locate mark, because none of them was one.

## Why a region was rejected

`properties.rejected_by` is an array of rule names, empty for a candidate. A region can
fire several. Every rule has a measured number beside it in the same properties object:

| Rule | Rejects | Read it against |
|---|---|---|
| `stroke_width` | Too thick to be a paint stroke | `stroke_px`, `stroke_frac` |
| `on_pavement` | Not surrounded by bare pavement | `pavement_surround` (0–1) |
| `not_vegetation` | Living foliage, not pigment | `exg` (excess-green index) |
| `ground_band` | Too high in frame to be on the ground | `centroid_y_frac` |
| `pigment_coherence` | Colour too mixed or too dull for marking paint | `hue_std`, `sat_mean` |
| `not_a_slab` | Large and solid — street furniture | `area_frac`, `extent` |
| `flat_film` | Shaded like a 3-D object, not a flat film | `value_cv` |

So a UI can say *"rejected: too thick — 195px against a 15px limit"* rather than showing
a confidence score nobody can argue with.

## Other properties

`t` (seconds into the clip), `colour`, `utility` (APWA class), `area` (px),
`bbox` `[x, y, w, h]` in the 1080×1920 frame, `position_provenance`.

## Suggested UI

1. Default to the **2 candidates**, with the 122 rejections behind a toggle.
2. On a rejected region, show `rejected_by` and the number that caused it.
3. Show the funnel from `summary.json` — it is the most honest thing on the page.
4. Surface `stage2.json`'s `note` verbatim. Absence of marking *is* the finding.

Regenerate: `python locates/build_api.py classified.json site/api locates.geojson`


## Worked example — a panel you can drop in

```tsx
const BASE = 'https://jymiller.github.io/milbird-walk-the-line/api/';

type Verdict = 'candidate' | 'rejected';

interface RegionProps {
  t: number;                 // seconds into the clip
  colour: string;            // orange | red | yellow | green | blue
  utility: string;           // APWA class, e.g. "communications / fibre"
  area: number;              // px
  bbox: [number, number, number, number];
  verdict: Verdict;
  rejected_by: string[];     // [] when verdict === 'candidate'
  stroke_px: number;
  pavement_surround: number; // 0-1
  hue_std: number;
  sat_mean: number;
  exg: number;
  value_cv: number;
  centroid_y_frac: number;
  position_provenance: string;
}

// Human-readable reason, with the number that caused it.
const REASON: Record<string, (p: RegionProps) => string> = {
  stroke_width:      p => `too thick for a paint stroke — ${p.stroke_px}px inscribed radius`,
  on_pavement:       p => `not on pavement — only ${Math.round(p.pavement_surround * 100)}% of the surround reads as concrete`,
  not_vegetation:    p => `living foliage — excess-green ${p.exg.toFixed(3)}`,
  ground_band:       p => `too high in frame — centroid at ${Math.round(p.centroid_y_frac * 100)}% down`,
  pigment_coherence: p => `colour too mixed or dull — hue spread ${p.hue_std}, saturation ${p.sat_mean}`,
  not_a_slab:        p => `large, solid and rectangular — street furniture`,
  flat_film:         p => `shaded like a 3-D object — brightness varies ${p.value_cv}`,
};

export function explain(p: RegionProps): string {
  if (p.verdict === 'candidate') return 'reached human review';
  return p.rejected_by.map(r => REASON[r]?.(p) ?? r).join('; ');
}
```

## The funnel, for the header

```js
const s = await (await fetch(BASE + 'summary.json')).json();
// s.pipeline = { colour_regions: 124, rejected_by_classifiers: 122,
//                machine_candidates: 2, human_confirmed: 0 }
// s.finding  = "No utility locate marking was found on this segment of Pine Street."
```

Showing `124 → 122 → 2 → 0` is stronger than showing a count. It says the pipeline has a
rejection stage and that the stage did real work.

## What NOT to render

- **Do not label anything "confirmed".** Nothing in this dataset is. `human_confirmed` is 0.
- **Do not plot all 124 points as locates.** Default to `verdict === 'candidate'` and put the
  rejections behind a toggle, or the map repeats the original mistake at higher resolution.
- **Do not present coordinates as surveyed.** They are interpolated from one ±7m GPS anchor.
  `position_provenance` says so on every feature; surface it in the popup.

## Context — why the number changed

The first detector thresholded video frames for APWA locate colours. It reported 53 marks.
Before publishing, we opened the four largest: a red-painted doorstep, a USPS mailbox, a drift
of fallen leaves, and a STOP sign. A colour threshold answers *"are there orange pixels here"*,
not *"is this a locate mark"*.

Stage two adds seven cheap, named classifiers over the same pixels (no model, no network) and
rejects 122 of 124. The last two — a wet patch by some leaves, and a conference table filmed
when the camera kept rolling indoors — a human removed by eye.

The honest finding is that **this block has not been marked**. For a contractor that is the
answer that stops a crew mobilising over unlocated fibre, and the first version said the
opposite.

Full write-up: https://claude.ai/artifact/7zpNEbGd88rbQGuLsEFFBJ
Pipeline source: https://github.com/jymiller/milbird-walk-the-line


---

# Adjudication — the part that matters to you

Your queue at `/projects/1/evidence` currently holds four items badged **Evidence Only / UNLINKED**,
with blank images, `CONFIDENCE 0.0500`, and an extraction note saying the evidence is unreadable.
The right-hand panel refuses to act:

> This evidence is not linked to a production proposal. Adjudication cannot be performed directly.

That is the exact gap this API closes. **`/api/evidence.json` serves 49 evidence items that are
already linked to a production proposal** — every one carries `linkedTo`, the proposal's
`externalId`. They are adjudicable on arrival, not evidence-only.

## `GET /api/evidence.json`

```jsonc
{
  "proposal": {
    "externalId": "wtl-3167e83ea982483c",
    "stage": 2, "stageName": "Utility Locates",
    "status": "proposed", "quantity": 0, "unit": "each",
    "requiresHumanDecision": true
  },
  "summary": { "evidenceItems": 49, "framesPublished": 49,
               "framesWithACandidate": 2, "humanConfirmed": 0 },
  "items": [ /* 49 of these */ ]
}
```

One item — this is the USPS mailbox the first detector called potable water:

```jsonc
{
  "id": "wtl-ev-0359",
  "kind": "image",
  "url": "https://jymiller.github.io/milbird-walk-the-line/frames/t0359.jpg",
  "linkedTo": "wtl-3167e83ea982483c",     // <-- the proposal. This is what unblocks adjudication.
  "linkedToStage": 2,
  "linkedToStageName": "Utility Locates",
  "videoOffsetSeconds": 359,
  "source": "IMG_2104.MOV",
  "verdict": "rejected",                   // "candidate" | "rejected"
  "extraction": {
    "method": "deterministic — HSV colour match against the APWA Uniform Color Code, then seven geometric and statistical classifiers",
    "colour": "blue",
    "utilityClass": "potable water",
    "areaPx": 37076,
    "rulesFired": ["stroke_width", "pigment_coherence", "ground_band"],
    "measurements": { "stroke_px": 194.9, "extent": 0.67, "pavement_surround": 0.55,
                      "hue_std": 0.58, "sat_mean": 96.1, "exg": -0.1035,
                      "value_cv": 0.223, "centroid_y_frac": 0.608 }
  },
  "explanation": "Rejected: too thick to be a paint stroke (194.9 px inscribed radius, against a limit of 15.1); colour too dull or too mixed for marking paint (96.1 mean saturation, marking paint is above 110); too high in frame to be on the ground (0.608 down the frame, must be below 0.62).",
  "confidence": null,
  "confidenceNote": "No confidence score is published. Every verdict is a named rule and the measurement that triggered it, which a human can check."
}
```

**The images are real and they load.** `https://jymiller.github.io/milbird-walk-the-line/frames/tNNNN.jpg`
— 49 frames, 720px wide, ~70KB each, `image/jpeg`, verified 200. Each one is the actual video frame
with the detected region outlined.

## CORRECTION — read this before you write any code

An earlier version of this doc (and a note John may have sent you) suggested a ~20-minute
client-only integration: one new component, mounted in `EvidenceView` gated on
`evidence.source !== 'field_capture'`. **That does not work, and would have cost you the demo.**

`source` is `text("source").notNull().default("field_capture")` (`lib/db/src/schema/evidence.ts:58`)
and that string appears **exactly once in the whole repo**. Nothing in your database has ever had a
non-default source, so the gate is false for every row and the panel renders against nothing. You
would add the file, click through, and see an empty pane.

Two other corrections while I am at it:

- **The NEW badge on the stage cards is dead code.** `ProjectWorkspace.tsx:252` derives it from
  `captured + queued`. Nothing in the codebase writes either status — the only INSERT hardcodes
  `needs_review` (`operations.ts:387`), the only UPDATE writes `refused|confirmed` (`:639`). It shows
  `-` for every work type on every project and always has. **Do not target it.**
- **`POST /projects/:id/captures` cannot accept our finding.** `quantity: 0` is rejected twice:
  `zod.number().gt(0)` (`lib/api-zod/src/generated/api.ts:275`) → 400, and `normalizeQuantity`'s
  `value <= 0 → null` (`operations.ts:49-53`) → 422. Worse, one zero item fails the **whole batch**.

What *does* work: `GET /projects/:projectId/proposals` filters on
`inArray(status, ["captured","queued","proposed","needs_review"])` with **no quantity predicate**
(`operations.ts:461-478`), and the ADJUDICATE badge is `reviewBacklog.length` — a **row count**, not a
sum (`ProjectWorkspace.tsx:204`). So a `proposed` row with quantity 0 is admitted and increments the
badge. Adjudication is the right surface; the stage cards are not.

---

# The live API

Two hosts, same data. Use whichever suits you.

| | URL | Use it for |
|---|---|---|
| **Worker** | `https://walk-the-line-api.john-2ea.workers.dev` | filtering, single-region lookup, recording decisions |
| **Static** | `https://jymiller.github.io/milbird-walk-the-line/api/` | raw pipeline output, frame images |

Both are CORS-open (`access-control-allow-origin: *`) and need no key.

## The one endpoint that saves you the most work

```
GET https://walk-the-line-api.john-2ea.workers.dev/v1/checks
```

Returns the seven classifiers **already shaped as your `EvidenceCheck`** — `{code, passed, severity,
message}`, exactly the type at `lib/api-spec/openapi.yaml:672-679`. No mapping layer, no transform:

```json
{ "code": "stroke_width", "passed": true, "severity": "info",
  "message": "too thick to be a paint stroke — eliminated 51 of 124 regions" }
```

Nine entries: the seven rules, plus `human_review` (2 escalated, 0 confirmed) and a
`coverage_partial` **warning** stating this is one pass along one side of one street.

Drop straight into the Deterministic Checks list at `ProjectEvidence.tsx:397-423` — it already renders
`c.message` with `{c.code} • {c.severity}` beneath, which is exactly this shape.

> `passed` is `true` on every rule deliberately. These are filters that ran and stand, not pass/fail
> tests of the claim. Marking `on_pavement` "failed" because it fired 98 times would invert its meaning.

## The rest

| Endpoint | Returns |
|---|---|
| `GET /v1/proposal` | the production proposal — `quantity: 0`, `requiresHumanDecision: true` |
| `GET /v1/evidence` | 49 exhibits linked to the proposal, plus `source`, `subject`, `coverage` |
| `GET /v1/evidence?verdict=candidate` | just the 2 that reached a human |
| `GET /v1/evidence/:regionId` | one region with all seven measurements |
| `GET /v1/summary` | the funnel — 124 → 122 → 2 → 0 — and provenance |
| `GET /v1/rules` | the rule bank with its thresholds |
| `POST /v1/decisions` | **record a signed decision** (see below) |
| `GET /v1/decisions` | the decision log with its hash chain |

`GET /v1/evidence` now answers the four questions your Provenance block asks
(`ProjectEvidence.tsx:425-452`):

```jsonc
"source":  { "file": "IMG_2104.MOV",
             "sha256": "6ef6297733a3b39056e248cf08dbf6c93962a683f40e1e5274086593a0a3debf",
             "capturedAt": "2026-09-19T20:56:56Z", "durationSeconds": 404.1 },
"subject": { "street": "Pine St, San Francisco", "workTypeCode": "LOCATE",
             "gpsAnchor": { "lat": 37.7912, "lon": -122.4078, "accuracyMetres": 7.0 } },
"coverage":{ "kind": "partial",
             "note": "One pass along one side of one street. Evidence about what the camera saw, not a survey." }
```

`subject.workTypeCode` is there so you resolve ids instead of hard-coding them — `workTypeId: 2` is a
serial surrogate key, not the stage number.

## Recording a decision

```bash
curl -X POST https://walk-the-line-api.john-2ea.workers.dev/v1/decisions \
  -H 'content-type: application/json' \
  -d '{"decision":"refused","reviewer":"A Name","reason":"Why"}'
```

`decision` is `confirmed | refused | corrected`. **A reviewer name is required** — an unsigned decision
is rejected. **A refusal or correction requires a reason.** Entries are append-only and hash-chained;
`GET /v1/decisions` re-walks the chain and reports `chainIntact`. Refusals are kept beside
confirmations, with their reasons, so the record shows judgement being exercised rather than data being
entered.

This mirrors what your Postgres trigger already enforces — it exists so the machine-side record has the
same property, not to replace yours.

## Two ways in, pick by how much time you have

**Fast (client only, ~20 min).** New `WalkTheLinePanel.tsx` that fetches `/v1/summary` and `/v1/checks`
and renders the funnel plus the nine checks in the Deterministic Checks visual grammar. Mount it in
`EvidenceView` (`ProjectEvidence.tsx:351-355`) **unconditionally, or behind a `?wtl=1` query param —
not behind `evidence.source`**, which is the mistake above. It renders immediately with no server work.

**Real (server, ~45–60 min).** New `POST /api/projects/:projectId/external-findings` route that, in one
transaction, resolves site `PROJECT-{id}` / crew `CREW-C1` / work type `LOCATE` (all seeded in
`operational-foundation.ts`), inserts a `productionItemsTable` row with `quantity: "0.00"` (the column is
`numeric(14,2).notNull()` — zero is legal at the DB, `projects.ts:205`) and `status: "proposed"`, writes
a `productionAuditEventsTable` row with `actor: "pipeline:walk-the-line"`, and inserts an
`evidenceItemsTable` row with `productionItemId` set and `checks` from `/v1/checks`.

Do **not** route it through `/captures` — see the correction above. The three existing unique indexes on
`externalId` make re-ingest idempotent for free.

> **Heads up either way:** `productionItemId` must be non-null on the evidence row. If it stays null the
> item becomes a standalone `ev-` card that dead-ends at *"This evidence is not linked to a production
> proposal. Adjudication cannot be performed directly."* (`ProjectEvidence.tsx:88-94, 300-303`).

## Context — why the number is zero

The first detector thresholded video frames for APWA locate colours and reported 53 marks. Before
publishing, we opened the four largest: a red-painted doorstep, a USPS mailbox, a drift of fallen leaves,
and a STOP sign. A colour threshold answers *"are there orange pixels here"*, not *"is this a locate
mark"*.

Stage two adds the seven classifiers and rejects 122 of 124. The last two — a wet patch by some leaves,
and a conference table filmed when the camera kept rolling indoors — a human removed by eye.

**The honest finding is that this block has not been marked.** For a contractor that is the answer that
stops a crew mobilising over unlocated fibre, and the first version said the opposite.

Full write-up: https://claude.ai/artifact/7zpNEbGd88rbQGuLsEFFBJ
Pipeline source: https://github.com/jymiller/milbird-walk-the-line

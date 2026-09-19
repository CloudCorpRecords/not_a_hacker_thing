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

## Drop-in

```tsx
const BASE = 'https://jymiller.github.io/milbird-walk-the-line';

const { proposal, summary, items } = await (await fetch(`${BASE}/api/evidence.json`)).json();

// These are NOT evidence-only. Render them as linked.
items.forEach(it => {
  it.linkedTo === proposal.externalId;  // true for all 49
});
```

For your extraction panel, swap the two fields:

| Your panel shows today | Serve this instead |
|---|---|
| `CONFIDENCE 0.0500` | `item.verdict` — `"candidate"` or `"rejected"`, plus `item.extraction.rulesFired.length` rules |
| `IDENTITY MATCH 0.0500` | `item.extraction.colour` + `item.extraction.utilityClass` |
| `AI EXPLANATION: "The provided evidence is unreadable/blank…"` | `item.explanation` — a derived sentence naming each rule and the number that triggered it |

`confidence` is deliberately `null`. A reviewer can argue with *"194.9px against a limit of 15.1"*.
Nobody can argue with `0.05`.

## What the adjudicator is being asked to decide

The proposal is `quantity: 0` — **this block has not been marked.** The 49 items are the evidence
behind that zero: 124 colour-matched regions examined, 122 rejected by named rule, 2 escalated to a
human, none confirmed. The decision in front of the reviewer is *"do you accept that no utility
locate marking exists on this segment?"* — and every frame that produced that answer is one click away.

**Watch out:** a `quantity: 0` proposal is easy to render as nothing. If your card logic does
`{qty && <Badge/>}` or filters `quantity > 0`, our entire finding disappears from the UI. The zero
is the point — it has to be visible.

## Endpoint summary

| URL | What |
|---|---|
| `/api/evidence.json` | **49 adjudicable evidence items**, each linked to the proposal |
| `/api/stage2.json` | the production proposal itself — `quantity: 0`, `requiresHumanDecision: true` |
| `/api/summary.json` | the funnel: 124 → 122 rejected → 2 to human → 0 confirmed |
| `/api/rules.json` | the seven classifiers, thresholds, and how many each rejected |
| `/api/locates.json` | GeoJSON, all 124 regions with geometry + measurements (for a map layer) |
| `/frames/tNNNN.jpg` | the frame images, 720px, ~70KB |

Ping John with anything that does not fit your schema — the generator is a 120-line Python file and
the shape can change in minutes.

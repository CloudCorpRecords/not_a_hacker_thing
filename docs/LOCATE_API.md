# Locate API v2 — for the Walk the Line front end

> **For Rene.** Live now, no key needed. The short version: the API changed shape and the
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

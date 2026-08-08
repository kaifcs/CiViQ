# MCDM Scoring

Multi-Criteria Decision Making assigns each project a priority score from seven
weighted criteria. The score determines which project yields when two works
collide and cannot proceed together.

**Implementation:** `backend/src/services/mcdmEngine.js`
**Constants:** `backend/src/config/staticConfig.js`

## Invocation

`calculateMCDM(projectData)` is called by `projectsController.createProject`
before the project is persisted, and again by `projectsController.updateProject`
whenever an update touches an input the engine reads — `mcdmInputs`,
`startDate`, `projectType` or `location`. The resulting score and breakdown are
written to `mcdmScore` and `mcdmBreakdown`.

An update that touches none of those fields does not re-score, so renaming a
project or changing its contractor leaves the score alone. A project's score
therefore always reflects its current inputs rather than only the ones supplied
at creation — which matters because `mcdmScore` is the value
`conflictsController.resolveConflict` compares when deciding which project
yields.

## Return value

```json
{
  "score": 7.4,
  "breakdown": {
    "conditionSeverity": 7,
    "populationImpact": 5,
    "seasonalCompatibility": 10,
    "executionReadiness": 7,
    "citizenDisruption": 6,
    "infrastructureAge": 8,
    "economicValue": 5
  },
  "outOf100": 74
}
```

Each criterion scores 1–10. `score` is the weighted sum rounded to one decimal;
`outOf100` is the same value on a 0–100 scale.

## Weights

Defined in `staticConfig.mcdmWeights` and totalling 1.00.

| Criterion | Weight |
|---|---|
| Condition severity | 0.26 |
| Population and facility impact | 0.21 |
| Seasonal compatibility | 0.16 |
| Execution readiness | 0.16 |
| Citizen disruption | 0.10 |
| Infrastructure age | 0.08 |
| Economic value | 0.03 |

## Inputs

Supplied under `project.mcdmInputs`:

| Field | Type | Used by |
|---|---|---|
| `conditionRating` | String | Condition severity |
| `incidents` | String[] | Condition severity |
| `lastWorkYear` | Number | Infrastructure age |
| `tenderStatus` | String | Execution readiness |
| `contractorAssigned` | Boolean | Execution readiness |
| `roadClosure` | String | Citizen disruption |
| `utilityDisruption` | String[] | Citizen disruption |
| `disruptionDays` | Number | Citizen disruption |

Two criteria take no input at all — `populationImpact` and `economicValue` are
assigned the neutral constant `mcdmEngine.NEUTRAL_SCORE` (5) for every project,
because this deployment has no data source for either. See
[Unmeasured criteria](#unmeasured-criteria).

The engine also reads `projectData.projectType`, `projectData.startDate` and
`projectData.location.ward`.

## Criterion 1 — Condition severity (0.26)

The heaviest criterion: how badly the asset needs work.

Base score from `conditionRating`:

| Rating | Score |
|---|---|
| `critical` | 10 |
| `poor` | 7 |
| `fair` | 4 |
| `good` | 2 |
| unrecognised or absent | 5 |

Two adjustments, each capped at 10:

- `+2` when `incidents` includes `accidents`.
- Citizen corroboration from the same ward over the preceding 180 days —
  `+2` above 20 complaints, `+1` above 10.

The complaint count is a live query against the `complaints` collection filtered
by `location.ward` and `createdAt`, served by the
`{ "location.ward": 1, createdAt: 1 }` index. This is the only criterion that
reads the database.

## Criterion 2 — Population and facility impact (0.21)

**Not measured.** Assigned `NEUTRAL_SCORE` (5) for every project. There is no
ward population register, facility index or catchment figure anywhere in this
system, and nothing is collected from the officer, so there is no input to
compute from. See [Unmeasured criteria](#unmeasured-criteria).

## Criterion 3 — Seasonal compatibility (0.16)

Whether the start month suits the work type, using the Ghaziabad calendar in
`staticConfig.seasonal`: monsoon June–September, dry season October–March,
pre-monsoon April–May.

| Project type | Monsoon | Dry season | Pre-monsoon |
|---|---|---|---|
| `road`, `sewage` | 1 | 10 | 6 |
| `parks` | 10 | 4 | 4 |
| `water`, `electricity`, `other` | 8 | 8 | 8 |

Surface work is heavily penalised during monsoon and rewarded in the dry season.
Planting benefits from monsoon. Underground and overhead work is treated as
season-independent at a constant 8.

## Criterion 4 — Execution readiness (0.16)

How ready the work is to begin.

| `tenderStatus` | Score |
|---|---|
| `complete` | 8 |
| `in_process` | 5 |
| `planning` | 2 |
| unrecognised or absent | 5 |

`+2`, capped at 10, when `contractorAssigned` is true.

## Criterion 5 — Citizen disruption (0.10)

Inverted: less disruption scores higher.

| `roadClosure` | Score |
|---|---|
| `full` | 2 |
| `partial` | 6 |
| `none` | 10 |
| unrecognised or absent | 6 |

Penalties, each flooring at 1:

- `-2` for two or more entries in `utilityDisruption`, `-1` for exactly one.
- `-2` when `disruptionDays` exceeds 30.

## Criterion 6 — Infrastructure age (0.08)

Asset age against its expected lifecycle.

```
age   = currentYear - (lastWorkYear || currentYear - 5)
ratio = age / lifecycle[projectType]
```

Lifecycles from `staticConfig.lifecycle`, in years:

| Type | Years |
|---|---|
| `water` | 20 |
| `sewage`, `electricity` | 15 |
| `road`, `other` | 10 |
| `parks` | 8 |

| Ratio | Score |
|---|---|
| ≥ 1.5 | 10 |
| ≥ 1.0 | 8 |
| ≥ 0.5 | 5 |
| < 0.5 | 2 |

An unknown project type falls back to a 10-year lifecycle. A missing
`lastWorkYear` is treated as five years ago.

This is the only criterion that reads the real current year, so a given
project's age score changes over time if recalculated.

## Criterion 7 — Economic value (0.03)

**Not measured.** Assigned `NEUTRAL_SCORE` (5) for every project. The lightest
criterion. `estimatedCost` is stored, but cost is what a project consumes, not
the value it returns; treating one as the other would be an invented mapping.
See [Unmeasured criteria](#unmeasured-criteria).

## Worked example

A `road` project, condition `poor`, starting in January (dry season), tender
`complete` with a contractor assigned, `partial` closure with no utility
disruption, last worked 12 years ago, in a ward with 14 recent complaints:

| Criterion | Score | Weight | Contribution |
|---|---|---|---|
| Condition severity | 7 + 1 = 8 | 0.26 | 2.08 |
| Population impact | 5 (not measured) | 0.21 | 1.05 |
| Seasonal compatibility | 10 | 0.16 | 1.60 |
| Execution readiness | 8 + 2 = 10 | 0.16 | 1.60 |
| Citizen disruption | 6 | 0.10 | 0.60 |
| Infrastructure age | ratio 1.2 → 8 | 0.08 | 0.64 |
| Economic value | 5 (not measured) | 0.03 | 0.15 |
| **Total** | | | **7.72 → 7.7** |

`outOf100` would be 77.

## Use in conflict resolution

When an administrator selects `reject_lower` on a conflict,
`conflictsController.resolveConflict` compares the two projects' `mcdmScore`.
The lower-scoring project is rescheduled. A non-finite score is treated as
`-Infinity`, so a project without a score always yields.

The winning project's end date plus its configured buffer becomes the suggested
new start date — see [GIS.md](GIS.md#buffer-periods).

## Unmeasured criteria

`populationImpact` (0.21) and `economicValue` (0.03) — 24% of the total weight
combined — are **not measured**. No ward population register, catchment figure
or benefit valuation exists in this system; neither value is collected from the
officer, and no external dataset is consulted. `mcdmEngine` exports both the
constant and the list:

```js
const NEUTRAL_SCORE = 5
const UNMEASURED_CRITERIA = ["populationImpact", "economicValue"]
```

**What this means for ranking.** Because both contribute the same value to every
project, they add the same 1.20 to every total. They shift no project relative
to another, so the ordering — and therefore `reject_lower` on a conflict — is
decided entirely by the five criteria that are computed. The absolute score is
inflated by a constant; the ranking is unaffected.

**Why it is not filled in.** Assigning plausible-looking population or economic
figures would put fabricated data behind a quarter of the weight, and would make
the score appear to discriminate between projects on grounds that do not exist.
Re-weighting the remaining five to 1.0 would change every stored score and the
conflict ordering derived from them, so the weights are left as configured.

**How it is surfaced.** `MCDM_CRITERIA` in the frontend marks both
`measured: false`; the breakdown panels show the criterion and its weight,
label it *not measured*, and leave its bar empty rather than drawing the
constant as though it were a score. `Project.mcdmBreakdown` is documented the
same way in the OpenAPI spec.

Closing this properly means sourcing a ward-level population or facility dataset
and a benefit-valuation input, then computing both from stored data — not
defaulting them.

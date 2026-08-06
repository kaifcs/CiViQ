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

Two further inputs are read from `projectData.autoDetected`: `populationScore`
and `economicScore`. Both default to 5 when absent.

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

Taken directly from `projectData.autoDetected.populationScore`, defaulting to 5.
The engine performs no calculation of its own.

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

Taken directly from `projectData.autoDetected.economicScore`, defaulting to 5.
The lightest criterion.

## Worked example

A `road` project, condition `poor`, starting in January (dry season), tender
`complete` with a contractor assigned, `partial` closure with no utility
disruption, last worked 12 years ago, in a ward with 14 recent complaints and no
`autoDetected` data:

| Criterion | Score | Weight | Contribution |
|---|---|---|---|
| Condition severity | 7 + 1 = 8 | 0.26 | 2.08 |
| Population impact | 5 (default) | 0.21 | 1.05 |
| Seasonal compatibility | 10 | 0.16 | 1.60 |
| Execution readiness | 8 + 2 = 10 | 0.16 | 1.60 |
| Citizen disruption | 6 | 0.10 | 0.60 |
| Infrastructure age | ratio 1.2 → 8 | 0.08 | 0.64 |
| Economic value | 5 (default) | 0.03 | 0.15 |
| **Total** | | | **7.72 → 7.7** |

`outOf100` would be 77.

## Use in conflict resolution

When an administrator selects `reject_lower` on a conflict,
`conflictsController.resolveConflict` compares the two projects' `mcdmScore`.
The lower-scoring project is rescheduled. A non-finite score is treated as
`-Infinity`, so a project without a score always yields.

The winning project's end date plus its configured buffer becomes the suggested
new start date — see [GIS.md](GIS.md#buffer-periods).

## Known constraints

`populationImpact` and `economicValue` — 24% of the total weight combined —
depend on `projectData.autoDetected`, which no route populates. Both therefore
resolve to their default of 5 for every project created through the API, making
them constant contributors that do not differentiate projects.

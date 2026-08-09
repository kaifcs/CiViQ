# GIS and Clash Detection

Two related capabilities: server-side spatial analysis that decides whether two
works collide, and client-side map rendering.

| Concern | Location |
|---|---|
| Clash detection | `backend/src/services/clashDetection.js` |
| Spatial constants | `backend/src/config/staticConfig.js` |
| Map rendering | `frontend/src/gis/` |

## Clash detection

`detectClashes(newProject)` returns an array of clash records. It is called from
`projectsController.createProject` after the project is persisted, from
`projectsController.updateProject` whenever an update touches `location`,
`startDate`, `endDate` or `projectType`, and from
`conflictsController.officerRespond` when an officer proposes a new date.

On update the caller goes through `reconcileProjectClashes`, which reuses an
existing `Conflict` for a pair rather than creating a second one, and deletes a
`pending` conflict the re-run no longer finds. Conflicts an administrator or
officer has already actioned are never removed.

A clash is raised only when **all three** tests pass: the works are close
enough, their dates overlap, and their work types are incompatible.

### Step 1 — Candidate selection

A cheap database pre-filter narrowing the set before any distance maths.

```js
{
  status: { $in: ["pending", "approved", "active"] },
  _id: { $ne: newProject._id },
  isActive: { $ne: false },
  $or: [ { "location.ward": ward }, boundingBox ]
}
```

Only live projects are candidates: `rejected`, `completed` and `rescheduled`
works are excluded by the status filter, and soft-deleted records by `isActive`.
A project never clashes with itself.

The `$or` makes the candidate set a strict superset of possible clashes — either
the same ward or within a coordinate bounding box. The ward clause is omitted
when the project has no ward, and the bounding-box clause when its coordinates
are not finite.

The box is sized by `MAX_PAIR_BUFFER_M`, the widest buffer any two projects
could combine to:

```
(max(geoBuffer) + max(sizeBuffer.extra)) × 2 = (30 + 40) × 2 = 140 metres
```

Doubling accounts for both projects contributing a buffer, so the pre-filter can
never exclude a real clash.

Latitude degrees are converted with a fixed 111 320 m per degree; longitude
degrees are divided additionally by `cos(latitude)`, floored at 1e-6 to avoid
division by zero near the poles.

Candidates are read with only `location`, `projectType`, `startDate` and
`endDate` projected, as lean objects.

### Step 2 — Geographic test

Exact great-circle distance between centre points, using the haversine formula
with an Earth radius of 6 371 000 m.

Each project contributes its own buffer, and the pair clashes when

```
distance ≤ buffer(A) + buffer(B)
```

A buffer is a base value by project type plus an extra by footprint area:

| Project type | Base (m) |
|---|---|
| `road` | 30 |
| `sewage` | 20 |
| `water`, `other` | 15 |
| `electricity`, `parks` | 10 |

| Area (m²) | Extra (m) |
|---|---|
| ≤ 5 000 | 0 |
| ≤ 20 000 | 10 |
| ≤ 50 000 | 20 |
| ≤ 100 000 | 30 |
| above | 40 |

An unrecognised project type falls back to a 15 m base. A missing area is
treated as 0.

### Step 3 — Timeline test

```js
start1 <= end2 && start2 <= end1
```

Inclusive at both ends: two works whose dates merely touch are treated as
overlapping, because two crews on the same ground on the same day is precisely
the collision being detected.

### Step 4 — Work-type test

`staticConfig.conflictMatrix` classifies each ordered pair as `incompatible`,
`conditional` or `compatible`. A `compatible` pair raises no clash.

|  | road | water | electricity | sewage | parks |
|---|---|---|---|---|---|
| **road** | incompatible | incompatible | conditional | incompatible | conditional |
| **water** | incompatible | incompatible | compatible | incompatible | compatible |
| **electricity** | conditional | compatible | incompatible | compatible | compatible |
| **sewage** | incompatible | incompatible | compatible | incompatible | compatible |
| **parks** | conditional | compatible | compatible | compatible | incompatible |

The matrix has no `other` row or column. Any pair involving `other` falls
through the lookup to the `compatible` default and never raises a clash.

### Result

```js
{
  projectId: ObjectId,
  severity: "incompatible" | "conditional",
  clashTypes: ["geographic", "timeline", "worktype"],
  distance: 11
}
```

`severity` is the matrix verdict. `clashTypes` is constant by construction —
reaching this point means all three tests matched. `distance` is rounded to
whole metres.

The caller creates a `Conflict` per clash, reusing an existing one for the same
pair when present.

`Project.hasClash` and `Project.clashes` are then rewritten from the Conflict
collection for **both** projects in every pair touched, never accumulated at the
call site:

```
clashes  === the Conflict rows referencing this project
hasClash === clashes.length > 0
```

Deriving them is what keeps the two sides of a pair in agreement. Accumulating
let them drift in both directions: a collision was recorded against the project
being saved but never against its counterpart, so the officer already holding
the ground saw no clash on their own project; and when a stale `pending` row was
later deleted, the counterpart's `clashes` was pulled but its `hasClash` was
not, leaving a warning nothing could clear.

## Buffer periods

`getSuggestedStartDate(project)` returns the blocking project's `endDate` plus a
recovery period from `staticConfig.bufferDays`. It is used by
`conflictsController.resolveConflict` when rescheduling the lower-scoring
project.

| Project type | Days |
|---|---|
| `road` | 14 |
| `water`, `sewage` | 10 |
| `electricity`, `other` | 7 |
| `parks` | 3 |

`bufferDays` is keyed by the same coarse `Project.projectType` values used
throughout the application, so every lookup resolves directly without falling
back to the default.

## Map rendering

Leaflet 1.9 with `leaflet.markercluster` and `leaflet.heat`. The module exposes
one public surface through `frontend/src/gis/index.js`.

### Configuration — `gis/config.js`

| Constant | Value |
|---|---|
| `DEFAULT_CENTER` | 28.6692, 77.4538 (Ghaziabad) |
| `DEFAULT_ZOOM` | 12 |
| `MIN_ZOOM` / `MAX_ZOOM` | 10 / 18 |
| `CITY_BOUNDS` | south 28.55, west 77.28, north 28.78, east 77.58 |
| `TILE_LAYER` | OpenStreetMap raster, max zoom 19, ODbL attribution |
| `FIT_BOUNDS_PADDING` | `[24, 24]` |

No centre, zoom or tile source is hardcoded elsewhere in the module.

### Layer stacking

Layers name a Leaflet pane rather than setting a z-index at the call site, so
ordering is decided in one place. Panes sit between Leaflet's `overlayPane`
(400) and `shadowPane` (500).

| Pane | z-index | Layer |
|---|---|---|
| `civiq-utility` | 410 | Utility assets |
| `civiq-department` | 420 | Department-owned assets |
| `civiq-project` | 430 | Projects |
| `civiq-complaint` | 440 | Citizen reports |
| `civiq-conflict` | 450 | Conflicts |

Broad network geometry sits underneath and individual citizen reports on top.
The heatmap is not in this scheme: `leaflet.heat` pins its canvas to the
built-in `overlayPane` at 400, below every pane above, which is where a density
surface belongs.

### Coordinate primitives — `gis/coordinates.js`

Pure functions with no map-provider or model knowledge.

| Group | Functions |
|---|---|
| Validation | `isValidLatitude`, `isValidLongitude`, `isValidCoordinate` |
| Normalisation | `normalizeCoordinate`, `normalizeCoordinates` |
| Ordering | `fromPosition`, `toPosition`, `toLatLngTuple`, `fromLatLngTuple` |
| Bounds | `boundsOf`, `centerOfBounds`, `centerOf`, `isValidBounds`, `boundingBoxAround`, `padBounds`, `toBoundsTuple` |
| Distance | `distanceBetween` |

`normalizeCoordinate` accepts every shape used across the codebase —
`{lat,lng}`, `{latitude,longitude}`, `{lon}` and the adapted
`{centerLat,centerLng}` — and returns a canonical `{lat,lng}`, or `null` when the
input is absent or out of range. An unusable coordinate never becomes a default
point.

Ordering conversions are explicit rather than inferred, because a
`[number, number]` pair is ambiguous: GeoJSON positions are `[lng, lat]` and
Leaflet tuples are `[lat, lng]`.

`distanceBetween` uses the same haversine formula and Earth radius as the
backend clash engine, so the map and the conflict list agree about separation.

### Layers — `gis/layers/`

| Layer | Renders |
|---|---|
| `MarkerLayer` | Generic point layer with optional clustering |
| `ProjectLayer` | Project markers |
| `ComplaintLayer` | Complaint markers |
| `DepartmentLayer` | Department-owned assets, coloured by department |
| `UtilityLayer` | Utility assets |
| `ConflictLayer` | Lines between clashing projects |
| `GeoJSONLayer` | Arbitrary GeoJSON geometry |
| `LocationMap` | One record's location, for the detail screens |
| `HeatmapLayer` | Density surface |
| `HeatmapLegend` | Heatmap scale |

Each has a matching `*Popup` component, plus the shared `PopupCard`.

## Authoring

Two components write geometry; nothing else in the application does.

| Component | Writes |
|---|---|
| `PointPicker` | One coordinate, by click or marker drag. Backs `Complaint.location.coords` on the public form and `Project.location.centerCoords` in the wizard. |
| `GeometryEditor` | `Project.location.geoJSON` — a `LineString` or `Polygon` built from clicked vertices. |

Both validate through the same helpers a value from the API passes through:
`normalizeCoordinate` rejects an out-of-range click, and `geometryModes.buildGeometry`
delegates to the `geojson.js` constructors, which own `[lng, lat]` ordering,
ring closure and the minimum vertex counts. `buildGeometry` returns `null`
until the shape is valid, and the wizard omits `geoJSON` from the payload
entirely when it is null — so a half-drawn outline is never sent, and a project
without a shape stores no geometry rather than an empty object the
`UtilityLayer` would then have to guard against.

Geometry persists through the ordinary `POST`/`PUT /api/projects` routes:
`location` is whitelisted as a whole, so no endpoint was added. Editing a
project re-parses the stored geometry back into vertices, so an edit continues
from the saved shape instead of silently replacing it.

`MarkerLayer` is generic: callers supply how to locate, style, draw and describe
a record, so one implementation serves every point layer. Three rendering
decisions are deliberate:

- Handlers are read through a ref, so changing a callback never tears down the
  layer and rebuilds every marker.
- Popups are bound in function form, so popup markup is never built for markers
  the user does not click.
- Selection repaints only the two markers whose state changed, rather than
  rebuilding the layer.

Clustering uses `disableClusteringAtZoom: 17` and `maxClusterRadius: 55`, with
cluster badges rendered into the layer's own pane so a layer stacks as one unit.

### Map instance sharing

`MapContainer` creates the Leaflet map and provides it through `MapContext`;
layers read it with `useMap`. The context object lives in its own module
(`gis/map-context.js`) separate from the provider component, because a module
exporting both a value and a component breaks react-refresh.

### Loading

Leaflet is imported only by screens behind a `lazy()` route: `AdminMap` and
`OfficerMap`, the project, complaint and conflict detail screens for admin and
officer, `OfficerProjectNew`, and the citizen `CitizenProjectDetail` and
`CitizenComplaintNew`. The GIS bundle therefore stays off the critical path —
the eagerly loaded routes are `Login`, `CitizenHome` and the three role
dashboards, none of which import Leaflet.

One module on the eager path does import from `gis/`: `components/uiStyles.js`
takes `PROJECT_STATUS_COLORS` from `gis/projectStyles`. That file is pure
configuration with no imports of its own, so it does not drag Leaflet into the
initial bundle.

## Test coverage

| Suite | Covers |
|---|---|
| `backend/test/integration/clashDetection.test.js` | Severity classification, each of the three non-clash reasons independently, touching timelines, live-status filtering, soft-delete exclusion, self-clash, multiple clashes, ward-independent bounding-box selection |
| `frontend/test/gis.test.js` | Range validation, `{lat:0,lng:0}` treated as valid, coordinate-shape normalisation, both ordering conversions, bounds, bounding box, haversine distance against known separations |

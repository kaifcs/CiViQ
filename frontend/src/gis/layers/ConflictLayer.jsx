import { useMemo } from "react"
import MarkerLayer from "./MarkerLayer"
import GeoJSONLayer from "./GeoJSONLayer"
import ConflictPopup from "./ConflictPopup"
import { lineString } from "../geojson"
import { conflictLineStyle, conflictMarkerStyle } from "../conflictStyles"
import { createGlyphIcon } from "../markerIcons"
import { LAYER_PANES } from "../config"

/**
 * Conflicts detected by the backend, drawn as a dashed connector between the
 * two conflicting projects with a warning marker at each end.
 *
 * Composes the two existing primitives rather than adding a third: GeoJSONLayer
 * draws the connectors, MarkerLayer draws the endpoints. Neither is modified.
 *
 * GEOMETRY: the connector is a two-point segment between the projects' real
 * stored coordinates. The relationship is explicit in the data (project1 /
 * project2) and both endpoints are stored values — nothing is interpolated or
 * routed. A conflict missing either coordinate is omitted entirely rather than
 * drawn from a guessed position.
 */
export default function ConflictLayer({
  conflicts = [],
  selectedId = null,
  onSelect,
  showPopup = true,
  showEndpoints = true,
}) {
  // Only conflicts where the backend supplied both coordinates can be drawn.
  const drawable = useMemo(
    () => conflicts.filter((c) => c.projectACoords && c.projectBCoords),
    [conflicts]
  )

  // One endpoint record per side, keyed so the two never collide in the
  // marker layer's bookkeeping.
  const endpoints = useMemo(
    () =>
      drawable.flatMap((c) => [
        { ...c.projectACoords, id: `${c.id}:a`, conflictId: c.id, severity: c.severity, status: c.status, title: c.projectATitle, conflict: c },
        { ...c.projectBCoords, id: `${c.id}:b`, conflictId: c.id, severity: c.severity, status: c.status, title: c.projectBTitle, conflict: c },
      ]),
    [drawable]
  )

  return (
    <>
      <GeoJSONLayer
        records={drawable}
        getGeometry={(c) => lineString([c.projectACoords, c.projectBCoords])}
        getStyle={conflictLineStyle}
        renderPopup={showPopup ? (c) => <ConflictPopup conflict={c} /> : undefined}
        selectedId={selectedId}
        onSelect={onSelect}
        pane={LAYER_PANES.conflict.name}
      />
      {showEndpoints && (
        <MarkerLayer
          records={endpoints}
          getStyle={conflictMarkerStyle}
          createIcon={createGlyphIcon}
          getTitle={(e) => e.title || "Conflicting project"}
          renderPopup={showPopup ? (e) => <ConflictPopup conflict={e.conflict} /> : undefined}
          onSelect={onSelect ? (_, e) => onSelect(e.conflictId, e.conflict) : undefined}
          // Endpoints are indicators, not a cluster: collapsing the two ends of
          // a conflict into one badge would hide the relationship the layer exists
          // to show.
          cluster={false}
          pane={LAYER_PANES.conflict.name}
        />
      )}
    </>
  )
}

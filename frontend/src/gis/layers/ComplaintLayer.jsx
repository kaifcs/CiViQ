import MarkerLayer from "./MarkerLayer"
import ComplaintPopup from "./ComplaintPopup"
import { complaintMarkerStyle } from "../complaintStyles"
import { createGlyphIcon } from "../markerIcons"
import { LAYER_PANES } from "../config"

/**
 * Complaint markers on the map. Deliberately thin, like ProjectLayer: it binds
 * complaint styling, the category glyph and the complaint popup to the generic
 * MarkerLayer and adds no behaviour of its own.
 *
 * Independent by construction — it owns its own Leaflet layer group, holds no
 * reference to any other layer, and unmounting it removes only its own markers.
 * Accepts the adapted complaint view models the screens already hold, so it
 * performs no fetching.
 */
export default function ComplaintLayer({
  complaints = [],
  selectedId = null,
  onSelect,
  cluster = true,
  showPopup = true,
}) {
  return (
    <MarkerLayer
      records={complaints}
      getStyle={complaintMarkerStyle}
      createIcon={createGlyphIcon}
      getTitle={(complaint) => `${complaint.issueType} · ${complaint.cnrId || ""}`.trim()}
      renderPopup={showPopup ? (complaint) => <ComplaintPopup complaint={complaint} /> : undefined}
      selectedId={selectedId}
      onSelect={onSelect}
      cluster={cluster}
      pane={LAYER_PANES.complaint.name}
    />
  )
}

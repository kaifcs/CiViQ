import MarkerLayer from "./MarkerLayer"
import ComplaintPopup from "./ComplaintPopup"
import { complaintMarkerStyle } from "../complaintStyles"
import { createGlyphIcon } from "../markerIcons"
import { LAYER_PANES } from "../config"

// Complaint markers on the map. Thin, like ProjectLayer: it binds complaint
// styling, the category glyph and the complaint popup to the generic
// MarkerLayer and adds no behaviour of its own.
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

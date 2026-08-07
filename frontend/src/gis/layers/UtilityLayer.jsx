import GeoJSONLayer from "./GeoJSONLayer"
import UtilityPopup from "./UtilityPopup"
import { utilityStyle } from "../utilityStyles"
import { LAYER_PANES } from "../config"

// Utility infrastructure — pipelines, corridors, service areas — drawn from the
// geometry stored on each record. Vector rather than marker: a record whose only
// location is a centre coordinate is skipped rather than drawn as a corridor.
export default function UtilityLayer({
  assets = [],
  selectedId = null,
  onSelect,
  showPopup = true,
}) {
  return (
    <GeoJSONLayer
      records={assets}
      getStyle={utilityStyle}
      renderPopup={showPopup ? (asset) => <UtilityPopup asset={asset} /> : undefined}
      selectedId={selectedId}
      onSelect={onSelect}
      pane={LAYER_PANES.utility.name}
    />
  )
}

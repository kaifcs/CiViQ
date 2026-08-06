import GeoJSONLayer from "./GeoJSONLayer"
import UtilityPopup from "./UtilityPopup"
import { utilityStyle } from "../utilityStyles"
import { LAYER_PANES } from "../config"

/**
 * Utility infrastructure — pipelines, corridors, service areas — drawn from the
 * geometry stored on each record.
 *
 * Vector rather than marker: a pipeline is a line, not a point. Records whose
 * only location is a centre coordinate are skipped rather than drawn as an
 * invented corridor, so this layer renders exactly the geometry the backend
 * holds and nothing more.
 *
 * Independent by construction: its own layer group and pane, no reference to
 * any other layer.
 */
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

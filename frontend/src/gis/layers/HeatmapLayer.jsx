import { useEffect, useMemo, useRef } from "react"
import L from "leaflet"
import "leaflet.heat"
import { useMap } from "../useMap"
import { coordinateOf } from "../gisService"
import { HEATMAP_DEFAULTS, HEATMAP_GRADIENT, densityWeight } from "../heatmapStyles"

// Spatial density surface over any record set carrying coordinates. Follows the
// same contract as MarkerLayer — `records` plus resolvers, renders null, output
// goes onto the map from useMap() — so it composes without touching them.
export default function HeatmapLayer({
  records = [],
  getCoordinate = coordinateOf,
  getWeight = densityWeight,
  radius = HEATMAP_DEFAULTS.radius,
  blur = HEATMAP_DEFAULTS.blur,
  opacity = HEATMAP_DEFAULTS.opacity,
  maxZoom = HEATMAP_DEFAULTS.maxZoom,
  max = HEATMAP_DEFAULTS.max,
  gradient = HEATMAP_GRADIENT,
}) {
  const map = useMap()
  const layerRef = useRef(null)

  const resolversRef = useRef({})
  resolversRef.current = { getCoordinate, getWeight }

  // [lat, lng, intensity] triples, rebuilt only when the record set changes.
  // Pan and zoom redraw from this cached array, so map interaction issues no
  // work beyond the canvas repaint leaflet.heat does internally.
  const points = useMemo(() => {
    const { getCoordinate: locate, getWeight: weigh } = resolversRef.current
    const out = []
    for (const record of records) {
      const coord = locate(record)
      if (!coord) continue
      out.push([coord.lat, coord.lng, weigh(record)])
    }
    return out
  }, [records])

  // The layer is created once and mutated in place; recreating it on every
  // option change would drop the canvas and flash the map.
  useEffect(() => {
    const layer = L.heatLayer(points, {
      radius, blur, minOpacity: opacity, maxZoom, max, gradient,
    })
    layer.addTo(map)
    layerRef.current = layer

    return () => {
      // leaflet.heat queues redraws with requestAnimationFrame and never cancels
      // them in onRemove, so a frame landing after teardown throws on a null _map.
      // removeLayer must run first, before the draw callbacks are neutralised.
      map.removeLayer(layer)
      if (layer._frame) {
        L.Util.cancelAnimFrame(layer._frame)
        layer._frame = null
      }
      layer._redraw = () => {}
      layer._reset = () => {}
      layerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  useEffect(() => {
    layerRef.current?.setLatLngs(points)
  }, [points])

  useEffect(() => {
    layerRef.current?.setOptions({ radius, blur, minOpacity: opacity, maxZoom, max, gradient })
  }, [radius, blur, opacity, maxZoom, max, gradient])

  return null
}

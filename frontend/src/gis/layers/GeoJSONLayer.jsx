import { useEffect, useRef } from "react"
import L from "leaflet"
import { renderToStaticMarkup } from "react-dom/server"
import { useMap } from "../useMap"
import { geometryOf } from "../gisService"
import { isGeometry, isFeature, isFeatureCollection } from "../geojson"

// Generic vector layer for records carrying stored GeoJSON geometry — corridors,
// pipelines, service areas. The counterpart to MarkerLayer. `pointGeometry` is
// false by default, so a record with only a centre point is skipped.
export default function GeoJSONLayer({
  records = [],
  getGeometry = geometryOf,
  getStyle,
  getKey = (record) => record?.id,
  renderPopup,
  selectedId = null,
  onSelect,
  pointGeometry = false,
  pane,
  popupOptions,
}) {
  const map = useMap()
  const layersRef = useRef(new Map())

  const handlersRef = useRef({})
  handlersRef.current = { getGeometry, getStyle, getKey, renderPopup, onSelect }

  useEffect(() => {
    const { getGeometry: geom, getStyle: style, getKey: key,
      renderPopup: popup, onSelect: select } = handlersRef.current

    const group = L.layerGroup()
    const entries = new Map()

    for (const record of records) {
      const geometry = geom(record)
      if (!isGeometry(geometry) && !isFeature(geometry) && !isFeatureCollection(geometry)) continue

      // A bare Point carries no extent; drawing one here would imply geometry
      // the record does not have.
      const type = isGeometry(geometry) ? geometry.type : geometry?.geometry?.type
      if (!pointGeometry && type === "Point") continue

      const id = key(record)
      const shape = L.geoJSON(geometry, {
        style: () => style(record, { selected: id === selectedId }),
        ...(pane ? { pane } : {}),
      })

      if (popup) {
        shape.bindPopup(() => renderToStaticMarkup(popup(record)), {
          className: "civiq-popup",
          closeButton: true,
          minWidth: 240,
          maxWidth: 300,
          ...popupOptions,
        })
      }

      if (select) shape.on("click", () => select(id, record))

      entries.set(id, { shape, record })
      group.addLayer(shape)
    }

    layersRef.current = entries
    group.addTo(map)

    return () => {
      group.clearLayers()
      map.removeLayer(group)
      layersRef.current = new Map()
    }
    // selectedId is applied by the effect below without rebuilding the layer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, records, pointGeometry, pane, popupOptions])

  // Restyles only the shapes whose selection state actually changed.
  useEffect(() => {
    const { getStyle: style } = handlersRef.current

    for (const [id, entry] of layersRef.current) {
      const selected = id === selectedId
      if (selected === (entry.selected === true)) continue

      entry.selected = selected
      entry.shape.setStyle(style(entry.record, { selected }))
      if (selected && entry.shape.bringToFront) entry.shape.bringToFront()
    }
  }, [selectedId, records])

  return null
}

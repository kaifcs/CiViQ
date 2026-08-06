import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet.markercluster"
// Animation and spiderfy styles only. The library's Default.css is deliberately
// not imported — cluster badges are styled by createClusterIcon.
import "leaflet.markercluster/dist/MarkerCluster.css"
import "./markerLayer.css"
import { renderToStaticMarkup } from "react-dom/server"
import { useMap } from "../useMap"
import { coordinateOf } from "../gisService"
import { createDotIcon, createClusterIcon } from "../markerIcons"

/**
 * Generic marker layer: places one marker per record, optionally clustered, and
 * reports selection upward. It knows nothing about projects or complaints —
 * callers supply how to locate, style, draw and describe a record — so every
 * point layer reuses it.
 *
 * `getStyle` returns a plain style object and `createIcon` turns it into a
 * Leaflet icon, which is what lets one layer draw dots and another draw glyphs
 * without this component learning either vocabulary.
 *
 * Renders null; all output goes onto the Leaflet map from useMap().
 */
export default function MarkerLayer({
  records = [],
  getCoordinate = coordinateOf,
  getStyle,
  createIcon = createDotIcon,
  getKey = (record) => record?.id,
  getTitle,
  renderPopup,
  selectedId = null,
  onSelect,
  cluster = true,
  clusterOptions,
  popupOptions,
  pane,
}) {
  const map = useMap()
  const markersRef = useRef(new Map())

  // Handlers are read through a ref so changing them never forces the layer to
  // be torn down and every marker re-created.
  const handlersRef = useRef({})
  handlersRef.current = { getCoordinate, getStyle, createIcon, getKey, getTitle, renderPopup, onSelect }

  // Markers are rebuilt only when the record set itself changes.
  useEffect(() => {
    const { getCoordinate: locate, getStyle: style, createIcon: icon, getKey: key,
      getTitle: title, renderPopup: popup, onSelect: select } = handlersRef.current

    const group = cluster
      ? L.markerClusterGroup({
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          disableClusteringAtZoom: 17,
          maxClusterRadius: 55,
          iconCreateFunction: (c) => createClusterIcon(c.getChildCount()),
          // Cluster badges share the layer's pane so a layer stacks as one unit.
          ...(pane ? { clusterPane: pane } : {}),
          ...clusterOptions,
        })
      : L.layerGroup()

    const markers = new Map()

    for (const record of records) {
      const coord = locate(record)
      if (!coord) continue

      const id = key(record)
      const marker = L.marker([coord.lat, coord.lng], {
        icon: icon(style(record, { selected: id === selectedId })),
        title: title ? title(record) : undefined,
        riseOnHover: true,
        ...(pane ? { pane } : {}),
      })

      if (popup) {
        // Function form: Leaflet calls this on open, so popup markup is never
        // built for markers the user does not click.
        marker.bindPopup(() => renderToStaticMarkup(popup(record)), {
          className: "civiq-popup",
          closeButton: true,
          minWidth: 240,
          maxWidth: 300,
          ...popupOptions,
        })
      }

      if (select) marker.on("click", () => select(id, record))

      markers.set(id, { marker, record })
      group.addLayer(marker)
    }

    markersRef.current = markers
    group.addTo(map)

    return () => {
      group.clearLayers()
      map.removeLayer(group)
      markersRef.current = new Map()
    }
    // selectedId is intentionally excluded: selection is applied by the effect
    // below without rebuilding the layer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, records, cluster, clusterOptions, popupOptions, pane])

  // Selection repaints only the two markers whose state actually changed.
  useEffect(() => {
    const { getStyle: style, createIcon: icon } = handlersRef.current

    for (const [id, entry] of markersRef.current) {
      const selected = id === selectedId
      const wasSelected = entry.selected === true
      if (selected === wasSelected) continue

      entry.selected = selected
      entry.marker.setIcon(icon(style(entry.record, { selected })))
      if (selected) entry.marker.setZIndexOffset(1000)
      else entry.marker.setZIndexOffset(0)
    }
  }, [selectedId, records])

  return null
}

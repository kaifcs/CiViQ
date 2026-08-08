// Draws and validates LineString/Polygon geometry from map clicks.

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useMap } from './useMap'
import { normalizeCoordinate, toLatLngTuple } from './coordinates'

export default function GeometryEditor({ mode, vertices, onVerticesChange }) {
  const map = useMap()
  const layerRef = useRef(null)

  useEffect(() => {
    function handleClick(event) {
      const coord = normalizeCoordinate({ lat: event.latlng.lat, lng: event.latlng.lng })
      if (coord) onVerticesChange([...vertices, coord])
    }
    map.on('click', handleClick)
    return () => map.off('click', handleClick)
  }, [map, vertices, onVerticesChange])

  // Redraw the small editable layer on each vertex change.
  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.remove()
      layerRef.current = null
    }

    const tuples = vertices.map(toLatLngTuple).filter(Boolean)
    if (tuples.length === 0) return undefined

    const group = L.layerGroup()

    if (tuples.length > 1) {
      const shape = mode === 'Polygon'
        ? L.polygon(tuples, { color: '#5E6AD2', weight: 2, fillOpacity: 0.15 })
        : L.polyline(tuples, { color: '#5E6AD2', weight: 3 })
      group.addLayer(shape)
    }

    // Numbered handles show vertex order while editing.
    tuples.forEach((tuple, index) => {
      group.addLayer(
        L.circleMarker(tuple, {
          radius: 5, color: '#5E6AD2', fillColor: '#FFFFFF', fillOpacity: 1, weight: 2,
        }).bindTooltip(String(index + 1), { permanent: false })
      )
    })

    group.addTo(map)
    layerRef.current = group

    return () => {
      group.remove()
      layerRef.current = null
    }
  }, [map, mode, vertices])

  return null
}
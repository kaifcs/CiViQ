// Read-only map for project, complaint, and conflict locations.
//
// Only stored coordinates are rendered. Records without location show an
// explicit empty state instead of using a misleading city fallback.

import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import MapContainer from './MapContainer'
import { useMap } from './useMap'
import { boundsOf, normalizeCoordinate, toLatLngTuple } from './coordinates'
import { parseGeoJSON } from './geojson'
import GeoJSONLayer from './layers/GeoJSONLayer'
import { DEFAULT_ZOOM } from './config'

function Markers({ points }) {
  const map = useMap()

  useEffect(() => {
    const group = L.layerGroup()
    for (const point of points) {
      const marker = L.circleMarker(toLatLngTuple(point.coord), {
        radius: 8,
        color: point.color || '#5E6AD2',
        fillColor: point.color || '#5E6AD2',
        fillOpacity: 0.85,
        weight: 2,
      })
      if (point.label) marker.bindTooltip(point.label)
      group.addLayer(marker)
    }
    group.addTo(map)
    return () => group.remove()
  }, [map, points])

  return null
}

export default function LocationMap({
  points = [],
  geoJSON,
  height = '200px',
  emptyMessage = 'No location recorded for this record.',
}) {
  // Drop points without usable coordinates.
  const valid = useMemo(
    () => points
      .map((p) => ({ ...p, coord: normalizeCoordinate(p.coord ?? p) }))
      .filter((p) => p.coord),
    [points]
  )

  const geometry = useMemo(() => parseGeoJSON(geoJSON), [geoJSON])

  // Frame multiple points; a single point uses the default zoom.
  const bounds = useMemo(
    () => (valid.length > 1 ? boundsOf(valid.map((p) => p.coord)) || undefined : undefined),
    [valid]
  )

  if (valid.length === 0 && !geometry) {
    return (
      <div
        className="rounded-[8px] flex flex-col items-center justify-center gap-2 bg-[#F8FAFC] dark:bg-[#18181B] border border-[#E5E5E5] dark:border-[#27272A]"
        style={{ height }}
      >
        <svg width="26" height="26" fill="none" viewBox="0 0 24 24" className="text-[#D1D5DB] dark:text-[#374151]" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
        </svg>
        <p className="text-[12px] text-[#9CA3AF] dark:text-[#6B7280] px-4 text-center">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="rounded-[8px] overflow-hidden border border-[#E5E5E5] dark:border-[#27272A]" style={{ height }}>
      <MapContainer
        center={valid[0]?.coord}
        zoom={DEFAULT_ZOOM}
        bounds={bounds}
        options={{ zoomControl: false, attributionControl: true }}
      >
        {/* Render the parsed geometry through the shared GeoJSON layer. */}
        {geometry && (
          <GeoJSONLayer
            records={[{ id: 'geometry' }]}
            getGeometry={() => geometry}
          />
        )}
        {valid.length > 0 && <Markers points={valid} />}
      </MapContainer>
    </div>
  )
}
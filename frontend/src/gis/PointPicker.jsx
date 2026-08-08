// Click-to-place coordinate picker for complaints and project forms.
// Uses shared coordinate validation for both clicks and API values.

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useMap } from './useMap'
import { isValidCoordinate, normalizeCoordinate, toLatLngTuple } from './coordinates'

export default function PointPicker({ value, onChange, draggable = true }) {
  const map = useMap()
  const markerRef = useRef(null)

  // Rebind so the handler always uses the current callback.
  useEffect(() => {
    function handleClick(event) {
      const coord = normalizeCoordinate({ lat: event.latlng.lat, lng: event.latlng.lng })
      if (coord) onChange(coord)
    }
    map.on('click', handleClick)
    return () => map.off('click', handleClick)
  }, [map, onChange])

  useEffect(() => {
    const tuple = isValidCoordinate(value) ? toLatLngTuple(value) : null

    if (!tuple) {
      if (markerRef.current) {
        markerRef.current.remove()
        markerRef.current = null
      }
      return undefined
    }

    if (!markerRef.current) {
      markerRef.current = L.marker(tuple, { draggable }).addTo(map)
      if (draggable) {
        markerRef.current.on('dragend', (event) => {
          const coord = normalizeCoordinate(event.target.getLatLng())
          if (coord) onChange(coord)
        })
      }
    } else {
      markerRef.current.setLatLng(tuple)
    }

    return undefined
  }, [map, value, draggable, onChange])

  // Remove the marker when the component unmounts.
  useEffect(() => () => {
    if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }
  }, [])

  return null
}
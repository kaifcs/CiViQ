import { useContext } from 'react'
import { MapContext } from './map-context'

/**
 * Live map instance for layer components rendered inside <MapContainer>.
 * Children mount only after initialisation, so the instance is never null here.
 */
export function useMap() {
  const map = useContext(MapContext)

  if (!map) {
    throw new Error('useMap must be used inside MapContainer')
  }

  return map
}

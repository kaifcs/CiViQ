import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContext } from './map-context'
import {
  DEFAULT_MAP_OPTIONS,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  TILE_LAYER,
  FIT_BOUNDS_PADDING,
  LAYER_PANES,
} from './config'
import { toLatLngTuple, toBoundsTuple, isValidBounds } from './coordinates'

/**
 * Reusable map surface: owns initialisation, teardown, resize and view
 * synchronisation, and exposes the instance to children through MapContext.
 * Carries no knowledge of projects, complaints or conflicts — layers compose
 * on top as children.
 *
 * Children are expected to be layer components that read the instance via
 * useMap(), attach to it and render null; the host div belongs to Leaflet.
 * `options` applies at construction only — use center/zoom/bounds to drive the
 * view afterwards.
 */
export default function MapContainer({
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  bounds,
  options,
  onReady,
  animate = true,
  className = '',
  style,
  children,
}) {
  const [map, setMap] = useState(null)
  const hasAppliedView = useRef(false)

  // Creation runs from a ref callback rather than an effect so the map is built
  // against a node that is already in the DOM. Empty deps keep the callback
  // identity stable, so React never detaches and rebuilds the map.
  const attachNode = useCallback((node) => {
    if (!node) return undefined

    const instance = L.map(node, { ...DEFAULT_MAP_OPTIONS, ...options })
    L.tileLayer(TILE_LAYER.url, {
      attribution: TILE_LAYER.attribution,
      maxZoom: TILE_LAYER.maxZoom,
    }).addTo(instance)

    // Panes are created once, up front, so layer stacking is fixed by config
    // rather than by the order layers happen to mount in.
    for (const { name, zIndex } of Object.values(LAYER_PANES)) {
      instance.createPane(name).style.zIndex = String(zIndex)
    }

    setMap(instance)
    return () => {
      instance.remove()
      setMap(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // View is synchronised after creation so center/zoom/bounds stay reactive
  // without tearing the instance down. The first application is instant —
  // animating from the default centre on mount reads as a glitch — and every
  // later change flies, which is what makes fit-bounds and zoom-to-selection
  // legible as movement rather than a jump cut.
  useEffect(() => {
    if (!map) return

    const shouldFly = animate && hasAppliedView.current
    hasAppliedView.current = true

    const boundsTuple = isValidBounds(bounds) ? toBoundsTuple(bounds) : null
    if (boundsTuple) {
      const opts = { padding: FIT_BOUNDS_PADDING }
      if (shouldFly) map.flyToBounds(boundsTuple, opts)
      else map.fitBounds(boundsTuple, opts)
      return
    }

    const centerTuple = toLatLngTuple(center)
    if (!centerTuple) return
    if (shouldFly) map.flyTo(centerTuple, zoom)
    else map.setView(centerTuple, zoom)
  }, [map, center, zoom, bounds, animate])

  // Leaflet caches the container size, so a map inside a collapsing sidebar or
  // a tab panel renders grey tiles until it is told the box changed.
  useEffect(() => {
    if (!map) return undefined

    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])

  useEffect(() => {
    if (map && onReady) onReady(map)
  }, [map, onReady])

  return (
    <div
      ref={attachNode}
      className={className}
      style={{ width: '100%', height: '100%', ...style }}
    >
      {map && <MapContext.Provider value={map}>{children}</MapContext.Provider>}
    </div>
  )
}

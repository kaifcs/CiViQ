// Coordinate primitives: validation, normalisation, ordering conversions,
// bounds and distance. Pure functions with no map-provider or model knowledge.

import {
  EARTH_RADIUS_M,
  METERS_PER_DEGREE_LAT,
  LATITUDE_RANGE,
  LONGITUDE_RANGE,
} from "./constants"

const toRadians = (deg) => (deg * Math.PI) / 180

export function isValidLatitude(value) {
  return Number.isFinite(value) && value >= LATITUDE_RANGE.min && value <= LATITUDE_RANGE.max
}

export function isValidLongitude(value) {
  return Number.isFinite(value) && value >= LONGITUDE_RANGE.min && value <= LONGITUDE_RANGE.max
}

export function isValidCoordinate(coord) {
  return !!coord && isValidLatitude(coord.lat) && isValidLongitude(coord.lng)
}

// Accepts the coordinate shapes used across this codebase — {lat,lng},
// {latitude,longitude} and the adapted {centerLat,centerLng} — and returns a
// canonical {lat,lng}, or null when the input is absent or out of range.
export function normalizeCoordinate(input) {
  if (!input || typeof input !== "object") return null

  const lat = firstFinite(input.lat, input.latitude, input.centerLat)
  const lng = firstFinite(input.lng, input.lon, input.longitude, input.centerLng)

  const coord = { lat, lng }
  return isValidCoordinate(coord) ? coord : null
}

function firstFinite(...values) {
  for (const v of values) if (Number.isFinite(v)) return v
  return NaN
}

export function normalizeCoordinates(inputs = []) {
  return inputs.map(normalizeCoordinate).filter(Boolean)
}

// Kept explicit rather than inferred: a [number, number] pair is ambiguous.

// GeoJSON position [lng, lat] -> {lat, lng}.
export function fromPosition(position) {
  if (!Array.isArray(position) || position.length < 2) return null
  return normalizeCoordinate({ lng: position[0], lat: position[1] })
}

// {lat, lng} -> GeoJSON position [lng, lat].
export function toPosition(coord) {
  const c = normalizeCoordinate(coord)
  return c ? [c.lng, c.lat] : null
}

// {lat, lng} -> Leaflet tuple [lat, lng].
export function toLatLngTuple(coord) {
  const c = normalizeCoordinate(coord)
  return c ? [c.lat, c.lng] : null
}

// Leaflet tuple [lat, lng] -> {lat, lng}.
export function fromLatLngTuple(tuple) {
  if (!Array.isArray(tuple) || tuple.length < 2) return null
  return normalizeCoordinate({ lat: tuple[0], lng: tuple[1] })
}


// Axis-aligned bounding box of a coordinate set, or null if none are valid.
export function boundsOf(coords = []) {
  const valid = normalizeCoordinates(coords)
  if (valid.length === 0) return null

  let { lat: south, lng: west } = valid[0]
  let { lat: north, lng: east } = valid[0]

  for (const { lat, lng } of valid) {
    if (lat < south) south = lat
    if (lat > north) north = lat
    if (lng < west) west = lng
    if (lng > east) east = lng
  }
  return { south, west, north, east }
}

export function centerOfBounds(bounds) {
  if (!isValidBounds(bounds)) return null
  return normalizeCoordinate({
    lat: (bounds.south + bounds.north) / 2,
    lng: (bounds.west + bounds.east) / 2,
  })
}

// Arithmetic mean of a coordinate set. Distinct from the bounds centre.
export function centerOf(coords = []) {
  const valid = normalizeCoordinates(coords)
  if (valid.length === 0) return null

  const sum = valid.reduce(
    (acc, c) => ({ lat: acc.lat + c.lat, lng: acc.lng + c.lng }),
    { lat: 0, lng: 0 }
  )
  return normalizeCoordinate({ lat: sum.lat / valid.length, lng: sum.lng / valid.length })
}

export function isValidBounds(bounds) {
  return (
    !!bounds &&
    isValidLatitude(bounds.south) && isValidLatitude(bounds.north) &&
    isValidLongitude(bounds.west) && isValidLongitude(bounds.east) &&
    bounds.south <= bounds.north && bounds.west <= bounds.east
  )
}

// Bounding box of the given radius around a point. Longitude degrees are
// divided by cos(lat), which collapses toward the poles, so the divisor is
// floored to keep the box finite.
export function boundingBoxAround(coord, meters) {
  const c = normalizeCoordinate(coord)
  if (!c || !Number.isFinite(meters) || meters < 0) return null

  const dLat = meters / METERS_PER_DEGREE_LAT
  const cosLat = Math.cos(toRadians(c.lat))
  const dLng = meters / (METERS_PER_DEGREE_LAT * Math.max(Math.abs(cosLat), 1e-6))

  return {
    south: c.lat - dLat,
    west: c.lng - dLng,
    north: c.lat + dLat,
    east: c.lng + dLng,
  }
}

// Grows a bounding box outward by a fixed margin in metres.
export function padBounds(bounds, meters) {
  if (!isValidBounds(bounds) || !Number.isFinite(meters)) return null
  const centre = centerOfBounds(bounds)
  const delta = boundingBoxAround(centre, meters)
  if (!delta) return null

  return {
    south: bounds.south - (centre.lat - delta.south),
    west: bounds.west - (centre.lng - delta.west),
    north: bounds.north + (delta.north - centre.lat),
    east: bounds.east + (delta.east - centre.lng),
  }
}

// Bounds as the nested tuple Leaflet's fitBounds expects.
export function toBoundsTuple(bounds) {
  if (!isValidBounds(bounds)) return null
  return [
    [bounds.south, bounds.west],
    [bounds.north, bounds.east],
  ]
}


// Great-circle distance in metres. Mirrors the backend clash engine.
export function distanceBetween(a, b) {
  const p1 = normalizeCoordinate(a)
  const p2 = normalizeCoordinate(b)
  if (!p1 || !p2) return null

  const dLat = toRadians(p2.lat - p1.lat)
  const dLng = toRadians(p2.lng - p1.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(p1.lat)) * Math.cos(toRadians(p2.lat)) * Math.sin(dLng / 2) ** 2

  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

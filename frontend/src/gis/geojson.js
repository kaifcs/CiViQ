// GeoJSON constructors, guards and readers (RFC 7946). Positions are
// [lng, lat]; use the coordinate helpers rather than building tuples by hand.

import { GEOMETRY_TYPES, GEOJSON_TYPES } from "./constants"
import { boundsOf, fromPosition, toPosition, normalizeCoordinate } from "./coordinates"

// Each returns null on invalid input so callers never emit malformed geometry.

export function point(coord) {
  const position = toPosition(coord)
  return position ? { type: GEOMETRY_TYPES.POINT, coordinates: position } : null
}

export function lineString(coords = []) {
  const positions = coords.map(toPosition).filter(Boolean)
  // A LineString needs at least two distinct positions to be renderable.
  if (positions.length < 2) return null
  return { type: GEOMETRY_TYPES.LINE_STRING, coordinates: positions }
}

// Builds a Polygon from an outer ring plus optional holes. Rings are closed
// automatically when the caller omits the repeated final position.
export function polygon(outerRing = [], holes = []) {
  const outer = closeRing(outerRing.map(toPosition).filter(Boolean))
  if (!outer) return null

  const inner = holes.map((h) => closeRing(h.map(toPosition).filter(Boolean))).filter(Boolean)
  return { type: GEOMETRY_TYPES.POLYGON, coordinates: [outer, ...inner] }
}

export function multiPolygon(polygons = []) {
  const rings = polygons
    .map((p) => (p?.type === GEOMETRY_TYPES.POLYGON ? p.coordinates : null))
    .filter(Boolean)
  if (rings.length === 0) return null
  return { type: GEOMETRY_TYPES.MULTI_POLYGON, coordinates: rings }
}

function closeRing(positions) {
  // A linear ring is 4+ positions with the first repeated last, so 3 distinct
  // corners is the minimum valid input.
  if (positions.length < 3) return null
  const first = positions[0]
  const last = positions[positions.length - 1]
  const closed = first[0] === last[0] && first[1] === last[1]
  return closed ? positions : [...positions, first]
}

export function feature(geometry, properties = {}, id) {
  if (!isGeometry(geometry)) return null
  const result = { type: GEOJSON_TYPES.FEATURE, geometry, properties }
  if (id !== undefined) result.id = id
  return result
}

export function featureCollection(features = []) {
  return {
    type: GEOJSON_TYPES.FEATURE_COLLECTION,
    features: features.filter(isFeature),
  }
}


export function isGeometry(value) {
  return (
    !!value &&
    Object.values(GEOMETRY_TYPES).includes(value.type) &&
    Array.isArray(value.coordinates)
  )
}

export function isFeature(value) {
  return !!value && value.type === GEOJSON_TYPES.FEATURE && isGeometry(value.geometry)
}

export function isFeatureCollection(value) {
  return (
    !!value &&
    value.type === GEOJSON_TYPES.FEATURE_COLLECTION &&
    Array.isArray(value.features)
  )
}

// Geometry type of a geometry, Feature or FeatureCollection; null otherwise.
export function geometryTypeOf(value) {
  if (isGeometry(value)) return value.type
  if (isFeature(value)) return value.geometry.type
  return null
}


// Every coordinate in a geometry, Feature or FeatureCollection, flattened to
// canonical {lat,lng}, so callers need not re-implement the per-type nesting.
export function coordinatesOf(value) {
  if (isFeatureCollection(value)) return value.features.flatMap(coordinatesOf)
  if (isFeature(value)) return coordinatesOf(value.geometry)
  if (!isGeometry(value)) return []

  switch (value.type) {
    case GEOMETRY_TYPES.POINT:
      return [fromPosition(value.coordinates)].filter(Boolean)
    case GEOMETRY_TYPES.LINE_STRING:
      return value.coordinates.map(fromPosition).filter(Boolean)
    case GEOMETRY_TYPES.POLYGON:
      return value.coordinates.flat().map(fromPosition).filter(Boolean)
    case GEOMETRY_TYPES.MULTI_POLYGON:
      return value.coordinates.flat(2).map(fromPosition).filter(Boolean)
    default:
      return []
  }
}

// Bounding box of any GeoJSON value, or null when it carries no coordinates.
export function boundsOfGeoJSON(value) {
  return boundsOf(coordinatesOf(value))
}

// Parses a value that may already be GeoJSON or a JSON string of it. Returns
// null rather than throwing, so a malformed stored geometry degrades to "no
// geometry" instead of breaking the render.
export function parseGeoJSON(value) {
  if (typeof value === "string") {
    try {
      return parseGeoJSON(JSON.parse(value))
    } catch {
      return null
    }
  }
  if (isFeatureCollection(value) || isFeature(value) || isGeometry(value)) return value
  return null
}

// Convenience wrapper for the most common conversion: a coordinate to a Feature.
export function pointFeature(coord, properties = {}, id) {
  const c = normalizeCoordinate(coord)
  return c ? feature(point(c), properties, id) : null
}

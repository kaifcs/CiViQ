// Integration boundary between CIVIQ records and GIS primitives.
//
// The coordinate and GeoJSON modules stay free of application knowledge; this
// is the one place that understands where a project or complaint keeps its
// location. Conversion only — no styling, layers or business rules.

import {
  normalizeCoordinate,
  normalizeCoordinates,
  boundsOf,
  centerOf,
  isValidBounds,
} from "./coordinates"
import {
  point,
  feature,
  featureCollection,
  parseGeoJSON,
  coordinatesOf,
} from "./geojson"
import { DEFAULT_CENTER, CITY_BOUNDS } from "./config"

/**
 * Location of a record, accepting both the adapted view models the screens use
 * ({centerLat,centerLng} for projects, {lat,lng} for complaints) and the raw
 * API documents (location.centerCoords / location.coords).
 */
export function coordinateOf(record) {
  if (!record || typeof record !== "object") return null

  const direct = normalizeCoordinate(record)
  if (direct) return direct

  const location = record.location || record._raw?.location
  if (!location) return null

  return normalizeCoordinate(location.centerCoords) || normalizeCoordinate(location.coords)
}

export function coordinatesOfRecords(records = []) {
  return records.map(coordinateOf).filter(Boolean)
}

/**
 * Stored geometry for a record, falling back to a Point at its coordinate.
 *
 * Project.location.geoJSON is a free-form object on the backend, so it is
 * parsed defensively. The Point fallback is the record's real stored location,
 * never an invented shape; records with no usable coordinate return null.
 */
export function geometryOf(record) {
  const stored = parseGeoJSON(record?.location?.geoJSON ?? record?._raw?.location?.geoJSON)
  if (stored) return stored

  const coord = coordinateOf(record)
  return coord ? point(coord) : null
}

/**
 * GeoJSON Feature for a record. `properties` is supplied by the caller so this
 * module stays unaware of which fields a given layer wants to style by.
 */
export function toFeature(record, properties = {}) {
  const geometry = geometryOf(record)
  return geometry ? feature(geometry, properties, record?.id) : null
}

export function toFeatureCollection(records = [], buildProperties = () => ({})) {
  return featureCollection(
    records.map((record) => toFeature(record, buildProperties(record))).filter(Boolean)
  )
}

/**
 * Bounds covering a set of records, using full stored geometry where present
 * so extended shapes are not clipped to their centre point.
 */
export function boundsOfRecords(records = []) {
  const coords = records.flatMap((record) => {
    const geometry = geometryOf(record)
    return geometry ? coordinatesOf(geometry) : []
  })
  return boundsOf(normalizeCoordinates(coords))
}

/**
 * Viewport for a record set: their bounds when derivable, otherwise the
 * configured city extent. Keeps every map from re-implementing that fallback.
 */
export function viewportForRecords(records = []) {
  const bounds = boundsOfRecords(records)
  return isValidBounds(bounds) ? bounds : CITY_BOUNDS
}

export function centerForRecords(records = []) {
  return centerOf(coordinatesOfRecords(records)) || DEFAULT_CENTER
}

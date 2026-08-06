// GIS primitives — coordinate validation, ordering and spatial maths.
//
// These are the functions that decide whether a project appears on the map and
// where. A silent regression here does not throw; it puts municipal works in
// the wrong place, so validation and the [lng,lat] / [lat,lng] boundary are
// covered closely.
//
// Rendering itself is not tested here — that needs a DOM and a Leaflet
// instance. See the frontend testing note in the S5 summary.

import test from "node:test"
import assert from "node:assert/strict"

import {
  isValidLatitude, isValidLongitude, isValidCoordinate,
  normalizeCoordinate, normalizeCoordinates,
  fromPosition, toPosition, toLatLngTuple, fromLatLngTuple,
  boundsOf, centerOfBounds, isValidBounds, boundingBoxAround, toBoundsTuple,
  distanceBetween,
} from "../src/gis/coordinates.js"

import { coordinateOf, coordinatesOfRecords, boundsOfRecords } from "../src/gis/gisService.js"

const GHAZIABAD = { lat: 28.6692, lng: 77.4538 }

test("latitude and longitude ranges are enforced", () => {
  assert.equal(isValidLatitude(28.67), true)
  assert.equal(isValidLatitude(90), true)
  assert.equal(isValidLatitude(-90), true)
  assert.equal(isValidLatitude(90.1), false)
  assert.equal(isValidLatitude(-90.1), false)

  assert.equal(isValidLongitude(77.45), true)
  assert.equal(isValidLongitude(180), true)
  assert.equal(isValidLongitude(180.1), false)
  assert.equal(isValidLongitude(-180.1), false)
})

test("non-numeric input is never a valid coordinate", () => {
  for (const bad of [null, undefined, NaN, Infinity, "28.6", {}, []]) {
    assert.equal(isValidLatitude(bad), false, `latitude accepted ${JSON.stringify(bad)}`)
    assert.equal(isValidLongitude(bad), false, `longitude accepted ${JSON.stringify(bad)}`)
  }
  assert.equal(isValidCoordinate(null), false)
  assert.equal(isValidCoordinate({ lat: 28.6 }), false)
  assert.equal(isValidCoordinate({ lat: "28.6", lng: "77.4" }), false)
})

// 0,0 is in the Atlantic — a real coordinate, and the classic false negative
// for a truthiness check. It must survive.
test("the null island coordinate is valid", () => {
  assert.equal(isValidCoordinate({ lat: 0, lng: 0 }), true)
  assert.deepEqual(normalizeCoordinate({ lat: 0, lng: 0 }), { lat: 0, lng: 0 })
})

test("every coordinate shape in the codebase normalises to {lat,lng}", () => {
  assert.deepEqual(normalizeCoordinate({ lat: 28.6692, lng: 77.4538 }), GHAZIABAD)
  assert.deepEqual(normalizeCoordinate({ latitude: 28.6692, longitude: 77.4538 }), GHAZIABAD)
  assert.deepEqual(normalizeCoordinate({ centerLat: 28.6692, centerLng: 77.4538 }), GHAZIABAD)
  assert.deepEqual(normalizeCoordinate({ lat: 28.6692, lon: 77.4538 }), GHAZIABAD)
})

test("an out-of-range or absent coordinate normalises to null, not to a wrong point", () => {
  assert.equal(normalizeCoordinate({ lat: 999, lng: 77 }), null)
  assert.equal(normalizeCoordinate({ lat: 28.6 }), null)
  assert.equal(normalizeCoordinate(null), null)
  assert.equal(normalizeCoordinate("28.6,77.4"), null)
})

test("normalizeCoordinates drops unusable entries rather than yielding holes", () => {
  const result = normalizeCoordinates([
    { lat: 28.6, lng: 77.4 }, null, { lat: 999, lng: 0 }, { lat: 28.7, lng: 77.5 },
  ])
  assert.equal(result.length, 2)
  assert.ok(result.every((c) => isValidCoordinate(c)))
})

// GeoJSON is [lng, lat]; Leaflet is [lat, lng]. Swapping them puts Ghaziabad
// in the Indian Ocean, so both directions are pinned explicitly.
test("GeoJSON position order is [lng, lat]", () => {
  assert.deepEqual(fromPosition([77.4538, 28.6692]), GHAZIABAD)
  assert.deepEqual(toPosition(GHAZIABAD), [77.4538, 28.6692])
})

test("Leaflet tuple order is [lat, lng]", () => {
  assert.deepEqual(toLatLngTuple(GHAZIABAD), [28.6692, 77.4538])
  assert.deepEqual(fromLatLngTuple([28.6692, 77.4538]), GHAZIABAD)
})

test("a round trip through either ordering is lossless", () => {
  assert.deepEqual(fromPosition(toPosition(GHAZIABAD)), GHAZIABAD)
  assert.deepEqual(fromLatLngTuple(toLatLngTuple(GHAZIABAD)), GHAZIABAD)
})

test("malformed positions and tuples are rejected", () => {
  for (const bad of [null, [], [1], "1,2", {}]) {
    assert.equal(fromPosition(bad), null, `fromPosition accepted ${JSON.stringify(bad)}`)
  }
  // A swapped pair is out of latitude range and must not silently pass.
  assert.equal(fromPosition([28.6692, 177.4538]), null)
})

test("bounds enclose every supplied coordinate", () => {
  const coords = [
    { lat: 28.60, lng: 77.40 },
    { lat: 28.70, lng: 77.50 },
    { lat: 28.65, lng: 77.45 },
  ]
  const bounds = boundsOf(coords)
  assert.deepEqual(bounds, { south: 28.60, west: 77.40, north: 28.70, east: 77.50 })
  assert.equal(isValidBounds(bounds), true)
  for (const c of coords) {
    assert.ok(c.lat >= bounds.south && c.lat <= bounds.north, "latitude outside bounds")
    assert.ok(c.lng >= bounds.west && c.lng <= bounds.east, "longitude outside bounds")
  }
})

test("bounds of a single point are degenerate but valid", () => {
  const bounds = boundsOf([GHAZIABAD])
  assert.deepEqual(centerOfBounds(bounds), GHAZIABAD)
  assert.equal(isValidBounds(bounds), true)
})

test("bounds of nothing are null rather than a zero point", () => {
  assert.equal(boundsOf([]), null)
  assert.equal(boundsOf(), null)
  assert.equal(boundsOf([null, { lat: 999, lng: 999 }]), null)
})

test("toBoundsTuple emits Leaflet's nested [[s,w],[n,e]] order", () => {
  const bounds = { south: 28.6, west: 77.4, north: 28.7, east: 77.5 }
  assert.deepEqual(toBoundsTuple(bounds), [[28.6, 77.4], [28.7, 77.5]])
  assert.equal(toBoundsTuple(null), null)
})

// Mirrors the backend clash engine's bounding box, which sizes the cheap
// pre-filter. Too small and real clashes are missed.
test("a bounding box encloses its centre and grows with distance", () => {
  const box = boundingBoxAround(GHAZIABAD, 500)
  assert.ok(box.south < GHAZIABAD.lat && box.north > GHAZIABAD.lat)
  assert.ok(box.west < GHAZIABAD.lng && box.east > GHAZIABAD.lng)

  const wider = boundingBoxAround(GHAZIABAD, 5000)
  assert.ok(wider.north > box.north && wider.south < box.south)

  // ~500 m north of centre is roughly 0.0045° of latitude.
  assert.ok(Math.abs((box.north - GHAZIABAD.lat) - 0.00449) < 0.0002)
})

test("a bounding box rejects nonsense input", () => {
  assert.equal(boundingBoxAround(GHAZIABAD, -1), null)
  assert.equal(boundingBoxAround(GHAZIABAD, NaN), null)
  assert.equal(boundingBoxAround(null, 500), null)
})

// The frontend distance must agree with the backend clash engine, or the map
// and the conflict list will disagree about whether two works collide.
test("great-circle distance matches known separations", () => {
  assert.equal(distanceBetween(GHAZIABAD, GHAZIABAD), 0)

  // One degree of latitude is ~111.2 km anywhere on the globe.
  const oneDegree = distanceBetween({ lat: 28, lng: 77 }, { lat: 29, lng: 77 })
  assert.ok(Math.abs(oneDegree - 111_195) < 500, `got ${oneDegree} m`)

  // 0.001° of latitude is ~111 m — the scale clash buffers work at.
  const short = distanceBetween(GHAZIABAD, { lat: GHAZIABAD.lat + 0.001, lng: GHAZIABAD.lng })
  assert.ok(Math.abs(short - 111) < 2, `got ${short} m`)
})

test("distance is symmetric and null-safe", () => {
  const a = { lat: 28.6, lng: 77.4 }
  const b = { lat: 28.7, lng: 77.5 }
  assert.equal(distanceBetween(a, b), distanceBetween(b, a))
  assert.equal(distanceBetween(a, null), null)
  assert.equal(distanceBetween(null, null), null)
})

// gisService is the one place that knows how a record carries its location.
test("coordinateOf reads the shapes records actually use", () => {
  assert.deepEqual(coordinateOf({ centerLat: 28.6692, centerLng: 77.4538 }), GHAZIABAD)
  assert.deepEqual(coordinateOf({ lat: 28.6692, lng: 77.4538 }), GHAZIABAD)
  assert.equal(coordinateOf({}), null)
  assert.equal(coordinateOf(null), null)
})

test("records without a usable location are excluded from the map", () => {
  const records = [
    { id: 1, centerLat: 28.6, centerLng: 77.4 },
    { id: 2 },
    { id: 3, centerLat: null, centerLng: null },
    { id: 4, centerLat: 28.7, centerLng: 77.5 },
  ]
  const coords = coordinatesOfRecords(records)
  assert.equal(coords.length, 2, "unplottable records must not become a default point")
  assert.ok(isValidBounds(boundsOfRecords(records)))
  assert.equal(boundsOfRecords([{ id: 1 }]), null)
  assert.equal(boundsOfRecords([]), null)
})

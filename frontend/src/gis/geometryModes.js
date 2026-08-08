// Shared geometry modes and constructors for the editor.

import { lineString, polygon, isGeometry } from "./geojson"

// Supported editable shapes.
export const GEOMETRY_MODES = {
  LineString: { label: "Line / corridor", minVertices: 2 },
  Polygon: { label: "Area / polygon", minVertices: 3 },
}

// Builds valid geometry from vertices or returns null.
export function buildGeometry(mode, vertices = []) {
  const geometry = mode === "Polygon" ? polygon(vertices) : lineString(vertices)
  return isGeometry(geometry) ? geometry : null
}
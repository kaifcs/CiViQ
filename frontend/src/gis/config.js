// Central map configuration. Nothing in the GIS module hardcodes a centre,
// zoom or tile source; all of it resolves here so a future provider swap or
// self-hosted tile server is a single-file change.

import { CRS } from "./constants"

// Ghaziabad, Uttar Pradesh — the municipality this deployment serves. Matches
// the coordinate range of the project and complaint records the API returns.
export const DEFAULT_CENTER = { lat: 28.6692, lng: 77.4538 }

export const DEFAULT_ZOOM = 12
export const MIN_ZOOM = 10
export const MAX_ZOOM = 18

// Approximate municipal extent, used only to frame the initial viewport when no
// data-driven bounds are available. Not an authoritative boundary.
export const CITY_BOUNDS = {
  south: 28.55,
  west: 77.28,
  north: 28.78,
  east: 77.58,
}

// OpenStreetMap raster tiles. Attribution is required by the ODbL licence and
// is rendered by the map control, not optional chrome.
export const TILE_LAYER = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}

export const MAP_CRS = CRS.WEB_MERCATOR

// Baseline Leaflet options. Callers override per instance rather than editing
// this object.
export const DEFAULT_MAP_OPTIONS = {
  center: DEFAULT_CENTER,
  zoom: DEFAULT_ZOOM,
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
  zoomControl: true,
  attributionControl: true,
  scrollWheelZoom: true,
}

// Padding applied when fitting the map to computed bounds, so geometry at the
// edge of the extent is not clipped by the viewport border.
export const FIT_BOUNDS_PADDING = [24, 24]

/**
 * Deterministic stacking order for GIS layers, expressed as Leaflet panes.
 *
 * Layers name a pane instead of setting z-index at the call site, so the order
 * is decided here alone. Values sit between Leaflet's overlayPane (400) and
 * shadowPane (500); popups and tooltips keep their own higher panes.
 *
 * Ordered least to most specific: broad network geometry underneath, individual
 * citizen reports on top.
 */
export const LAYER_PANES = {
  utility: { name: "civiq-utility", zIndex: 410 },
  department: { name: "civiq-department", zIndex: 420 },
  project: { name: "civiq-project", zIndex: 430 },
  complaint: { name: "civiq-complaint", zIndex: 440 },
  // Reserved for the conflict layer, which renders above everything else.
  conflict: { name: "civiq-conflict", zIndex: 450 },
}

// The heatmap is not listed above because leaflet.heat pins its canvas to
// Leaflet's built-in overlayPane (z-index 400). That is below every pane here,
// which is exactly where a density surface belongs — under the markers.
export const HEATMAP_PANE_ZINDEX = 400

export const LAYER_ORDER = Object.keys(LAYER_PANES)

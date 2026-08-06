// Shared GIS constants. Values mirror the backend spatial engine
// (services/clashDetection.js) so client and server agree on distance maths.

export const EARTH_RADIUS_M = 6371000

// Latitude degrees are near-constant in length; longitude degrees are scaled by
// cos(latitude) at the point of interest.
export const METERS_PER_DEGREE_LAT = 111320

export const LATITUDE_RANGE = { min: -90, max: 90 }
export const LONGITUDE_RANGE = { min: -180, max: 180 }

// GeoJSON positions are [longitude, latitude]; Leaflet expects [latitude,
// longitude]. Mixing the two is the most common defect in map code, so every
// conversion in this module goes through an explicitly named helper.
export const COORDINATE_ORDER = {
  geoJSON: "lng,lat",
  leaflet: "lat,lng",
}

export const GEOMETRY_TYPES = {
  POINT: "Point",
  LINE_STRING: "LineString",
  POLYGON: "Polygon",
  MULTI_POLYGON: "MultiPolygon",
}

export const GEOJSON_TYPES = {
  FEATURE: "Feature",
  FEATURE_COLLECTION: "FeatureCollection",
}

// GeoJSON is defined in WGS84; Leaflet projects to Web Mercator for tiles.
export const CRS = {
  GEOGRAPHIC: "EPSG:4326",
  WEB_MERCATOR: "EPSG:3857",
}

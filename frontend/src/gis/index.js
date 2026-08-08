// Public surface of the GIS module. Consumers import from here rather than
// reaching into individual files, so internals can be reorganised freely.

export { default as MapContainer } from "./MapContainer"
export { useMap } from "./useMap"
export { MapContext } from "./map-context"

// Authoring primitives — the only writers of stored geometry.
export { default as LocationMap } from "./LocationMap"
export { default as PointPicker } from "./PointPicker"
export { default as GeometryEditor } from "./GeometryEditor"
export { GEOMETRY_MODES, buildGeometry } from "./geometryModes"

export { default as MarkerLayer } from "./layers/MarkerLayer"
export { default as PopupCard } from "./layers/PopupCard"
export { default as ProjectLayer } from "./layers/ProjectLayer"
export { default as ProjectPopup } from "./layers/ProjectPopup"
export { default as ComplaintLayer } from "./layers/ComplaintLayer"
export { default as ComplaintPopup } from "./layers/ComplaintPopup"
export { default as GeoJSONLayer } from "./layers/GeoJSONLayer"
export { default as DepartmentLayer } from "./layers/DepartmentLayer"
export { default as DepartmentPopup } from "./layers/DepartmentPopup"
export { default as UtilityLayer } from "./layers/UtilityLayer"
export { default as UtilityPopup } from "./layers/UtilityPopup"
export { default as ConflictLayer } from "./layers/ConflictLayer"
export { default as ConflictPopup } from "./layers/ConflictPopup"
export { default as HeatmapLayer } from "./layers/HeatmapLayer"
export { default as HeatmapLegend } from "./layers/HeatmapLegend"

export * from "./projectStyles"
export * as complaintStyles from "./complaintStyles"
export * as departmentStyles from "./departmentStyles"
export * as utilityStyles from "./utilityStyles"
export * as conflictStyles from "./conflictStyles"
export * as heatmapStyles from "./heatmapStyles"
export * from "./markerIcons"
export * from "./format"

export * from "./config"
export * from "./constants"
export * from "./coordinates"
export * as geojson from "./geojson"
export * as gis from "./gisService"

import { useCallback, useMemo } from "react"
import MarkerLayer from "./MarkerLayer"
import DepartmentPopup from "./DepartmentPopup"
import { departmentColorIndex, departmentMarkerStyle } from "../departmentStyles"
import { LAYER_PANES } from "../config"

// Department-owned assets on the map, coloured by the owning department.
// Departments carry no coordinates of their own, so the layer plots the assets
// they own: "who owns what, where", where the project layer shows work state.
export default function DepartmentLayer({
  records = [],
  departments = [],
  selectedId = null,
  onSelect,
  cluster = true,
  showPopup = true,
}) {
  // Colours come from the stored Department.color, so the lookup rebuilds only
  // when the department list itself changes.
  const colorIndex = useMemo(() => departmentColorIndex(departments), [departments])

  const getStyle = useCallback(
    (record, state) => departmentMarkerStyle(record, state, colorIndex),
    [colorIndex]
  )

  const renderPopup = useCallback(
    (record) => <DepartmentPopup record={record} colorIndex={colorIndex} />,
    [colorIndex]
  )

  return (
    <MarkerLayer
      records={records}
      getStyle={getStyle}
      getTitle={(record) => `${record.title} · ${record.department || ""}`.trim()}
      renderPopup={showPopup ? renderPopup : undefined}
      selectedId={selectedId}
      onSelect={onSelect}
      cluster={cluster}
      pane={LAYER_PANES.department.name}
    />
  )
}

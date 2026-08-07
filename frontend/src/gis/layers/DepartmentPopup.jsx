import PopupCard from "./PopupCard"
import { projectStatusColor, projectStatusLabel } from "../projectStyles"
import { departmentColor } from "../departmentStyles"

// Read-only summary of a department-owned asset shown inside a map popup.
export default function DepartmentPopup({ record, colorIndex }) {
  if (!record) return null

  return (
    <PopupCard
      title={record.title}
      subtitle={record.projectId}
      badges={[
        { label: record.departmentFull || record.department, color: departmentColor(record.department, colorIndex) },
        { label: projectStatusLabel(record.status), color: projectStatusColor(record.status) },
      ]}
      rows={[
        { label: "Officer", value: record.officerName },
        { label: "Ward", value: record.ward },
        { label: "Address", value: record.address },
      ]}
      description={record.description}
    />
  )
}

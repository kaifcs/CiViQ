import PopupCard from "./PopupCard"
import { formatMapDate } from "../format"
import { projectStatusColor, projectStatusLabel } from "../projectStyles"

// Read-only project summary shown inside a map popup.
export default function ProjectPopup({ project }) {
  if (!project) return null

  return (
    <PopupCard
      title={project.title}
      subtitle={project.projectId}
      badges={[
        { label: projectStatusLabel(project.status), color: projectStatusColor(project.status) },
        { label: project.priority },
      ]}
      rows={[
        { label: "Department", value: project.departmentFull || project.department },
        { label: "Ward", value: project.ward },
        { label: "Start", value: formatMapDate(project.startDate) },
        { label: "End", value: formatMapDate(project.endDate) },
      ]}
      description={project.description}
    />
  )
}

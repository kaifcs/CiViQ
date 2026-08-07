import MarkerLayer from "./MarkerLayer"
import ProjectPopup from "./ProjectPopup"
import { projectMarkerStyle } from "../projectStyles"
import { LAYER_PANES } from "../config"

// Project markers on the map. Thin by design: it binds project styling and the
// project popup to the generic MarkerLayer, which keeps marker rendering free
// of project business rules.
export default function ProjectLayer({
  projects = [],
  selectedId = null,
  onSelect,
  cluster = true,
  showPopup = true,
}) {
  return (
    <MarkerLayer
      records={projects}
      getStyle={projectMarkerStyle}
      getTitle={(project) => project.title}
      renderPopup={showPopup ? (project) => <ProjectPopup project={project} /> : undefined}
      selectedId={selectedId}
      onSelect={onSelect}
      cluster={cluster}
      pane={LAYER_PANES.project.name}
    />
  )
}

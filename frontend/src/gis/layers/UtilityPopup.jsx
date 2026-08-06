import PopupCard from "./PopupCard"
import { projectStatusColor, projectStatusLabel } from "../projectStyles"
import { utilityTypeColor, utilityTypeLabel, utilityTypeOf } from "../utilityStyles"

/**
 * Read-only summary of a utility asset.
 *
 * Presentation only: every value arrives through props, it issues no requests,
 * holds no state, performs no navigation and exposes no actions.
 */
export default function UtilityPopup({ asset }) {
  if (!asset) return null

  const type = utilityTypeOf(asset)

  return (
    <PopupCard
      title={asset.title}
      subtitle={asset.projectId}
      badges={[
        { label: utilityTypeLabel(type), color: utilityTypeColor(type) },
        { label: projectStatusLabel(asset.status), color: projectStatusColor(asset.status) },
      ]}
      rows={[
        { label: "Ward", value: asset.ward },
        { label: "Department", value: asset.departmentFull || asset.department },
        { label: "Address", value: asset.address },
      ]}
      description={asset.description}
    />
  )
}

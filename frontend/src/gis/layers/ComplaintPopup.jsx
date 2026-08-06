import PopupCard from "./PopupCard"
import { formatMapDate } from "../format"
import { complaintCategoryColor, complaintStatusColor, complaintStatusLabel } from "../complaintStyles"

/**
 * Read-only complaint summary shown inside a map popup.
 *
 * Presentation only: every value arrives through `complaint`, it issues no
 * requests, holds no state, performs no navigation and exposes no actions.
 *
 * Severity is absent because the Complaint model has no such field; see the
 * note in gis/complaintStyles.js.
 */
export default function ComplaintPopup({ complaint }) {
  if (!complaint) return null

  return (
    <PopupCard
      title={complaint.issueType}
      subtitle={complaint.cnrId}
      badges={[
        { label: complaintStatusLabel(complaint.status), color: complaintStatusColor(complaint.status) },
        { label: complaint.issueType, color: complaintCategoryColor(complaint.issueType) },
      ]}
      rows={[
        { label: "Department", value: complaint.department },
        { label: "Ward", value: complaint.ward },
        { label: "Address", value: complaint.address },
        { label: "Filed", value: formatMapDate(complaint.filedAt) },
      ]}
      description={complaint.description}
    />
  )
}

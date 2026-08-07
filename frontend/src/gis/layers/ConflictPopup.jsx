import PopupCard from "./PopupCard"
import { formatMapDate } from "../format"
import {
  conflictSeverityColor,
  conflictSeverityLabel,
  conflictStatusLabel,
  conflictTypesLabel,
} from "../conflictStyles"

// Read-only summary of a backend-detected conflict. "Recommendation" is the
// coordination note or suggested date the backend stored; the model carries no
// dedicated recommendation field.
export default function ConflictPopup({ conflict }) {
  if (!conflict) return null

  const recommendation =
    conflict.adminNote ||
    (conflict.suggestedDate ? `Reschedule to ${formatMapDate(conflict.suggestedDate)}` : null)

  return (
    <PopupCard
      title={conflict.overlapDescription}
      subtitle={conflict.id}
      badges={[
        {
          label: conflictSeverityLabel(conflict.severity),
          color: conflictSeverityColor(conflict.severity),
        },
        { label: conflictStatusLabel(conflict.status) },
      ]}
      rows={[
        { label: "Project A", value: conflict.projectATitle },
        { label: "Project B", value: conflict.projectBTitle },
        { label: "Type", value: conflictTypesLabel(conflict.clashTypes) },
        { label: "Overlap", value: conflict.overlapDays ? `${conflict.overlapDays} days` : null },
        { label: "Detected", value: formatMapDate(conflict.detectedAt) },
        { label: "Updated", value: formatMapDate(conflict.updatedAt || conflict.detectedAt) },
      ]}
      description={recommendation}
    />
  )
}

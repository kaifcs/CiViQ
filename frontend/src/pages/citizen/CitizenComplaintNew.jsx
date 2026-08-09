// Public complaint intake; the API controls workflow fields and rate limits.

import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import CitizenNav from "./CitizenNav"
import { complaintsApi, normaliseError, ISSUE_TYPE_OPTIONS } from "../../services"
import { useWards } from "../../hooks/useResources"
import { MapContainer, PointPicker } from "../../gis"
import { DEFAULT_CENTER, DEFAULT_ZOOM } from "../../gis/config"
import { COMPLAINT_STATUS_CONFIG } from "../../components/uiStyles"
import { Button, Container, Eyebrow, Field, Notice, Surface } from "../../components/public/ui"
import { FOCUS_RING, inputCls, selectChevron, selectCls, textareaCls } from "../../components/public/controlStyles"

const MIN_DESCRIPTION = 10

// Complaint workflow stages, labelled from the shared status table.
const STAGES = ["submitted", "acknowledged", "in_progress", "resolved"]

function StageList() {
  return (
    <ol className="flex flex-col gap-2.5">
      {STAGES.map((stage) => (
        <li key={stage} className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: COMPLAINT_STATUS_CONFIG[stage].dot }} />
          <span className="text-[13px] text-[#475569]">{COMPLAINT_STATUS_CONFIG[stage].text}</span>
        </li>
      ))}
    </ol>
  )
}

function ReferenceNumber({ cnrId }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(cnrId)
      setCopied(true)
    } catch {
      // Clipboard access can be denied; the number stays selectable on screen.
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-[0.09em]">Reference number</p>
      <p className="text-[26px] sm:text-[30px] font-bold font-mono text-[#5E6AD2] tracking-tight break-all">{cnrId}</p>
      <Button variant="secondary" size="sm" onClick={copy}>
        {copied ? "Copied" : "Copy reference"}
      </Button>
    </div>
  )
}

export default function CitizenComplaintNew() {
  const { data: wards } = useWards()

  const [issueType, setIssueType] = useState("")
  const [description, setDescription] = useState("")
  const [address, setAddress] = useState("")
  const [ward, setWard] = useState("")
  const [coords, setCoords] = useState(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [touched, setTouched] = useState(false)

  // Confirmation is shown only after a successful create response.
  const [created, setCreated] = useState(null)

  // Match the API requirements before submitting.
  const errors = useMemo(
    () => ({
      issueType: issueType ? "" : "Choose the kind of issue.",
      description:
        description.trim().length >= MIN_DESCRIPTION
          ? ""
          : `Describe the issue in at least ${MIN_DESCRIPTION} characters.`,
      coords: coords ? "" : "Place a pin on the map to mark where the issue is.",
    }),
    [issueType, description, coords]
  )

  const isValid = Object.values(errors).every((e) => !e)

  async function handleSubmit(event) {
    event.preventDefault()
    setTouched(true)

    if (!isValid || submitting) return

    setSubmitError("")
    setSubmitting(true)

    try {
      const complaint = await complaintsApi.create({
        issueType,
        description: description.trim(),
        location: {
          address: address.trim() || undefined,
          ward: ward || undefined,
          coords: { lat: coords.lat, lng: coords.lng },
        },
      })

      setCreated(complaint)
    } catch (err) {
      setSubmitError(normaliseError(err).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (created) {
    return (
      <CitizenNav>
        <Container width="narrow" className="py-10 sm:py-16">
          <Surface className="p-6 sm:p-10 flex flex-col items-center gap-6 text-center">
            <span className="w-12 h-12 rounded-full bg-[#F0FDF4] flex items-center justify-center text-[#16A34A]">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>

            <div className="flex flex-col gap-2">
              <h1 className="text-[22px] sm:text-[26px] font-bold text-[#0D2145] tracking-[-0.02em]">Complaint registered</h1>
              <p className="text-[14px] text-[#64748B] leading-relaxed max-w-[46ch]">
                Keep this reference number — it is how you track progress.
              </p>
            </div>

            <div className="w-full py-6 px-4 rounded-[10px] bg-[#F8FAFC] border border-[#E2E8F0]">
              <ReferenceNumber cnrId={created.cnrId} />
            </div>

            <div className="w-full text-left flex flex-col gap-3 pt-2 border-t border-[#F1F5F9]">
              <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-[0.09em] pt-4">Stages a complaint moves through</p>
              <StageList />
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <Button to={`/complaints/track?cnr=${encodeURIComponent(created.cnrId)}`} size="md" className="w-full sm:w-auto">
                Track this complaint
              </Button>
              <Button to="/home" variant="secondary" size="md" className="w-full sm:w-auto">Back to home</Button>
            </div>
          </Surface>
        </Container>
      </CitizenNav>
    )
  }

  return (
    <CitizenNav>
      <div className="bg-[#FFFFFF] border-b border-[#E2E8F0]">
        <Container className="py-10 sm:py-12 flex flex-col gap-3">
          <Eyebrow>Residents</Eyebrow>
          <h1 className="text-[28px] sm:text-[34px] font-bold text-[#0D2145] tracking-[-0.03em] leading-tight">
            Report an issue
          </h1>
          <p className="text-[14.5px] text-[#64748B] leading-relaxed max-w-[62ch]">
            No account needed. You will receive a reference number to track progress.
          </p>
        </Container>
      </div>

      <Container className="py-6 sm:py-8">
        <div className="grid gap-5 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
          <Surface as="form" onSubmit={handleSubmit} noValidate className="p-5 sm:p-7 flex flex-col gap-6">
            <Field id="issue-type" label="What is the issue?" error={touched ? errors.issueType : ""}>
              <select
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                style={selectChevron}
                className={selectCls}
              >
                <option value="">Select an issue type</option>
                {ISSUE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            <Field
              id="description"
              label="Describe it"
              hint="What is wrong, and since when? Avoid personal details."
              error={touched ? errors.description : ""}
            >
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="e.g. Deep pothole across the left lane near the school gate, widening since the last rain."
                className={textareaCls}
              />
            </Field>

            <div className="grid gap-6 sm:grid-cols-2">
              <Field id="ward" label="Ward" optional hint="It helps routing.">
                <select
                  value={ward}
                  onChange={(e) => setWard(e.target.value)}
                  style={selectChevron}
                  className={selectCls}
                >
                  <option value="">Not sure</option>
                  {(wards || []).map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </Field>

              <Field id="address" label="Nearest address or landmark" optional>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Near Ram Nagar crossing"
                  className={inputCls}
                />
              </Field>
            </div>

            <div role="group" aria-labelledby="map-label" aria-describedby="map-hint" className="flex flex-col gap-1.5">
              <p id="map-label" className="text-[13px] font-semibold text-[#0F172A]">Where is it?</p>
              <div className="rounded-[8px] overflow-hidden border border-[#E2E8F0]" style={{ height: "300px" }}>
                <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM}>
                  <PointPicker value={coords} onChange={setCoords} />
                </MapContainer>
              </div>
              {coords ? (
                <p id="map-hint" className="text-[12px] text-[#64748B] tabular-nums">
                  Pin at {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </p>
              ) : (
                <p id="map-hint" className="text-[12px] text-[#94A3B8]">Click the map to drop a pin. Drag the pin to adjust.</p>
              )}
              {touched && errors.coords && (
                <p className="text-[12px] font-medium text-[#DC2626]">{errors.coords}</p>
              )}
            </div>

            {submitError && (
              <div role="alert">
                <Notice tone="danger">{submitError}</Notice>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-5 border-t border-[#F1F5F9]">
              <Button type="submit" size="md" disabled={submitting} className="w-full sm:w-auto">
                {submitting ? "Submitting..." : "Submit complaint"}
              </Button>
              <Link
                to="/complaints/track"
                className={`text-[13px] font-medium text-[#5E6AD2] hover:text-[#4A56C1] transition-colors text-center rounded-[4px] ${FOCUS_RING}`}
              >
                Already have a reference number?
              </Link>
            </div>
          </Surface>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-[88px]">
            <Surface className="p-5 flex flex-col gap-3">
              <h2 className="text-[13.5px] font-semibold text-[#0D2145]">Before you submit</h2>
              <ul className="flex flex-col gap-2 text-[13px] text-[#64748B] leading-relaxed">
                <li>Say what is wrong and roughly since when.</li>
                <li>Drop the pin as close to the problem as you can.</li>
                <li>Leave out personal details — complaints are handled by municipal staff.</li>
              </ul>
            </Surface>

            <Surface className="p-5 flex flex-col gap-3">
              <h2 className="text-[13.5px] font-semibold text-[#0D2145]">Stages a complaint moves through</h2>
              <StageList />
              <p className="text-[12px] text-[#94A3B8] leading-relaxed">
                The assigned department and officer are not published on the public portal.
              </p>
            </Surface>
          </aside>
        </div>
      </Container>
    </CitizenNav>
  )
}

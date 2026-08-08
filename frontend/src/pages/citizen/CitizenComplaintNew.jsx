// Public complaint intake; the API controls workflow fields and rate limits.

import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import CitizenNav from "./CitizenNav"
import { complaintsApi, normaliseError, ISSUE_TYPE_OPTIONS } from "../../services"
import { useWards } from "../../hooks/useResources"
import { MapContainer, PointPicker } from "../../gis"
import { DEFAULT_CENTER, DEFAULT_ZOOM } from "../../gis/config"

const inputCls =
  "w-full h-10 px-3 text-[14px] rounded-[8px] border border-[#E2E8F0] bg-white text-[#0F172A] " +
  "placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 transition-all"

const labelCls = "block text-[13px] font-semibold text-[#0F172A] mb-1.5"

const MIN_DESCRIPTION = 10

function Field({ label, htmlFor, hint, error, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelCls}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-[12px] text-[#9CA3AF] mt-1.5">{hint}</p>
      )}
      {error && (
        <p className="text-[12px] text-[#DC2626] mt-1.5">{error}</p>
      )}
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
        <div className="max-w-[720px] mx-auto px-4 py-10">
          <div className="bg-white border border-[#E5E5E5] rounded-[12px] p-8 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#F0FDF4] flex items-center justify-center text-[#16A34A]">
              <svg
                width="22"
                height="22"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <h1 className="text-[22px] font-bold text-[#0F172A] mt-4">
              Complaint registered
            </h1>

            <p className="text-[13px] text-[#6B7280] mt-2">
              Keep this reference number — it is how you track progress.
            </p>

            <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-[0.06em] mt-6 mb-1">
              Reference number
            </p>

            <p className="text-[28px] font-bold font-mono text-[#5E6AD2]">
              {created.cnrId}
            </p>

            <div className="flex items-center gap-3 justify-center mt-7">
              <Link
                to={`/complaints/track?cnr=${encodeURIComponent(created.cnrId)}`}
                className="h-10 px-5 inline-flex items-center text-[13px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] transition-colors"
              >
                Track this complaint
              </Link>

              <Link
                to="/home"
                className="h-10 px-5 inline-flex items-center text-[13px] font-medium text-[#6B7280] border border-[#E2E8F0] rounded-[6px] hover:bg-[#F8FAFC] transition-colors"
              >
                Back to home
              </Link>
            </div>
          </div>
        </div>
      </CitizenNav>
    )
  }

  return (
    <CitizenNav>
      <div className="max-w-[720px] mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-[22px] font-bold text-[#0F172A]">
            Report an issue
          </h1>
          <p className="text-[13px] text-[#6B7280] mt-1">
            No account needed. You will receive a reference number to track progress.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-5 bg-white border border-[#E5E5E5] rounded-[12px] p-6"
        >
          <Field
            label="What is the issue?"
            htmlFor="issue-type"
            error={touched ? errors.issueType : ""}
          >
            <select
              id="issue-type"
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
              className={`${inputCls} cursor-pointer`}
            >
              <option value="">Select an issue type</option>

              {ISSUE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Describe it"
            htmlFor="description"
            hint="What is wrong, and since when? Avoid personal details."
            error={touched ? errors.description : ""}
          >
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="e.g. Deep pothole across the left lane near the school gate, widening since the last rain."
              className="w-full px-3 py-2.5 text-[14px] rounded-[8px] border border-[#E2E8F0] bg-white text-[#0F172A] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#5E6AD2] focus:ring-2 focus:ring-[#5E6AD2]/10 resize-none transition-all"
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Ward"
              htmlFor="ward"
              hint="Optional, but it helps routing."
            >
              <select
                id="ward"
                value={ward}
                onChange={(e) => setWard(e.target.value)}
                className={`${inputCls} cursor-pointer`}
              >
                <option value="">Not sure</option>

                {(wards || []).map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Nearest address or landmark"
              htmlFor="address"
              hint="Optional."
            >
              <input
                id="address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Near Ram Nagar crossing"
                className={inputCls}
              />
            </Field>
          </div>

          <Field
            label="Where is it?"
            hint="Click the map to drop a pin. Drag the pin to adjust."
            error={touched ? errors.coords : ""}
          >
            <div
              className="rounded-[8px] overflow-hidden border border-[#E2E8F0]"
              style={{ height: "300px" }}
            >
              <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM}>
                <PointPicker value={coords} onChange={setCoords} />
              </MapContainer>
            </div>

            {coords && (
              <p className="text-[12px] text-[#6B7280] mt-1.5">
                Pin at {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </p>
            )}
          </Field>

          {submitError && (
            <p role="alert" className="text-[13px] text-[#DC2626]">
              {submitError}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="h-10 px-5 text-[14px] font-medium text-white bg-[#5E6AD2] rounded-[6px] hover:bg-[#4A56C1] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Submitting..." : "Submit complaint"}
            </button>

            <Link
              to="/complaints/track"
              className="text-[13px] font-medium text-[#5E6AD2] hover:text-[#4A56C1]"
            >
              Already have a reference number?
            </Link>
          </div>
        </form>
      </div>
    </CitizenNav>
  )
}
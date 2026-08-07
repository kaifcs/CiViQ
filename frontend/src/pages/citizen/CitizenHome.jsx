// Public landing page for residents. Unauthenticated: no session is assumed and
// no staff data is shown.

import { useCallback, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import CitizenLayout from "./CitizenLayout"
import { useComplaintStats, useTrackedComplaints } from "../../hooks/useResources"
import { useCnrWatchlist, normalise } from "../../hooks/useCnrWatchlist"
import { complaintsApi } from "../../services"
import AsyncState from "../../components/AsyncState"
import {
  DashboardSection, BarChart, TrendChart, DashboardTable, QuickActions, StatGrid,
  ActionIcon, formatDateLong, COMPLAINT_STATUS_LABELS,
} from "../../components/dashboard"

// A { period, count } series from the API, in the { label, value } shape the
// charts read. The series is already grouped and sorted by the database.
const toSeries = (rows = []) => rows.map((r) => ({ label: r.period, value: r.count }))

// A { key: count } bucket map, likewise.
const toBars = (buckets = {}) =>
  Object.entries(buckets)
    .filter(([, count]) => count > 0)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)

// The only per-status coloured chip in the app, so it stays local rather than
// pushing a citizen-specific tone map into the shared Pill.
const STATUS_TONE = {
  submitted: "bg-[#F8FAFC] text-[#475569]",
  acknowledged: "bg-[#EEF2FF] text-[#4338CA]",
  in_progress: "bg-[#FFFBEB] text-[#92400E]",
  resolved: "bg-[#F0FDF4] text-[#15803D]",
}

const StatusPill = ({ status }) => (
  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_TONE[status] || STATUS_TONE.submitted}`}>
    {COMPLAINT_STATUS_LABELS[status] || status}
  </span>
)

export default function CitizenHome() {
  const navigate = useNavigate()
  const { cnrs, add, remove } = useCnrWatchlist()
  const [entry, setEntry] = useState("")
  const [entryError, setEntryError] = useState("")
  const [checking, setChecking] = useState(false)

  // City-wide figures are counted in the database rather than derived from a
  // downloaded table: GET /api/complaints is capped at 200 records, so counting
  // it would report that cap as the city total.
  const { data: city, loading, error, reload } = useComplaintStats()

  // The citizen's own reports are resolved by CNR, so they are found whatever
  // their age and wherever they fall relative to that cap.
  const { data: tracked, loading: loadingMine, error: mineError, reload: reloadMine } =
    useTrackedComplaints(cnrs)

  const mine = useMemo(
    () => [...(tracked || [])].sort((a, b) => new Date(b.filedAt) - new Date(a.filedAt)),
    [tracked]
  )

  const myOpen = useMemo(() => mine.filter((c) => c.status !== "resolved"), [mine])
  const myResolved = useMemo(() => mine.filter((c) => c.status === "resolved"), [mine])

  // Complaint carries no resolvedAt, so the backend derives this from updatedAt
  // on resolved records — the elapsed time it can actually support.
  const avgResolutionDays = useMemo(() => {
    const days = city?.averages?.resolutionDays
    return Number.isFinite(days) ? Math.max(0, Math.round(days)) : null
  }, [city])

  const stats = useMemo(() => [
    { label: "My Complaints",   value: mine.length,        sub: cnrs.length ? `${cnrs.length} tracked` : "None tracked yet" },
    { label: "Open",            value: myOpen.length,      sub: "Awaiting resolution", danger: true },
    { label: "Resolved",        value: myResolved.length,  sub: "Closed by the city" },
    { label: "Avg Resolution",  value: avgResolutionDays === null ? "—" : `${avgResolutionDays}d`, sub: "City-wide average" },
    { label: "City Reports",    value: city?.total ?? 0,   sub: "All citizens" },
    { label: "Open City-wide",  value: city?.open ?? 0,    sub: "Being worked on" },
    { label: "Resolved City-wide", value: city?.closed ?? 0, sub: "Completed" },
  ], [mine, myOpen, myResolved, avgResolutionDays, city, cnrs])

  // City-wide series, already grouped and sorted by the aggregation pipeline.
  const complaintHistory = useMemo(() => toSeries(city?.monthly), [city])
  const resolutionTrend = useMemo(() => toSeries(city?.resolvedMonthly), [city])
  const byIssueType = useMemo(() => toBars(city?.byIssueType), [city])

  const go = useCallback((to) => navigate(to), [navigate])

  const quickActions = useMemo(() => [
    { id: "report", label: "File a Complaint", hint: "Report an issue", to: "/report",
      icon: <ActionIcon d={<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>} /> },
    { id: "track", label: "Track a Complaint", hint: "Look up by CNR", to: "/track",
      icon: <ActionIcon d={<><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>} /> },
    { id: "projects", label: "Public Projects", hint: "Works in the city", to: "/projects",
      icon: <ActionIcon d={<><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></>} /> },
  ], [])

  // Confirmed against GET /api/complaints/:cnr rather than the capped public
  // list, so a real complaint is found however old it is.
  async function handleAdd(e) {
    e.preventDefault()
    const cnr = normalise(entry)
    if (!cnr) {
      setEntryError("Enter a CNR like CNR-100001")
      return
    }
    if (cnrs.includes(cnr)) {
      setEntryError(`${cnr} is already being tracked`)
      return
    }

    setChecking(true)
    try {
      await complaintsApi.get(cnr)
    } catch (err) {
      // 404 is the answer to the question asked; anything else is a fault and
      // must not be reported as "no such complaint".
      setEntryError(
        err?.response?.status === 404
          ? `No complaint found for ${cnr}`
          : "Could not check that CNR just now. Please try again."
      )
      return
    } finally {
      setChecking(false)
    }

    add(cnr)
    reloadMine()
    setEntry("")
    setEntryError("")
  }

  return (
    <CitizenLayout>
      <div className="max-w-[1200px] mx-auto px-6 py-8 flex flex-col gap-4" style={{ fontFamily: "'Inter', sans-serif" }}>

        <div>
          <h1 className="text-[24px] font-semibold text-[#0F172A]">Your city at a glance</h1>
          <p className="text-[13px] text-[#6B7280] mt-1">
            Track the complaints you have filed and see how Ghaziabad is responding.
          </p>
        </div>

        <QuickActions actions={quickActions} onNavigate={go} />

        <AsyncState loading={loading} error={error} onRetry={reload} label="Loading your dashboard...">
          <div className="flex flex-col gap-4">

            <StatGrid stats={stats} columns={7} />

            <DashboardSection
              title="My complaints"
              action={
                <form onSubmit={handleAdd} className="flex items-center gap-2">
                  <input
                    value={entry}
                    onChange={(e) => { setEntry(e.target.value); setEntryError("") }}
                    placeholder="CNR-100001"
                    aria-label="Track a complaint by CNR"
                    className="h-8 px-3 text-[12px] rounded-[6px] border border-[#E2E8F0] bg-[#FFFFFF] text-[#0F172A] focus:outline-none focus:border-[#5E6AD2] w-[130px]"
                  />
                  <button
                    type="submit"
                    disabled={checking}
                    className="h-8 px-3 text-[12px] font-medium rounded-[6px] bg-[#5E6AD2] text-white hover:bg-[#4A56C1] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {checking ? "Checking…" : "Track"}
                  </button>
                </form>
              }
            >
              {entryError && <p className="text-[12px] text-[#DC2626] mb-2">{entryError}</p>}
              <p className="text-[11px] text-[#9CA3AF] mb-3">
                Complaints are filed anonymously, so this list is kept on this device using the CNR
                you receive when reporting.
              </p>
              <DashboardTable
                loading={loadingMine}
                error={mineError}
                onRetry={reloadMine}
                rows={mine}
                emptyTitle="No complaints tracked yet"
                emptyHint="File a complaint, then add its CNR above to follow its progress."
                defaultSort={{ key: "filedAt", dir: "desc" }}
                columns={[
                  { key: "cnrId", header: "CNR", sortable: true, className: "font-mono text-[12px] whitespace-nowrap" },
                  { key: "issueType", header: "Issue", sortable: true, className: "max-w-[130px] truncate" },
                  { key: "ward", header: "Location", className: "max-w-[170px] truncate text-[#6B7280]",
                    render: (r) => <span title={r.ward || ""}>{r.ward || "—"}</span> },
                  { key: "status", header: "Status", sortable: true,
                    render: (r) => <StatusPill status={r.status} /> },
                  { key: "filedAt", header: "Filed", sortable: true,
                    sortValue: (r) => new Date(r.filedAt).getTime(),
                    className: "text-[#6B7280] whitespace-nowrap",
                    render: (r) => formatDateLong(r.filedAt) },
                  { key: "actions", header: "", className: "w-[28px]",
                    render: (r) => (
                      <button
                        onClick={(e) => { e.stopPropagation(); remove(r.cnrId) }}
                        title="Stop tracking"
                        aria-label={`Stop tracking ${r.cnrId}`}
                        className="text-[#9CA3AF] hover:text-[#DC2626] transition-colors"
                      >
                        <ActionIcon d={<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>} />
                      </button>
                    ) },
                ]}
              />
            </DashboardSection>

            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              <DashboardSection title="Complaint history">
                <TrendChart data={complaintHistory} emptyHint="No complaints have been filed yet." />
              </DashboardSection>

              <DashboardSection title="Complaint resolution trend">
                <TrendChart
                  data={resolutionTrend}
                  color="#16A34A"
                  emptyHint="No complaints have been resolved yet."
                />
              </DashboardSection>
            </div>

            <DashboardSection title="What the city is reporting">
              <BarChart
                data={byIssueType}
                labelWidth={110}
                emptyHint="No complaints have been filed yet."
              />
            </DashboardSection>

          </div>
        </AsyncState>
      </div>
    </CitizenLayout>
  )
}

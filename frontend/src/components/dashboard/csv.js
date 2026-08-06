// Client-side CSV download.
//
// The backend exposes no export endpoint and the repository carries no PDF or
// spreadsheet library, so this covers the one format that needs neither: a Blob
// of text the browser saves. PDF and Excel are deliberately not implemented —
// see the report.

/** RFC 4180 quoting: wrap in quotes and double any embedded quote. */
function cell(value) {
  if (value === null || value === undefined) return ""
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Builds CSV text from [{key, header}] columns and an array of rows. */
export function toCsv(columns, rows) {
  const head = columns.map((c) => cell(c.header)).join(",")
  const body = rows.map((r) =>
    columns.map((c) => cell(typeof c.value === "function" ? c.value(r) : r[c.key])).join(",")
  )
  return [head, ...body].join("\r\n")
}

/** Triggers a download of `text` as `filename`. */
export function downloadCsv(filename, text) {
  // BOM so Excel opens UTF-8 correctly.
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Appends the active filters so an exported file is self-describing. */
export function filterSuffix(filters = {}) {
  const parts = Object.entries(filters)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}-${String(v).replace(/[^\w-]/g, "")}`)
  return parts.length ? `_${parts.join("_")}` : ""
}

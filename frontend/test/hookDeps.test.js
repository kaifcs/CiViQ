// Referential stability of arguments passed to the data hooks.
//
// `useApi` spreads its `deps` argument straight into a useEffect dependency
// array (hooks/useApi.js). The resource hooks in hooks/useResources.js forward
// whatever the caller gives them into that array, so an argument that is a
// fresh object or array literal changes identity on every render — the effect
// re-runs, its fetch sets state, the component renders again, and the cycle
// repeats without bound. React reports it as "Maximum update depth exceeded",
// and the requests exhaust the shared /api rate limit for the caller's address.
//
// That is not a hypothetical: AdminAudit.jsx passed an inline literal and
// issued ~20 000 requests per 400ms in a renderer harness, against 1 for every
// other screen. Referential stability is therefore a contract, and this file
// enforces it by reading the source — no renderer, and so no test framework
// dependency, which is the repository's standing constraint.
//
// The rule: an argument to a guarded hook must be an identifier (a `useMemo`
// result, or a module-scope constant). A `{` or `[` opening the argument is a
// new value every render and is rejected.

import test from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const SRC = fileURLToPath(new URL("../src", import.meta.url))
const USE_RESOURCES = join(SRC, "hooks", "useResources.js")

// Hooks that forward their argument into the useApi dependency array.
const GUARDED = [
  "useProjects", "useProject",
  "useConflicts", "useConflict",
  "useComplaints", "useComplaint", "useComplaintStats", "useTrackedComplaints",
  "useUser", "useAuditLogs",
  "useDashboardSummary", "useDashboardProjects", "useDashboardConflicts",
  "useDashboardComplaints", "useDashboardDepartments", "useDashboardActivity",
]

// Hooks that take an argument but are NOT subject to the rule, each for a
// stated reason. Listed explicitly so the exemption is a decision, not an
// oversight.
const EXEMPT = {
  // Derives its own stable key from Object.keys(loaders).join(","), so an
  // inline object of loaders is deliberately safe here.
  useCombined: "keys itself on the loader names, not on object identity",
}

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(js|jsx)$/.test(path) ? [path] : []
  })
}

/** Call sites of `hook` whose first argument opens with `{` or `[`. */
function literalArgumentCallSites(source, hook) {
  const hits = []
  const call = new RegExp(`\\b${hook}\\s*\\(`, "g")
  let match
  while ((match = call.exec(source))) {
    const afterParen = source.slice(match.index + match[0].length)
    const firstToken = afterParen.replace(/^\s+/, "")[0]
    if (firstToken === "{" || firstToken === "[") {
      hits.push(source.slice(0, match.index).split("\n").length)
    }
  }
  return hits
}

test("no screen passes an inline literal to a data hook", () => {
  const offenders = []

  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, "utf8")
    // The hook definitions themselves are not call sites.
    if (file === USE_RESOURCES) continue

    for (const hook of GUARDED) {
      for (const line of literalArgumentCallSites(source, hook)) {
        offenders.push(`${file.slice(SRC.length + 1).replace(/\\/g, "/")}:${line} — ${hook}(...)`)
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "These call sites build a new object/array every render, which makes useApi " +
      "refetch on every render:\n  " + offenders.join("\n  ") +
      "\nWrap the argument in useMemo, or hoist it to module scope."
  )
})

test("every argument-taking resource hook is either guarded or explicitly exempt", () => {
  const source = readFileSync(USE_RESOURCES, "utf8")
  const declared = [...source.matchAll(/export function (use\w+)\(([^)]*)\)/g)]
    .filter(([, , arg]) => arg.trim() !== "")
    .map(([, name]) => name)

  const unclassified = declared.filter((name) => !GUARDED.includes(name) && !(name in EXEMPT))

  assert.deepEqual(
    unclassified,
    [],
    "New hook(s) in useResources.js take an argument but are not classified. " +
      "Add each to GUARDED, or to EXEMPT with the reason it is safe:\n  " +
      unclassified.join("\n  ")
  )
})

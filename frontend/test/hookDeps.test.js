// Verifies that data-hook arguments remain referentially stable.
// useApi spreads deps into useEffect, so inline objects/arrays can refetch repeatedly.

import test from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const SRC = fileURLToPath(new URL("../src", import.meta.url))
const USE_RESOURCES = join(SRC, "hooks", "useResources.js")

// Hooks whose arguments are passed into useApi dependencies.
const GUARDED = [
  "useProjects", "useProject", "usePublicProjects", "usePublicProject",
  "useConflicts", "useConflict",
  "useComplaints", "useComplaintsPaged", "useComplaint",
  "useUser", "useDepartment", "useAuditLogs",
  "useDashboardSummary", "useDashboardProjects", "useDashboardConflicts",
  "useDashboardComplaints", "useDashboardDepartments", "useDashboardActivity",
]

// Argument-taking hooks explicitly exempt from the rule.
const EXEMPT = {
  // Uses loader names as its stable key instead of object identity.
  useCombined: "keys itself on the loader names, not on object identity",
}

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(js|jsx)$/.test(path) ? [path] : []
  })
}

// Finds calls whose first argument is an inline object or array.
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
    // Skip hook definitions themselves.
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
// Seeded audit rows must use the vocabulary the controllers actually emit, or
// the audit screen's labels and `?action=` filter can never match them.

// Read as TEXT, not imported: seed/index.js seeds on load, and that empties
// every collection in the database MONGODB_URI names.

const test = require("node:test")
const assert = require("node:assert/strict")
const { readdirSync, readFileSync } = require("node:fs")
const path = require("node:path")

const SRC = path.join(__dirname, "..", "..", "src")
const SEED = readFileSync(path.join(SRC, "seed", "index.js"), "utf8")

// Every action string passed to recordAudit anywhere in the controllers.
function emittedActions() {
  const dir = path.join(SRC, "controllers")
  const actions = new Set()
  for (const file of readdirSync(dir)) {
    const source = readFileSync(path.join(dir, file), "utf8")
    for (const [, action] of source.matchAll(/action:\s*"([a-z_]+)"/g)) actions.add(action)
  }
  return actions
}

// Action strings in the seeder's audit-log fixtures.
function seededActions() {
  const block = SEED.split("function seedAuditLogs")[1]?.split("\n}")[0] ?? ""
  return [...block.matchAll(/\baction:\s*"([^"]+)"/g)]
    .map(([, action]) => action)
    // `details: { action: "approve_both" }` records a conflict RESOLUTION
    // choice, not an audit action; only the row-level field is in scope.
    .filter((action) => !["approve_both", "reject_lower", "accept", "custom"].includes(action))
}

test("both vocabularies are discoverable", () => {
  assert.ok(emittedActions().size > 0, "no actions parsed from the controllers")
  assert.ok(seededActions().length > 0, "no audit actions parsed from seedAuditLogs")
})

test("every seeded audit action is one a controller actually emits", () => {
  const emitted = emittedActions()
  const unknown = [...new Set(seededActions())].filter((action) => !emitted.has(action))

  assert.deepEqual(
    unknown,
    [],
    "seeded audit actions no controller writes — these render unlabelled and " +
      "cannot be matched by the audit screen's action filter"
  )
})

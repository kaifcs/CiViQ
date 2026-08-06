// The README's demo credentials must be accounts the seeder actually creates.
//
// They drifted: the table listed admin@civiq.in, officer@civiq.in, officer2@,
// officer3@ and supervisor@civiq.in, none of which appear in seed/index.js — so
// following the quick-start verbatim ended in "Invalid email or password" at
// every documented account.
//
// Both files are read as TEXT rather than imported. seed/index.js runs its
// seeding routine on load, and that routine DELETES every collection in the
// database named by MONGODB_URI; requiring it from a test would be destructive.

const test = require("node:test")
const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const path = require("node:path")

const ROOT = path.join(__dirname, "..", "..", "..")
const README = readFileSync(path.join(ROOT, "README.md"), "utf8")
const SEED = readFileSync(path.join(ROOT, "backend", "src", "seed", "index.js"), "utf8")

/** Emails in the seeder's `userDefs`, each with the role it is created as. */
function seededAccounts() {
  const accounts = new Map()
  const row = /email:\s*"([^"]+)"\s*,\s*role:\s*"([^"]+)"/g
  let match
  while ((match = row.exec(SEED))) accounts.set(match[1], match[2])
  return accounts
}

/** Rows of the README's "Demo Login" table, as { role, email, password }. */
function documentedAccounts() {
  const section = README.split("## Demo Login")[1]?.split("\n## ")[0] ?? ""
  return [...section.matchAll(/^\|\s*(\w+)\s*\|\s*(\S+@\S+)\s*\|\s*(\S+)\s*\|/gm)]
    .map(([, role, email, password]) => ({ role: role.toLowerCase(), email, password }))
}

test("the seeder defines demo accounts at all", () => {
  assert.ok(seededAccounts().size > 0, "no accounts parsed from seed/index.js — has userDefs moved?")
})

test("every README demo login exists in the seed, with the documented role", () => {
  const seeded = seededAccounts()
  const documented = documentedAccounts()

  assert.ok(documented.length > 0, "no rows parsed from the README's Demo Login table")

  const wrong = documented.filter(({ email, role }) => seeded.get(email) !== role)

  assert.deepEqual(
    wrong.map((a) => `${a.email} (documented as ${a.role}, seeded as ${seeded.get(a.email) ?? "MISSING"})`),
    [],
    "README credentials that npm run seed does not create — signing in with them returns 401"
  )
})

test("the documented password is the one the seeder sets", () => {
  const seedPassword = SEED.match(/SEED_PASSWORD\s*=\s*"([^"]+)"/)?.[1]
  assert.ok(seedPassword, "SEED_PASSWORD not found in seed/index.js")

  for (const { email, password } of documentedAccounts()) {
    assert.equal(password, seedPassword, `${email} documents a password the seeder never sets`)
  }
})

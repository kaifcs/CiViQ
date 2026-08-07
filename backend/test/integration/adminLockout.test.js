// Administrative lockout guards on the user-management endpoints. An
// administrator who deactivates or demotes themselves — or the last remaining
// administrator — would leave the deployment with no principal able to restore
// access, and there is no self-service path back in.

// Driven over real HTTP so `protect` and `authorize` run: the guards depend on
// `req.user`, which only the middleware chain supplies. Every rejection is
// checked against the database as well as the response, because a guard that
// answers 400 after writing has not prevented anything.

const test = require("node:test")
const assert = require("node:assert/strict")
const http = require("node:http")
const { mongoAvailable, dropAndDisconnect, clearCollections, SKIP_REASON } = require("../helpers/db")
const { userDoc, oid } = require("../helpers/fixtures")
const { mockReq, mockRes } = require("../helpers/http")

const PASSWORD = "civiq123"

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app)
    server.listen(0, "127.0.0.1", () => resolve(server))
  })
}

test("administrative lockout guards", async (t) => {
  if (!(await mongoAvailable())) return t.skip(SKIP_REASON)

  const app = require("../../src/app")
  const User = require("../../src/models/User")
  const AuditLog = require("../../src/models/AuditLog")

  const server = await listen(app)
  const base = `http://127.0.0.1:${server.address().port}/api`

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await dropAndDisconnect()
  })

  const call = async (path, { token, method = "GET", body } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  }

  const login = async (email) => {
    const res = await call("/auth/login", { method: "POST", body: { email, password: PASSWORD } })
    assert.equal(res.status, 200, `login failed for ${email}: ${JSON.stringify(res.body)}`)
    return res.body.token
  }

  // `new User(...).save()` rather than `create`, so the password hashing hook
  // runs and the account can actually log in.
  const mk = async (role, email, overrides = {}) => {
    const user = new User(userDoc({ role, email, ...overrides }))
    await user.save()
    return user
  }

  // Each scenario starts from a stated population, so no test depends on
  // another's leftovers.
  const reset = async () => {
    await clearCollections()
  }

  const rejected = (res, label) => {
    assert.equal(res.status, 400, `${label} was not rejected: ${JSON.stringify(res.body)}`)
    assert.equal(res.body.success, false)
    assert.equal(res.body.error.code, "VALIDATION_ERROR")
    assert.equal(res.body.message, res.body.error.message, "envelope shape changed")
    assert.ok(res.body.message.length > 0)
  }

  await t.test("an administrator cannot deactivate their own account", async (st) => {
    await reset()
    // A second active administrator, so only the self-guard can be the cause.
    const admin = await mk("admin", "sole@lockout.test")
    await mk("admin", "spare@lockout.test")
    const token = await login("sole@lockout.test")

    const res = await call(`/users/${admin._id}/status`, {
      token, method: "PATCH", body: { isActive: false },
    })
    rejected(res, "self-deactivation")

    await st.test("the database is unchanged", async () => {
      const after = await User.findById(admin._id)
      assert.equal(after.isActive, true, "the account was deactivated despite the rejection")
    })

    await st.test("no successful audit entry is written", async () => {
      assert.equal(await AuditLog.countDocuments({ targetId: admin._id }), 0,
        "a rejected operation recorded an audit entry")
    })
  })

  await t.test("an administrator cannot demote themselves", async (st) => {
    await reset()
    const admin = await mk("admin", "self@lockout.test")
    await mk("admin", "spare@lockout.test")
    const token = await login("self@lockout.test")

    const res = await call(`/users/${admin._id}`, {
      token, method: "PUT", body: { role: "officer" },
    })
    rejected(res, "self-demotion")

    await st.test("the database is unchanged", async () => {
      const after = await User.findById(admin._id)
      assert.equal(after.role, "admin", "the role was changed despite the rejection")
    })

    await st.test("no successful role-change audit entry is written", async () => {
      assert.equal(await AuditLog.countDocuments({ targetId: admin._id }), 0,
        "a rejected role change recorded an audit entry")
    })
  })

  // Unrelated fields on the same request must not be written either: the guard
  // rejects the whole operation, it does not strip the offending field.
  await t.test("a rejected self-demotion writes none of the request", async () => {
    await reset()
    const admin = await mk("admin", "self@lockout.test", { fullName: "Original Name" })
    await mk("admin", "spare@lockout.test")
    const token = await login("self@lockout.test")

    const res = await call(`/users/${admin._id}`, {
      token, method: "PUT", body: { fullName: "Renamed", role: "supervisor" },
    })
    rejected(res, "self-demotion with a profile edit")

    const after = await User.findById(admin._id)
    assert.equal(after.fullName, "Original Name", "a rejected request applied a partial update")
    assert.equal(after.role, "admin")
  })

  await t.test("the last active administrator cannot be deactivated or demoted", async (st) => {
    await reset()
    // An inactive administrator must not count as cover: the guard is about
    // ACTIVE administrators, and a deactivated one cannot even authenticate.
    const admin = await mk("admin", "only@lockout.test")
    await mk("admin", "retired@lockout.test", { isActive: false })
    await mk("officer", "officer@lockout.test")
    await mk("supervisor", "supervisor@lockout.test")
    const token = await login("only@lockout.test")

    assert.equal(await User.countDocuments({ role: "admin", isActive: true }), 1,
      "fixture drifted: the scenario needs exactly one active administrator")

    await st.test("deactivation is refused", async () => {
      const res = await call(`/users/${admin._id}/status`, {
        token, method: "PATCH", body: { isActive: false },
      })
      rejected(res, "deactivating the last active administrator")
      assert.equal((await User.findById(admin._id)).isActive, true)
    })

    await st.test("demotion is refused", async () => {
      const res = await call(`/users/${admin._id}`, {
        token, method: "PUT", body: { role: "officer" },
      })
      rejected(res, "demoting the last active administrator")
      assert.equal((await User.findById(admin._id)).role, "admin")
    })

    await st.test("no audit entry was written for either rejection", async () => {
      assert.equal(await AuditLog.countDocuments({ targetId: admin._id }), 0)
    })
  })

  await t.test("one administrator may deactivate another while an active one remains", async () => {
    await reset()
    await mk("admin", "actor@lockout.test")
    const target = await mk("admin", "target@lockout.test")
    const token = await login("actor@lockout.test")

    const off = await call(`/users/${target._id}/status`, {
      token, method: "PATCH", body: { isActive: false },
    })
    assert.equal(off.status, 200, JSON.stringify(off.body))
    assert.equal(off.body.user.isActive, false)
    assert.equal((await User.findById(target._id)).isActive, false)

    const on = await call(`/users/${target._id}/status`, {
      token, method: "PATCH", body: { isActive: true },
    })
    assert.equal(on.status, 200, "activation must never be blocked")
    assert.equal((await User.findById(target._id)).isActive, true)
  })

  await t.test("one administrator may demote another while an active one remains", async () => {
    await reset()
    const actor = await mk("admin", "actor@lockout.test")
    const target = await mk("admin", "target@lockout.test")
    const token = await login("actor@lockout.test")

    const res = await call(`/users/${target._id}`, {
      token, method: "PUT", body: { role: "supervisor" },
    })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.user.role, "supervisor")
    assert.equal((await User.findById(target._id)).role, "supervisor")

    // `actor` is now the last active administrator, so the same call against it
    // must be refused — the guard reads live state, not the state at startup.
    const now = await call(`/users/${actor._id}`, {
      token, method: "PUT", body: { role: "supervisor" },
    })
    rejected(now, "demoting the remaining administrator")
    assert.equal((await User.findById(actor._id)).role, "admin")
  })

  await t.test("promotion and lateral non-admin role changes are unaffected", async () => {
    await reset()
    await mk("admin", "actor@lockout.test")
    const officer = await mk("officer", "officer@lockout.test")
    const token = await login("actor@lockout.test")

    const lateral = await call(`/users/${officer._id}`, {
      token, method: "PUT", body: { role: "supervisor" },
    })
    assert.equal(lateral.status, 200, "changing a non-admin role must not be guarded")
    assert.equal(lateral.body.user.role, "supervisor")

    const promote = await call(`/users/${officer._id}`, {
      token, method: "PUT", body: { role: "admin" },
    })
    assert.equal(promote.status, 200, "promotion must never be blocked")
    assert.equal((await User.findById(officer._id)).role, "admin")
  })

  await t.test("officers and supervisors activate and deactivate normally", async () => {
    await reset()
    await mk("admin", "actor@lockout.test")
    const officer = await mk("officer", "officer@lockout.test")
    const supervisor = await mk("supervisor", "supervisor@lockout.test")
    const token = await login("actor@lockout.test")

    for (const staff of [officer, supervisor]) {
      const off = await call(`/users/${staff._id}/status`, {
        token, method: "PATCH", body: { isActive: false },
      })
      assert.equal(off.status, 200, `${staff.role} could not be deactivated`)
      assert.equal(off.body.user.isActive, false)
      assert.equal((await User.findById(staff._id)).isActive, false)

      const on = await call(`/users/${staff._id}/status`, {
        token, method: "PATCH", body: { isActive: true },
      })
      assert.equal(on.status, 200, `${staff.role} could not be reactivated`)
      assert.equal(on.body.user.isActive, true)
    }
  })

  // An administrator may still reactivate themselves is meaningless — an
  // inactive account cannot authenticate — but sending `isActive: true` for
  // one's own already-active account must not be caught by the self-guard.
  await t.test("the self-guard applies to deactivation only", async () => {
    await reset()
    const admin = await mk("admin", "actor@lockout.test")
    const token = await login("actor@lockout.test")

    const res = await call(`/users/${admin._id}/status`, {
      token, method: "PATCH", body: { isActive: true },
    })
    assert.equal(res.status, 200, "activating one's own account must not be blocked")
    assert.equal((await User.findById(admin._id)).isActive, true)
  })

  // Profile edits by the last administrator on their own account are ordinary
  // user management and must keep working.
  await t.test("the last administrator may still edit their own profile", async () => {
    await reset()
    const admin = await mk("admin", "actor@lockout.test")
    const token = await login("actor@lockout.test")

    const res = await call(`/users/${admin._id}`, {
      token, method: "PUT", body: { fullName: "Renamed", phone: "9999999999" },
    })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.user.fullName, "Renamed")

    // Re-sending the same role is not a demotion and must not be refused.
    const sameRole = await call(`/users/${admin._id}`, {
      token, method: "PUT", body: { role: "admin" },
    })
    assert.equal(sameRole.status, 200, "a no-op role write must not be treated as a demotion")
    assert.equal((await User.findById(admin._id)).role, "admin")
  })

  // Regression cover: the guards run after the existing validation, so the
  // established failure modes still answer as documented.
  await t.test("existing validation and lookups are unchanged", async () => {
    await reset()
    const admin = await mk("admin", "actor@lockout.test")
    const officer = await mk("officer", "officer@lockout.test")
    const token = await login("actor@lockout.test")

    const badId = await call("/users/not-an-object-id/status", {
      token, method: "PATCH", body: { isActive: false },
    })
    assert.equal(badId.status, 400)

    const missing = await call(`/users/${admin._id.toString().replace(/.$/, "0")}/status`, {
      token, method: "PATCH", body: { isActive: false },
    })
    assert.ok([400, 404].includes(missing.status))

    const notBoolean = await call(`/users/${officer._id}/status`, {
      token, method: "PATCH", body: { isActive: "false" },
    })
    assert.equal(notBoolean.status, 400, "the boolean check must still run first")
    assert.equal((await User.findById(officer._id)).isActive, true)

    const badRole = await call(`/users/${officer._id}`, {
      token, method: "PUT", body: { role: "superuser" },
    })
    assert.equal(badRole.status, 400)

    // RBAC is untouched: a non-admin still cannot reach these routes at all.
    const officerToken = await login("officer@lockout.test")
    for (const [path, method, body] of [
      [`/users/${admin._id}/status`, "PATCH", { isActive: false }],
      [`/users/${admin._id}`, "PUT", { role: "officer" }],
      ["/users", "GET", undefined],
    ]) {
      const res = await call(path, { token: officerToken, method, body })
      assert.equal(res.status, 403, `an officer reached ${method} ${path}`)
    }
  })

  // Over HTTP the caller is always an active administrator, so a request whose
  // target is the last one is necessarily a request against oneself and the
  // self-guards answer first. The last-admin guard is therefore exercised
  // directly, with a caller who is not the target — it is the layer that still
  // holds if the self-guards are ever bypassed or relaxed.
  await t.test("the last-admin guard stands on its own, independent of the self-guards", async (st) => {
    const { updateUser, updateUserStatus } = require("../../src/controllers/usersController")

    // A caller that is deliberately not any stored account, so `isSelf` is false
    // and only the last-admin guard can produce the rejection.
    const otherAdmin = { _id: oid(), role: "admin" }

    const invoke = async (handler, { id, body }) => {
      const res = mockRes()
      await handler(mockReq({ params: { id: String(id) }, body, user: otherAdmin }), res)
      return res
    }

    await st.test("deactivating the last active administrator is refused", async () => {
      await reset()
      const admin = await mk("admin", "only@lockout.test")
      const res = await invoke(updateUserStatus, { id: admin._id, body: { isActive: false } })

      assert.equal(res.statusCode, 400)
      assert.equal(res.body.success, false)
      assert.equal(res.body.error.code, "VALIDATION_ERROR")
      assert.equal((await User.findById(admin._id)).isActive, true, "the database was modified")
      assert.equal(await AuditLog.countDocuments({}), 0)
    })

    await st.test("demoting the last active administrator is refused", async () => {
      await reset()
      const admin = await mk("admin", "only@lockout.test")
      const res = await invoke(updateUser, { id: admin._id, body: { role: "officer" } })

      assert.equal(res.statusCode, 400)
      assert.equal(res.body.error.code, "VALIDATION_ERROR")
      assert.equal((await User.findById(admin._id)).role, "admin", "the database was modified")
      assert.equal(await AuditLog.countDocuments({}), 0)
    })

    await st.test("a peer administrator keeps both operations available", async () => {
      await reset()
      const target = await mk("admin", "target@lockout.test")
      await mk("admin", "peer@lockout.test")

      const off = await invoke(updateUserStatus, { id: target._id, body: { isActive: false } })
      assert.equal(off.statusCode, 200)
      assert.equal((await User.findById(target._id)).isActive, false)

      // Already inactive, so this change cannot remove an active administrator.
      const demote = await invoke(updateUser, { id: target._id, body: { role: "officer" } })
      assert.equal(demote.statusCode, 200)
      assert.equal((await User.findById(target._id)).role, "officer")
    })
  })
})

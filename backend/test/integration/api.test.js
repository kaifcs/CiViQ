// Authentication, RBAC and ownership over real HTTP. The app is mounted on an
// ephemeral port so the whole middleware chain runs as it does in production —
// unit tests cannot show that those are wired in the right order.

const test = require("node:test")
const assert = require("node:assert/strict")
const http = require("node:http")
const mongoose = require("mongoose")
const { mongoAvailable, dropAndDisconnect, clearCollections, SKIP_REASON } = require("../helpers/db")
const { projectDoc, userDoc, departmentDoc } = require("../helpers/fixtures")

const PASSWORD = "civiq123"

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app)
    server.listen(0, "127.0.0.1", () => resolve(server))
  })
}

test("API regression", async (t) => {
  if (!(await mongoAvailable())) return t.skip(SKIP_REASON)

  const app = require("../../src/app")
  const User = require("../../src/models/User")
  const Project = require("../../src/models/Project")
  const Department = require("../../src/models/Department")
  const Conflict = require("../../src/models/Conflict")

  const server = await listen(app)
  const base = `http://127.0.0.1:${server.address().port}/api`

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await dropAndDisconnect()
  })

  await clearCollections()

  const department = await Department.create(departmentDoc())
  const mk = async (role, email) => {
    const user = new User(userDoc({ role, email, department: department._id }))
    await user.save()
    return user
  }
  const admin = await mk("admin", "admin@s5.test")
  const officerA = await mk("officer", "officer-a@s5.test")
  const officerB = await mk("officer", "officer-b@s5.test")
  const supervisor = await mk("supervisor", "supervisor@s5.test")
  // A real role an administrator can assign; it owns no project, so it must
  // see none.
  const citizenUser = await mk("citizen", "citizen@s5.test")

  const ownedByA = await Project.create(projectDoc({
    officer: officerA._id, supervisor: supervisor._id,
    department: department._id, createdBy: officerA._id,
  }))
  const ownedByB = await Project.create(projectDoc({
    officer: officerB._id, department: department._id, createdBy: officerB._id,
  }))

  const call = async (path, { token, method = "GET", body } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) }
  }

  const login = async (email) => {
    const res = await call("/auth/login", { method: "POST", body: { email, password: PASSWORD } })
    assert.equal(res.status, 200, `login failed for ${email}: ${JSON.stringify(res.body)}`)
    return res.body.token
  }

  const tokens = {
    admin: await login("admin@s5.test"),
    officerA: await login("officer-a@s5.test"),
    officerB: await login("officer-b@s5.test"),
    supervisor: await login("supervisor@s5.test"),
    citizen: await login("citizen@s5.test"),
  }


  await t.test("a protected route rejects an absent, malformed or forged token", async () => {
    const forged = require("jsonwebtoken").sign({ id: String(admin._id) }, "wrong-secret")
    for (const token of [undefined, "not-a-jwt", forged]) {
      const res = await call("/projects", { token })
      assert.equal(res.status, 401, `token ${String(token).slice(0, 12)} was accepted`)
      assert.equal(res.body.success, false)
      assert.ok(res.body.error.code)
    }
  })

  await t.test("login rejects bad credentials without revealing which part was wrong", async () => {
    const wrongPassword = await call("/auth/login", {
      method: "POST", body: { email: "admin@s5.test", password: "nope" },
    })
    const unknownUser = await call("/auth/login", {
      method: "POST", body: { email: "nobody@s5.test", password: PASSWORD },
    })
    assert.equal(wrongPassword.status, 401)
    assert.equal(unknownUser.status, 401)
    assert.equal(wrongPassword.body.message, unknownUser.body.message,
      "differing messages let an attacker enumerate accounts")
  })

  // The role enum is not the control here; authentication on the route is.
  await t.test("regression: account creation is not self-service (P0-1)", async (st) => {
    const payload = {
      fullName: "Mallory", email: "mallory@s5.test",
      password: PASSWORD, role: "officer",
    }

    await st.test("an anonymous caller cannot create an account", async () => {
      const res = await call("/auth/register", { method: "POST", body: payload })
      assert.equal(res.status, 401, "register must require a session")
      assert.equal(res.body.success, false)
      assert.ok(res.body.error.code)
      assert.equal(await User.countDocuments({ email: payload.email }), 0,
        "a rejected registration must not leave an account behind")
    })

    await st.test("a non-admin session cannot create an account either", async () => {
      for (const role of ["officerA", "supervisor", "citizen"]) {
        const res = await call("/auth/register", {
          method: "POST", token: tokens[role], body: payload,
        })
        assert.equal(res.status, 403, `${role} was allowed to create an account`)
      }
      assert.equal(await User.countDocuments({ email: payload.email }), 0)
    })

    await st.test("an admin can still create staff", async () => {
      const res = await call("/auth/register", {
        method: "POST", token: tokens.admin, body: payload,
      })
      assert.equal(res.status, 201)
      assert.equal(res.body.user.role, "officer")
      assert.equal(await User.countDocuments({ email: payload.email }), 1)
    })

    // Creating a principal and granting it unrestricted access must stay two
    // separate, separately-audited steps.
    await st.test("even an admin cannot create another admin in one step", async () => {
      const res = await call("/auth/register", {
        method: "POST", token: tokens.admin,
        body: { ...payload, email: "escalate@s5.test", role: "admin" },
      })
      assert.equal(res.status, 400)
      assert.equal(await User.countDocuments({ email: "escalate@s5.test" }), 0)
    })
  })

  await t.test("a password hash never appears in any response", async () => {
    const me = await call("/auth/me", { token: tokens.admin })
    assert.equal(me.status, 200)
    assert.doesNotMatch(JSON.stringify(me.body), /\$2[aby]\$/, "a bcrypt hash was serialised")
    assert.equal(JSON.stringify(me.body).includes('"password"'), false)
  })


  await t.test("officers see only their own projects; admin sees all", async () => {
    const adminList = await call("/projects", { token: tokens.admin })
    assert.equal(adminList.status, 200)
    assert.equal(adminList.body.length, 2)

    const aList = await call("/projects", { token: tokens.officerA })
    assert.equal(aList.body.length, 1)
    assert.equal(String(aList.body[0]._id), String(ownedByA._id))

    const bList = await call("/projects", { token: tokens.officerB })
    assert.equal(bList.body.length, 1)
    assert.equal(String(bList.body[0]._id), String(ownedByB._id))
  })

  await t.test("a supervisor sees only the projects they supervise", async () => {
    const list = await call("/projects", { token: tokens.supervisor })
    assert.equal(list.body.length, 1)
    assert.equal(String(list.body[0]._id), String(ownedByA._id))
  })

  // Scoping the list is not enough on its own: a direct id reference must be
  // scoped too, or any officer can read any project.
  await t.test("regression: an officer cannot read another officer's project by id (S2 IDOR)", async () => {
    const res = await call(`/projects/${ownedByB._id}`, { token: tokens.officerA })
    assert.equal(res.status, 404, "a foreign project must not be readable")
    assert.equal(res.body.error.code, "PROJECT_NOT_FOUND")
  })

  // 404 rather than 403 is deliberate: a 403 confirms the id exists.
  await t.test("an inaccessible project is indistinguishable from a missing one", async () => {
    const foreign = await call(`/projects/${ownedByB._id}`, { token: tokens.officerA })
    const absent = await call(`/projects/${new mongoose.Types.ObjectId()}`, { token: tokens.officerA })
    assert.equal(foreign.status, absent.status)
    assert.equal(foreign.body.error.code, absent.body.error.code)
    assert.equal(foreign.body.message, absent.body.message)
  })

  await t.test("an officer cannot modify another officer's project", async () => {
    const res = await call(`/projects/${ownedByB._id}`, {
      token: tokens.officerA, method: "PUT", body: { title: "hijacked" },
    })
    assert.ok([403, 404].includes(res.status), `unexpected status ${res.status}`)
    const untouched = await Project.findById(ownedByB._id).lean()
    assert.notEqual(untouched.title, "hijacked", "a foreign project was modified")
  })

  // An unnamed role must be denied, not handed an empty filter that matches
  // every document. Both halves are pinned, since they read the same rule.
  await t.test("regression: a citizen sees no project through the list (P1-1)", async () => {
    const res = await call("/projects", { token: tokens.citizen })
    assert.equal(res.status, 200, "the endpoint stays available to any authenticated role")
    assert.deepEqual(res.body, [], "a citizen must not receive any project")
  })

  await t.test("regression: a citizen cannot read a project by id (P1-1)", async () => {
    const res = await call(`/projects/${ownedByA._id}`, { token: tokens.citizen })
    assert.equal(res.status, 404, "an out-of-scope project must not be readable")
    assert.equal(res.body.error.code, "PROJECT_NOT_FOUND")
  })

  await t.test("an officer cannot reach an admin-only route", async () => {
    const res = await call("/users", { token: tokens.officerA })
    assert.equal(res.status, 403)
    assert.equal(res.body.success, false)
  })

  await t.test("an officer may read their own project", async () => {
    const res = await call(`/projects/${ownedByA._id}`, { token: tokens.officerA })
    assert.equal(res.status, 200)
    assert.equal(String(res.body._id), String(ownedByA._id))
  })

  // PUT /:id can rewrite every input both engines read, so both must re-run.
  // The two fixtures are co-located, contemporaneous and both `road`, which the
  // matrix calls incompatible, so a location update must find the collision.
  await t.test("regression: updating a project re-runs clash detection (P1-2)", async () => {
    assert.equal(await Conflict.countDocuments(), 0, "precondition: no conflicts yet")
    const before = await Project.findById(ownedByA._id).lean()
    assert.equal(before.hasClash, false, "precondition: fixture starts clash-free")

    const res = await call(`/projects/${ownedByA._id}`, {
      token: tokens.officerA,
      method: "PUT",
      body: { location: { ward: before.location.ward, centerCoords: before.location.centerCoords } },
    })
    assert.equal(res.status, 200)

    const after = await Project.findById(ownedByA._id).lean()
    assert.equal(after.hasClash, true, "the collision with the co-located project was not detected")
    assert.equal(after.clashes.length, 1)

    const pair = await Conflict.find({
      $or: [
        { project1: ownedByA._id, project2: ownedByB._id },
        { project1: ownedByB._id, project2: ownedByA._id },
      ],
    }).lean()
    assert.equal(pair.length, 1, "exactly one conflict row must exist for the pair")

    // The pair is unordered, so a second update must reuse the row rather than
    // stack a duplicate for the same collision.
    await call(`/projects/${ownedByA._id}`, {
      token: tokens.officerA,
      method: "PUT",
      body: { location: { ward: before.location.ward, centerCoords: before.location.centerCoords } },
    })
    assert.equal(await Conflict.countDocuments(), 1, "a repeated update duplicated the conflict")
  })

  await t.test("regression: updating a project re-scores MCDM (P1-2)", async () => {
    const res = await call(`/projects/${ownedByA._id}`, {
      token: tokens.officerA,
      method: "PUT",
      body: { mcdmInputs: { conditionRating: "critical", tenderStatus: "complete", contractorAssigned: true } },
    })
    assert.equal(res.status, 200)

    const after = await Project.findById(ownedByA._id).lean()
    assert.equal(after.mcdmBreakdown.conditionSeverity, 10, "condition rating was not re-scored")
    assert.equal(after.mcdmBreakdown.executionReadiness, 10, "execution readiness was not re-scored")
    assert.equal(typeof after.mcdmScore, "number")
  })

  // The engines re-run only for updates that touch what they read, so an
  // unrelated edit cannot make conflict rows appear or disappear.
  await t.test("an edit touching no engine input leaves clash and score state alone", async () => {
    const before = await Project.findById(ownedByA._id).lean()
    const conflictsBefore = await Conflict.countDocuments()

    const res = await call(`/projects/${ownedByA._id}`, {
      token: tokens.officerA, method: "PUT", body: { title: "Renamed, nothing else" },
    })
    assert.equal(res.status, 200)

    const after = await Project.findById(ownedByA._id).lean()
    assert.equal(after.title, "Renamed, nothing else")
    assert.equal(after.mcdmScore, before.mcdmScore, "score changed on an unrelated edit")
    assert.equal(after.hasClash, before.hasClash, "clash state changed on an unrelated edit")
    assert.equal(await Conflict.countDocuments(), conflictsBefore, "conflict rows changed on an unrelated edit")
  })

  // approve and reject apply only to a `pending` project; completed and rejected
  // are terminal. The next three clean up after themselves, because the
  // pagination assertions below count the fixture set exactly.
  const scratchProjects = []
  const scratchProject = async (status, overrides = {}) => {
    const project = await Project.create(projectDoc({
      status, officer: officerA._id, supervisor: supervisor._id,
      department: department._id, createdBy: officerA._id,
      ...overrides,
    }))
    scratchProjects.push(project._id)
    return project
  }
  const dropScratchProjects = async () => {
    if (scratchProjects.length === 0) return
    await Project.deleteMany({ _id: { $in: scratchProjects.splice(0) } })
  }

  await t.test("regression: a decided project cannot be decided again (P2-4)", async (st) => {
    st.after(dropScratchProjects)

    for (const status of ["completed", "rejected"]) {
      const project = await scratchProject(status)
      const approve = await call(`/projects/${project._id}/approve`, { token: tokens.admin, method: "PUT", body: {} })
      assert.equal(approve.status, 409, `${status} project was approvable`)
      assert.equal(approve.body.error.code, "CONFLICT")

      const reject = await call(`/projects/${project._id}/reject`, { token: tokens.admin, method: "PUT", body: { reason: "x" } })
      assert.equal(reject.status, 409, `${status} project was rejectable`)

      assert.equal((await Project.findById(project._id).lean()).status, status, "status changed despite the refusal")
    }
  })

  await t.test("regression: progress cannot be recorded on finished work (P2-4)", async (st) => {
    st.after(dropScratchProjects)

    for (const status of ["completed", "rejected"]) {
      const project = await scratchProject(status)
      const res = await call(`/projects/${project._id}/progress`, {
        token: tokens.supervisor, method: "PUT", body: { progress: 100 },
      })
      assert.equal(res.status, 409, `progress was accepted on a ${status} project`)
      assert.equal((await Project.findById(project._id).lean()).status, status)
    }
  })

  // The broadest write on the resource needs the same guard the narrow ones
  // have: moving `startDate` past a stamped `actualEndDate` would make the
  // dashboard's average completion time negative.
  await t.test("regression: finished work can no longer be edited (P2-1)", async (st) => {
    st.after(dropScratchProjects)

    for (const status of ["completed", "rejected"]) {
      const project = await scratchProject(status, {
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-06-01"),
        actualEndDate: new Date("2025-05-01"),
      })

      const res = await call(`/projects/${project._id}`, {
        token: tokens.officerA, method: "PUT",
        body: { title: "REWRITTEN", startDate: "2027-01-01", endDate: "2027-06-01" },
      })
      assert.equal(res.status, 409, `a ${status} project was editable`)
      assert.equal(res.body.error.code, "CONFLICT")

      const after = await Project.findById(project._id).lean()
      assert.equal(after.title, project.title, "the title changed despite the refusal")
      assert.equal(after.startDate.toISOString(), project.startDate.toISOString(),
        "startDate changed despite the refusal")
      assert.ok(after.actualEndDate >= after.startDate,
        "a completion must never predate the start it is measured from")
    }
  })

  // The refusal must cover the recompute an edit triggers, not just the field
  // write — re-scoring finished work is the same corruption by another route.
  await t.test("a refused edit re-scores nothing (P2-1)", async (st) => {
    st.after(dropScratchProjects)

    const project = await scratchProject("completed", { mcdmScore: 4.2 })
    const res = await call(`/projects/${project._id}`, {
      token: tokens.officerA, method: "PUT",
      body: { location: { ward: "Ward-99", centerCoords: { lat: 28.7, lng: 77.5 } } },
    })
    assert.equal(res.status, 409)

    const after = await Project.findById(project._id).lean()
    assert.equal(after.mcdmScore, 4.2, "MCDM was recomputed on a refused edit")
    assert.equal(after.location.ward, project.location.ward, "location changed despite the refusal")
  })

  // Editing live work — the reason this endpoint exists — must be unaffected.
  await t.test("live projects are still freely editable (P2-1)", async (st) => {
    st.after(dropScratchProjects)

    for (const status of ["pending", "approved", "active"]) {
      const project = await scratchProject(status)
      const res = await call(`/projects/${project._id}`, {
        token: tokens.officerA, method: "PUT", body: { title: `Edited ${status}` },
      })
      assert.equal(res.status, 200, `a ${status} project was not editable`)
      assert.equal((await Project.findById(project._id).lean()).title, `Edited ${status}`)
    }
  })

  // `active` is counted by the dashboard and read by clash detection, so
  // something has to write it: recording real progress is what does.
  await t.test("regression: recording progress makes a project active (P2-2)", async (st) => {
    st.after(dropScratchProjects)

    const project = await scratchProject("approved")
    const half = await call(`/projects/${project._id}/progress`, {
      token: tokens.supervisor, method: "PUT", body: { progress: 50 },
    })
    assert.equal(half.status, 200)
    assert.equal(half.body.status, "active", "work in flight must report as active")

    // `active` stays progressable, so the lifecycle still reaches completion.
    const done = await call(`/projects/${project._id}/progress`, {
      token: tokens.supervisor, method: "PUT", body: { progress: 100 },
    })
    assert.equal(done.status, 200)
    assert.equal(done.body.status, "completed")
  })

  await t.test("approved work only becomes active once progress is real (P2-2)", async (st) => {
    st.after(dropScratchProjects)

    const untouched = await scratchProject("approved")
    const zero = await call(`/projects/${untouched._id}/progress`, {
      token: tokens.supervisor, method: "PUT", body: { progress: 0 },
    })
    assert.equal(zero.body.status, "approved", "0% is not work in flight")

    // Straight to 100 finishes the work; it never passes through active.
    const straight = await scratchProject("approved")
    const done = await call(`/projects/${straight._id}/progress`, {
      token: tokens.supervisor, method: "PUT", body: { progress: 100 },
    })
    assert.equal(done.body.status, "completed")
  })

  // Progress on an unapproved project would let work reach completion without
  // ever passing through the approval workflow.
  await t.test("regression: progress cannot be recorded before approval (P1-1)", async (st) => {
    st.after(dropScratchProjects)

    for (const status of ["pending", "rescheduled"]) {
      const project = await scratchProject(status)
      const res = await call(`/projects/${project._id}/progress`, {
        token: tokens.supervisor, method: "PUT", body: { progress: 100 },
      })
      assert.equal(res.status, 409, `progress was accepted on a ${status} project`)
      assert.equal(res.body.error.code, "CONFLICT")

      const after = await Project.findById(project._id).lean()
      assert.equal(after.status, status, "status changed despite the refusal")
      assert.equal(after.progress, 0, "progress was written despite the refusal")
      assert.equal(after.actualEndDate, undefined, "actualEndDate was stamped despite the refusal")
    }
  })

  // The decision path must stay open, which is the whole point of the guard.
  await t.test("a refused project can still be approved, then completed (P1-1)", async (st) => {
    st.after(dropScratchProjects)

    const project = await scratchProject("pending")
    const blocked = await call(`/projects/${project._id}/progress`, {
      token: tokens.supervisor, method: "PUT", body: { progress: 100 },
    })
    assert.equal(blocked.status, 409)

    const approved = await call(`/projects/${project._id}/approve`, { token: tokens.admin, method: "PUT", body: {} })
    assert.equal(approved.status, 200, "approve must still be reachable after the refusal")

    const done = await call(`/projects/${project._id}/progress`, {
      token: tokens.supervisor, method: "PUT", body: { progress: 100 },
    })
    assert.equal(done.status, 200, "an approved project must accept progress")
    const finished = await Project.findById(project._id).lean()
    assert.equal(finished.status, "completed")
    assert.ok(finished.actualEndDate, "completion must still stamp actualEndDate")
  })

  await t.test("the decision and progress paths still work on live projects (P2-4)", async (st) => {
    st.after(dropScratchProjects)

    const pending = await scratchProject("pending")
    const approved = await call(`/projects/${pending._id}/approve`, { token: tokens.admin, method: "PUT", body: {} })
    assert.equal(approved.status, 200)
    assert.equal((await Project.findById(pending._id).lean()).status, "approved")

    // `active` is non-terminal, so progress applies and 100 still completes it.
    const live = await scratchProject("active")
    const half = await call(`/projects/${live._id}/progress`, { token: tokens.supervisor, method: "PUT", body: { progress: 50 } })
    assert.equal(half.status, 200)
    assert.equal((await Project.findById(live._id).lean()).status, "active", "a partial update must not complete the work")

    const full = await call(`/projects/${live._id}/progress`, { token: tokens.supervisor, method: "PUT", body: { progress: 100 } })
    assert.equal(full.status, 200)
    const finished = await Project.findById(live._id).lean()
    assert.equal(finished.status, "completed")
    assert.ok(finished.actualEndDate, "completion must still stamp actualEndDate")
  })

  // Finished projects are immutable during conflict resolution.
  const scratchConflicts = []
  const conflictFor = async (a, b) => {
    const conflict = await Conflict.create({
      project1: a._id, project2: b._id,
      clashTypes: ["geographic", "timeline", "worktype"],
      severity: "incompatible", status: "pending",
    })
    scratchConflicts.push(conflict._id)
    return conflict
  }
  const dropScratch = async () => {
    if (scratchConflicts.length > 0) await Conflict.deleteMany({ _id: { $in: scratchConflicts.splice(0) } })
    await dropScratchProjects()
  }

  await t.test("regression: resolving a conflict cannot approve finished work (terminal-status guard)", async (st) => {
    st.after(dropScratch)

    for (const status of ["completed", "rejected"]) {
      // Both orderings: the pair is unordered (models/Conflict), so the guard
      // has to cover whichever side happens to be stored first.
      for (const terminalFirst of [true, false]) {
        const done = await scratchProject(status)
        const live = await scratchProject("pending")
        const conflict = terminalFirst ? await conflictFor(done, live) : await conflictFor(live, done)

        const res = await call(`/conflicts/${conflict._id}/resolve`, {
          token: tokens.admin, method: "PUT", body: { action: "approve_both" },
        })
        assert.equal(res.status, 409, `approve_both accepted a ${status} project`)
        assert.equal(res.body.error.code, "CONFLICT")

        assert.equal((await Project.findById(done._id).lean()).status, status, "finished work was rewritten")
        assert.equal((await Project.findById(live._id).lean()).status, "pending", "a refused call still wrote the other project")
        assert.equal((await Conflict.findById(conflict._id).lean()).status, "pending",
          "the conflict was actioned despite the refusal")
      }
    }
  })

  await t.test("regression: reject_lower cannot reschedule finished work (terminal-status guard)", async (st) => {
    st.after(dropScratch)

    const done = await scratchProject("completed", { mcdmScore: 2 })   // the lower score
    const live = await scratchProject("pending", { mcdmScore: 9 })
    const conflict = await conflictFor(live, done)

    const res = await call(`/conflicts/${conflict._id}/resolve`, {
      token: tokens.admin, method: "PUT", body: { action: "reject_lower" },
    })
    assert.equal(res.status, 409, "reject_lower rescheduled completed work")
    assert.equal((await Project.findById(done._id).lean()).status, "completed")
    assert.equal((await Conflict.findById(conflict._id).lean()).status, "pending")
  })

  // The guard is scoped to the project each branch writes. reject_lower never
  // rewrites the winner, so a finished winner must not block the deferral.
  await t.test("reject_lower still runs when only the winner is finished (terminal-status guard)", async (st) => {
    st.after(dropScratch)

    const doneWinner = await scratchProject("completed", { mcdmScore: 9 })
    const liveLoser = await scratchProject("pending", { mcdmScore: 2 })
    const conflict = await conflictFor(doneWinner, liveLoser)

    const res = await call(`/conflicts/${conflict._id}/resolve`, {
      token: tokens.admin, method: "PUT", body: { action: "reject_lower" },
    })
    assert.equal(res.status, 200, "a finished winner must not block the reschedule")
    assert.equal((await Project.findById(liveLoser._id).lean()).status, "rescheduled")
    assert.equal((await Project.findById(doneWinner._id).lean()).status, "completed", "the winner must be untouched")
    assert.equal((await Conflict.findById(conflict._id).lean()).status, "awaiting_officer")
  })

  // Conflict resolution writes Project.status directly, so it must enforce the
  // same lifecycle invariants the project routes do.

  await t.test("regression: approve_both does not roll in-flight work back to approved (F-1)", async (st) => {
    st.after(dropScratch)

    // Active work must stay active; never reset it back to approved.
    const live = await scratchProject("active", { progress: 55 })
    const waiting = await scratchProject("pending")
    const conflict = await conflictFor(live, waiting)

    const res = await call(`/conflicts/${conflict._id}/resolve`, {
      token: tokens.admin, method: "PUT", body: { action: "approve_both" },
    })
    assert.equal(res.status, 200, "an in-flight project must not block the resolution")

    const after = await Project.findById(live._id).lean()
    assert.equal(after.status, "active", "in-flight work was rolled back to approved")
    assert.equal(after.progress, 55, "progress must survive the resolution")

    assert.equal((await Project.findById(waiting._id).lean()).status, "approved",
      "the project that WAS awaiting a decision must still be approved")
    assert.equal((await Conflict.findById(conflict._id).lean()).status, "resolved_both")
  })

  await t.test("regression: a project awaiting an officer reschedule cannot be re-approved by another conflict (F-1)", async (st) => {
    st.after(dropScratch)

    // When one conflict defers a project, a second conflict cannot undo that
    // deferral by re-approving the same project.
    const deferred = await scratchProject("pending", { mcdmScore: 3 })
    const winner = await scratchProject("pending", { mcdmScore: 9 })
    const third = await scratchProject("pending", { mcdmScore: 5 })

    const first = await conflictFor(deferred, winner)
    const second = await conflictFor(deferred, third)

    const deferral = await call(`/conflicts/${first._id}/resolve`, {
      token: tokens.admin, method: "PUT", body: { action: "reject_lower" },
    })
    assert.equal(deferral.status, 200)
    assert.equal((await Project.findById(deferred._id).lean()).status, "rescheduled")
    assert.equal((await Conflict.findById(first._id).lean()).status, "awaiting_officer")

    const res = await call(`/conflicts/${second._id}/resolve`, {
      token: tokens.admin, method: "PUT", body: { action: "approve_both" },
    })
    assert.equal(res.status, 409, "a deferred project was approved out from under an open reschedule")
    assert.equal(res.body.error.code, "CONFLICT")
    assert.match(res.body.message, /awaiting its officer's response/,
      "the refusal must say why, not just that it failed")

    assert.equal((await Project.findById(deferred._id).lean()).status, "rescheduled",
      "the deferral was overwritten")
    assert.equal((await Project.findById(third._id).lean()).status, "pending",
      "a refused call still wrote the other project")
    assert.equal((await Conflict.findById(first._id).lean()).status, "awaiting_officer",
      "the earlier conflict must still be awaiting its answer")
    assert.equal((await Conflict.findById(second._id).lean()).status, "pending",
      "the conflict was actioned despite the refusal")
  })

  await t.test("regression: reject_lower cannot overwrite an open deferral (F-1)", async (st) => {
    st.after(dropScratch)

    // Never replace an active reschedule with another.
    const deferred = await scratchProject("pending", { mcdmScore: 2 })
    const winner = await scratchProject("pending", { mcdmScore: 9 })
    const third = await scratchProject("pending", { mcdmScore: 8 })

    const first = await conflictFor(deferred, winner)
    const second = await conflictFor(deferred, third)

    assert.equal((await call(`/conflicts/${first._id}/resolve`, {
      token: tokens.admin, method: "PUT", body: { action: "reject_lower" },
    })).status, 200)

    const originalDate = String((await Project.findById(deferred._id).lean()).suggestedDate)

    const res = await call(`/conflicts/${second._id}/resolve`, {
      token: tokens.admin, method: "PUT", body: { action: "reject_lower" },
    })
    assert.equal(res.status, 409, "an open deferral was replaced by a second one")

    const after = await Project.findById(deferred._id).lean()
    assert.equal(after.status, "rescheduled")
    assert.equal(String(after.suggestedDate), originalDate, "the officer's suggested date changed under them")
    assert.equal((await Conflict.findById(second._id).lean()).status, "pending")
  })

  // Once the officer responds, the project becomes eligible again.
  await t.test("a conflict can be resolved once the officer has answered the earlier one (F-1)", async (st) => {
    st.after(dropScratch)

    const deferred = await scratchProject("pending", { mcdmScore: 3 })
    const winner = await scratchProject("pending", { mcdmScore: 9 })
    const third = await scratchProject("pending", { mcdmScore: 5 })

    const first = await conflictFor(deferred, winner)
    const second = await conflictFor(deferred, third)

    assert.equal((await call(`/conflicts/${first._id}/resolve`, {
      token: tokens.admin, method: "PUT", body: { action: "reject_lower" },
    })).status, 200)

    const answered = await call(`/conflicts/${first._id}/respond`, {
      token: tokens.officerA, method: "PUT", body: { action: "accept" },
    })
    assert.equal(answered.status, 200, "the owning officer must be able to answer")
    assert.equal((await Project.findById(deferred._id).lean()).status, "pending")

    const res = await call(`/conflicts/${second._id}/resolve`, {
      token: tokens.admin, method: "PUT", body: { action: "approve_both" },
    })
    assert.equal(res.status, 200, "the guard outlived the reschedule it was protecting")
    assert.equal((await Project.findById(deferred._id).lean()).status, "approved")
    assert.equal((await Conflict.findById(second._id).lean()).status, "resolved_both")
  })

  const postedProjects = []
  const postProject = async (body) => {
    const res = await call("/projects", { token: tokens.officerA, method: "POST", body })
    if (res.body?.project?._id) postedProjects.push(res.body.project._id)
    return res
  }
  const dropPostedProjects = async () => {
    if (postedProjects.length > 0) await Project.deleteMany({ _id: { $in: postedProjects.splice(0) } })
  }
  // Far from the fixtures' coordinates and in another ward, so creating these
  // raises no clash and leaves no Conflict rows behind.
  const projectBody = (over = {}) => ({
    title: "Supervisor role fixture",
    department: String(department._id),
    projectType: "road",
    description: "fixture",
    startDate: "2026-03-01",
    endDate: "2026-04-01",
    location: { ward: "Ward-99", centerCoords: { lat: 28.9, lng: 77.9 } },
    ...over,
  })

  // Denormalised clash state must stay in step with the Conflict collection on
  // both projects, not just the one being saved.
  const dropClashFixtures = async (projectIds) => {
    await Conflict.deleteMany({
      $or: [{ project1: { $in: projectIds } }, { project2: { $in: projectIds } }],
    })
    await dropPostedProjects()
    await dropScratchProjects()
  }

  await t.test("regression: a detected clash is recorded on both projects, not only the one being saved (F-2)", async (st) => {
    const here = { ward: "Ward-77", centerCoords: { lat: 28.77, lng: 77.77 } }
    const incumbent = await scratchProject("approved", {
      officer: officerB._id, createdBy: officerB._id, ward: here.ward,
      location: { centerCoords: here.centerCoords },
      startDate: new Date("2026-01-01"), endDate: new Date("2026-06-01"),
    })
    st.after(() => dropClashFixtures([incumbent._id]))

    assert.equal(incumbent.hasClash, false, "precondition: the incumbent starts clash-free")

    const res = await postProject(projectBody({
      title: "New work on occupied ground", location: here,
      startDate: "2026-02-01", endDate: "2026-05-01",
    }))
    assert.equal(res.status, 201)
    assert.equal(res.body.clashesDetected, 1, "precondition: the collision must be detected")

    const pair = await Conflict.findOne({
      $or: [
        { project1: incumbent._id, project2: res.body.project._id },
        { project1: res.body.project._id, project2: incumbent._id },
      ],
    }).lean()
    assert.ok(pair, "precondition: a conflict row must exist for the pair")

    const created = await Project.findById(res.body.project._id).lean()
    assert.equal(created.hasClash, true)
    assert.deepEqual(created.clashes.map(String), [String(pair._id)])

    const other = await Project.findById(incumbent._id).lean()
    assert.equal(other.hasClash, true,
      "the incumbent shows no clash although a conflict row names it")
    assert.deepEqual(other.clashes.map(String), [String(pair._id)],
      "the incumbent's clashes array never learned about the conflict")

    // What was persisted for the new project must match what was returned.
    assert.equal(res.body.project.hasClash, true)
    assert.equal(res.body.project.clashes.length, 1)
  })

  await t.test("regression: clearing a clash clears it on the counterpart too (F-2)", async (st) => {
    const here = { ward: "Ward-78", centerCoords: { lat: 28.78, lng: 77.78 } }
    const co_located = (title) => scratchProject("approved", {
      title, ward: here.ward, location: { centerCoords: here.centerCoords },
      startDate: new Date("2026-01-01"), endDate: new Date("2026-06-01"),
    })
    const stayer = await co_located("Stays put")
    const mover = await co_located("Moves away")
    st.after(() => dropClashFixtures([stayer._id, mover._id]))

    // Reconciling the mover records the pair on both sides.
    assert.equal((await call(`/projects/${mover._id}`, {
      token: tokens.officerA, method: "PUT",
      body: { location: { ward: here.ward, centerCoords: here.centerCoords } },
    })).status, 200)
    assert.equal((await Project.findById(stayer._id).lean()).hasClash, true,
      "precondition: both sides must be flagged before the move")

    // Moving it off the ground deletes the pending row — which is the mover's
    // doing, so the stayer is the side with no other reason to be revisited.
    assert.equal((await call(`/projects/${mover._id}`, {
      token: tokens.officerA, method: "PUT",
      body: { location: { ward: "Ward-96", centerCoords: { lat: 28.96, lng: 77.96 } } },
    })).status, 200)
    assert.equal(await Conflict.countDocuments({
      $or: [{ project1: stayer._id }, { project2: stayer._id }],
    }), 0, "precondition: the pending conflict must have been deleted")

    const after = await Project.findById(stayer._id).lean()
    assert.equal(after.clashes.length, 0)
    assert.equal(after.hasClash, false,
      "the counterpart kept a clash warning that no conflict row supports")

    const moved = await Project.findById(mover._id).lean()
    assert.equal(moved.hasClash, false)
    assert.equal(moved.clashes.length, 0)
  })

  await t.test("regression: a project supervisor must hold the supervisor role", async (st) => {
    st.after(dropPostedProjects)

    for (const [label, user] of [["a citizen", citizenUser], ["an officer", officerB], ["an admin", admin]]) {
      const res = await postProject(projectBody({ supervisor: String(user._id) }))
      assert.equal(res.status, 400, `${label} was accepted as supervisor`)
      assert.equal(res.body.error.code, "VALIDATION_ERROR")
      assert.match(res.body.message, /cannot be the supervisor/,
        "the refusal must say why, not just that it failed")
    }
  })

  // Project managers and assigned officers must always be staff.
  await t.test("regression: a project manager must be staff", async (st) => {
    st.after(dropPostedProjects)

    const refused = await postProject(projectBody({ projectManager: String(citizenUser._id) }))
    assert.equal(refused.status, 400, "a citizen was accepted as project manager")
    assert.match(refused.body.message, /cannot be the project manager/)

    const allowed = await postProject(projectBody({ projectManager: String(officerB._id) }))
    assert.equal(allowed.status, 201, "an officer must still be assignable as project manager")
  })

  await t.test("regression: a complaint cannot be assigned to a citizen", async () => {
    const Complaint = require("../../src/models/Complaint")
    const created = await call("/complaints", {
      method: "POST",
      body: { issueType: "pothole", description: "Assignment fixture", location: { ward: "Ward 12", coords: { lat: 28.67, lng: 77.45 } } },
    })
    assert.equal(created.status, 201)
    const id = created.body._id

    for (const [route, method, body] of [
      [`/complaints/${id}/assign`, "PATCH", { assignedOfficer: String(citizenUser._id) }],
      [`/complaints/${id}`, "PUT", { assignedOfficer: String(citizenUser._id) }],
    ]) {
      const res = await call(route, { token: tokens.admin, method, body })
      assert.equal(res.status, 400, `${method} ${route} accepted a citizen`)
      assert.match(res.body.message, /cannot be the assigned officer/)
    }
    // Never assigned, so the field is absent rather than null.
    assert.ok(!(await Complaint.findById(id).lean()).assignedOfficer,
      "the assignment was written despite the refusal")

    // Every staff role stays assignable — the guard excludes citizens only.
    for (const user of [officerA, supervisor, admin]) {
      const res = await call(`/complaints/${id}/assign`, {
        token: tokens.admin, method: "PATCH", body: { assignedOfficer: String(user._id) },
      })
      assert.equal(res.status, 200, `a ${user.role} must remain assignable`)
      assert.equal(String((await Complaint.findById(id).lean()).assignedOfficer), String(user._id))
    }

    await Complaint.deleteMany({ _id: id })
  })

  await t.test("regression: PUT cannot swap in a non-supervisor", async (st) => {
    st.after(dropPostedProjects)

    const created = await postProject(projectBody({ supervisor: String(supervisor._id) }))
    assert.equal(created.status, 201)
    const id = created.body.project._id

    const bad = await call(`/projects/${id}`, {
      token: tokens.officerA, method: "PUT", body: { supervisor: String(officerB._id) },
    })
    assert.equal(bad.status, 400, "PUT accepted a non-supervisor")
    assert.equal(String((await Project.findById(id).lean()).supervisor), String(supervisor._id),
      "the stored supervisor changed despite the refusal")
  })

  // The mapping is unit-tested; what needs a database is resolving the
  // recipient's role. Assigning a supervisor and then completing the work
  // notifies two different roles, so one exercise covers both.
  await t.test("regression: a notification links to the recipient's own screen (F-8)", async (st) => {
    const Notification = require("../../src/models/Notification")
    st.after(async () => {
      await Notification.deleteMany({ recipient: { $in: [supervisor._id, officerA._id] } })
      await dropPostedProjects()
    })
    await Notification.deleteMany({ recipient: { $in: [supervisor._id, officerA._id] } })

    const created = await postProject(projectBody())
    assert.equal(created.status, 201)
    const id = created.body.project._id

    // Supervisor assignment → project_assigned, addressed to the supervisor.
    assert.equal((await call(`/projects/${id}`, {
      token: tokens.officerA, method: "PUT", body: { supervisor: String(supervisor._id) },
    })).status, 200)

    const assigned = await Notification.findOne({
      recipient: supervisor._id, type: "project_assigned",
    }).lean()
    assert.ok(assigned, "precondition: assigning a supervisor must notify them")
    assert.equal(assigned.link, `/supervisor/tasks/${id}`,
      "a supervisor was linked somewhere other than the screen where they act on it")

    // Completion → project_completed, addressed to the owning officer. Same
    // destination kind, different recipient role, so it must resolve differently.
    assert.equal((await call(`/projects/${id}/approve`, { token: tokens.admin, method: "PUT", body: {} })).status, 200)
    assert.equal((await call(`/projects/${id}/progress`, {
      token: tokens.supervisor, method: "PUT", body: { progress: 100 },
    })).status, 200)

    const completed = await Notification.findOne({
      recipient: officerA._id, type: "project_completed",
    }).lean()
    assert.ok(completed, "precondition: completion must notify the owning officer")
    assert.equal(completed.link, `/officer/projects/${id}`,
      "the same project resolved to the same path for two different roles")

    // The stored shape is unchanged — `linkTo` is a producer-side instruction,
    // not a field, so nothing downstream sees a new key.
    assert.equal("linkTo" in assigned, false, "linkTo leaked into the stored document")
    // `data.projectId` is stored as the ObjectId it was given, so compare by value.
    assert.deepEqual(Object.keys(assigned.data), ["projectId"], "the data payload changed shape")
    assert.equal(String(assigned.data.projectId), id)
  })

  await t.test("a real supervisor is still assignable and can still complete the work", async (st) => {
    st.after(dropPostedProjects)

    const created = await postProject(projectBody({ supervisor: String(supervisor._id) }))
    assert.equal(created.status, 201)
    const id = created.body.project._id
    assert.equal(String(created.body.project.supervisor), String(supervisor._id))

    const reassign = await call(`/projects/${id}`, {
      token: tokens.officerA, method: "PUT", body: { supervisor: String(supervisor._id) },
    })
    assert.equal(reassign.status, 200, "reassigning the same supervisor must still work")

    // A new project is `pending`, and progress does not apply until an
    // administrator has approved it.
    const approved = await call(`/projects/${id}/approve`, { token: tokens.admin, method: "PUT", body: {} })
    assert.equal(approved.status, 200)

    const done = await call(`/projects/${id}/progress`, {
      token: tokens.supervisor, method: "PUT", body: { progress: 100 },
    })
    assert.equal(done.status, 200, "the supervisor must still be able to complete the work")
    assert.equal((await Project.findById(id).lean()).status, "completed")
  })

  await t.test("approve_both still works when both projects are live (terminal-status guard)", async (st) => {
    st.after(dropScratch)

    const a = await scratchProject("pending")
    const b = await scratchProject("pending")
    const conflict = await conflictFor(a, b)

    const res = await call(`/conflicts/${conflict._id}/resolve`, {
      token: tokens.admin, method: "PUT", body: { action: "approve_both" },
    })
    assert.equal(res.status, 200)
    assert.equal((await Project.findById(a._id).lean()).status, "approved")
    assert.equal((await Project.findById(b._id).lean()).status, "approved")
    assert.equal((await Conflict.findById(conflict._id).lean()).status, "resolved_both")
  })

  // Public complaint creation must not accept workflow or assignment fields.
  await t.test("regression: an anonymous report cannot set workflow state (P2-3)", async () => {
    const Complaint = require("../../src/models/Complaint")
    const report = {
      issueType: "pothole",
      description: "Large pothole near the school gate",
      location: { address: "MG Road", ward: "Ward 12", coords: { lat: 28.67, lng: 77.45 } },
    }

    const res = await call("/complaints", {
      method: "POST",
      body: { ...report, status: "resolved", assignedOfficer: String(admin._id), assignedDepartment: String(department._id) },
    })
    assert.equal(res.status, 201, "public intake must keep working")

    const stored = await Complaint.findById(res.body._id).lean()
    assert.equal(stored.status, "submitted", "status was attacker-controlled")
    assert.equal(stored.assignedOfficer ?? null, null, "assignedOfficer was attacker-controlled")
    assert.equal(stored.assignedDepartment ?? null, null, "assignedDepartment was attacker-controlled")
    assert.match(stored.cnrId, /^CNR-\d{6}$/, "the server still generates the tracking reference")
  })

  await t.test("staff still own complaint workflow state through their own routes", async () => {
    const Complaint = require("../../src/models/Complaint")
    const created = await call("/complaints", {
      method: "POST",
      body: { issueType: "garbage", description: "Uncollected waste", location: { ward: "Ward 12", coords: { lat: 28.67, lng: 77.45 } } },
    })
    assert.equal(created.status, 201)

    const status = await call(`/complaints/${created.body._id}/status`, {
      token: tokens.officerA, method: "PATCH", body: { status: "in_progress" },
    })
    assert.equal(status.status, 200)
    assert.equal((await Complaint.findById(created.body._id).lean()).status, "in_progress")

    const assign = await call(`/complaints/${created.body._id}/assign`, {
      token: tokens.officerA, method: "PATCH", body: { assignedOfficer: String(officerA._id) },
    })
    assert.equal(assign.status, 200)
    assert.equal(String((await Complaint.findById(created.body._id).lean()).assignedOfficer), String(officerA._id))

    const anonymous = await call(`/complaints/${created.body._id}/assign`, {
      method: "PATCH", body: { assignedOfficer: String(officerA._id) },
    })
    assert.equal(anonymous.status, 401, "assignment must stay authenticated")
  })

  // The one public list in the API, so an unpaginated read must be bounded —
  // otherwise the payload grows with the collection for ever.
  await t.test("regression: the public complaint list is capped, and says so (F-3)", async (st) => {
    const Complaint = require("../../src/models/Complaint")
    const bulk = []
    for (let i = 0; i < 250; i++) {
      bulk.push({
        cnrId: `CNR-9${String(i).padStart(5, "0")}`,
        issueType: i % 2 ? "pothole" : "drainage",
        description: `Bulk report ${i}`,
        location: { address: `Road ${i}`, ward: `Ward-${i % 5}`, coords: { lat: 28.6, lng: 77.4 } },
        status: i % 4 === 0 ? "resolved" : "submitted",
        createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000),
        updatedAt: new Date(Date.UTC(2026, 0, 2) + i * 60_000),
      })
    }
    // Raw driver: these need fixed cnrIds, and the pre-save hook derives one
    // from a document count, which would collide across 250 sequential creates.
    await Complaint.collection.insertMany(bulk)
    st.after(() => Complaint.deleteMany({ cnrId: { $regex: /^CNR-9/ } }))

    const total = await Complaint.countDocuments()
    assert.ok(total > 200, "precondition: more complaints than the cap")

    const res = await call("/complaints")
    assert.equal(res.status, 200, "the public list must stay public")
    assert.equal(res.body.length, 200, "an unpaginated public read returned an unbounded row set")

    // Truncation must never be silent: the true total is always reported, so a
    // client can compare it against what it received.
    assert.equal(res.headers.get("x-total-count"), String(total),
      "X-Total-Count must be sent even when unpaginated")

    // Newest first: the cap keeps the most recent window.
    for (let i = 1; i < res.body.length; i++) {
      assert.ok(new Date(res.body[i - 1].createdAt) >= new Date(res.body[i].createdAt),
        "the capped read must still be newest-first")
    }

    // Pagination still reaches past the cap.
    const paged = await call("/complaints?page=2&limit=200")
    assert.equal(paged.status, 200)
    assert.equal(paged.headers.get("x-total-count"), String(total))
    assert.ok(paged.body.length > 0, "a caller that needs more must be able to page")
  })

  await t.test("GET /api/complaints/stats reports city-wide figures without authentication (F-3)", async (st) => {
    const Complaint = require("../../src/models/Complaint")
    await Complaint.deleteMany({})
    await Complaint.collection.insertMany([
      { cnrId: "CNR-800001", issueType: "pothole", description: "a", location: { ward: "Ward-A", coords: { lat: 28.6, lng: 77.4 } }, status: "resolved", assignedDepartment: String(department._id), createdAt: new Date(Date.UTC(2026, 0, 1)), updatedAt: new Date(Date.UTC(2026, 0, 11)) },
      { cnrId: "CNR-800002", issueType: "pothole", description: "b", location: { ward: "Ward-A", coords: { lat: 28.6, lng: 77.4 } }, status: "submitted", assignedDepartment: String(department._id), createdAt: new Date(Date.UTC(2026, 1, 1)), updatedAt: new Date(Date.UTC(2026, 1, 1)) },
      { cnrId: "CNR-800003", issueType: "garbage", description: "c", location: { ward: "Ward-B", coords: { lat: 28.6, lng: 77.4 } }, status: "in_progress", createdAt: new Date(Date.UTC(2026, 1, 2)), updatedAt: new Date(Date.UTC(2026, 1, 2)) },
    ])
    st.after(() => Complaint.deleteMany({}))

    const res = await call("/complaints/stats")
    assert.equal(res.status, 200, "the citizen dashboard's figures must be reachable without a session")

    // The figures the public page reports, counted in the database rather than
    // derived from a downloaded table.
    assert.equal(res.body.total, 3)
    assert.equal(res.body.open, 2)
    assert.equal(res.body.closed, 1)
    assert.equal(res.body.byStatus.resolved, 1)
    assert.equal(res.body.byIssueType.pothole, 2)
    assert.deepEqual(res.body.byWard.find((w) => w.ward === "Ward-A"), { ward: "Ward-A", count: 2 })
    assert.equal(res.body.averages.resolvedCount, 1)
    assert.equal(Math.round(res.body.averages.resolutionDays), 10)

    // Both series, keyed as documented: filed by createdAt, resolved by updatedAt.
    assert.deepEqual(res.body.monthly, [{ period: "2026-01", count: 1 }, { period: "2026-02", count: 2 }])
    assert.deepEqual(res.body.resolvedMonthly, [{ period: "2026-01", count: 1 }])

    // Internal allocation is not published, and cannot be recovered by asking:
    // `assignedDepartment` is redacted for an anonymous caller on the list, so a
    // per-department count here would hand it straight back.
    assert.equal("byDepartment" in res.body, false, "department allocation was published")
    assert.equal("unassigned" in res.body, false, "unassigned workload was published")

    const filtered = await call(`/complaints/stats?department=${department._id}`)
    assert.equal(filtered.status, 200)
    assert.equal(filtered.body.total, 3, "?department must be ignored, not honoured")

    // Filters that ARE safe still work.
    const byWard = await call("/complaints/stats?ward=Ward-B")
    assert.equal(byWard.body.total, 1)
    const bad = await call("/complaints/stats?from=not-a-date")
    assert.equal(bad.status, 400, "an unparseable filter must be reported, not ignored")
  })

  // `/stats` is registered before `/:id`, which accepts a CNR as well as an
  // ObjectId — without that ordering it would be looked up as a tracking
  // reference and answered with 404.
  await t.test("the stats route is not captured by the CNR lookup (F-3)", async () => {
    const res = await call("/complaints/stats")
    assert.equal(res.status, 200)
    assert.equal(typeof res.body.total, "number", "the response was the complaint lookup, not the aggregate")
  })


  await t.test("errors carry the standard envelope with a machine-readable code", async () => {
    const res = await call("/projects/not-an-object-id", { token: tokens.admin })
    assert.equal(res.status, 400)
    assert.equal(res.body.success, false)
    assert.equal(typeof res.body.error.code, "string")
    assert.equal(res.body.message, res.body.error.message)
  })

  await t.test("an unknown route returns the same envelope, not HTML", async () => {
    const res = await call("/no-such-route", { token: tokens.admin })
    assert.equal(res.status, 404)
    assert.equal(res.body.success, false)
    assert.equal(res.body.error.code, "ROUTE_NOT_FOUND")
  })

  // List endpoints return a bare array; moving that into an object would be a
  // breaking change, so the shape is pinned.
  await t.test("list endpoints still return bare arrays", async () => {
    for (const path of ["/projects", "/conflicts", "/complaints"]) {
      const res = await call(path, { token: tokens.admin })
      assert.equal(res.status, 200, `${path} -> ${res.status}`)
      assert.ok(Array.isArray(res.body), `${path} must return an array`)
    }
  })

  await t.test("pagination is opt-in and reports the documented headers", async () => {
    const unpaged = await call("/projects", { token: tokens.admin })
    assert.equal(unpaged.headers.get("x-total-count"), null, "headers must not appear unrequested")

    const paged = await call("/projects?page=1&limit=1", { token: tokens.admin })
    assert.equal(paged.body.length, 1)
    assert.equal(paged.headers.get("x-total-count"), "2")
    assert.equal(paged.headers.get("x-total-pages"), "2")
    assert.equal(paged.headers.get("x-has-next"), "true")
    assert.equal(paged.headers.get("x-has-previous"), "false")
  })

  // Pagination metadata must respect the caller's scope.
  await t.test("regression: paginated totals respect the caller's scope (S4 parallel count)", async () => {
    const res = await call("/projects?page=1&limit=10", { token: tokens.officerA })
    assert.equal(res.headers.get("x-total-count"), "1",
      "the count must be scoped exactly like the rows")
    assert.equal(res.body.length, 1)
  })


  await t.test("every response carries a correlation id", async () => {
    const res = await call("/projects", { token: tokens.admin })
    assert.ok(res.headers.get("x-request-id"), "no correlation id returned")
  })

  await t.test("a supplied correlation id is echoed back", async () => {
    const res = await fetch(`${base}/projects`, {
      headers: { Authorization: `Bearer ${tokens.admin}`, "X-Request-Id": "s5-fixed-id" },
    })
    assert.equal(res.headers.get("x-request-id"), "s5-fixed-id")
  })

  await t.test("health reports subsystem state without authentication", async () => {
    const res = await call("/health")
    assert.equal(res.status, 200)
    assert.equal(res.body.status, "ok")
    assert.equal(res.body.database, "connected")
    assert.ok(res.body.subsystems, "health must expose subsystem diagnostics")
  })
})

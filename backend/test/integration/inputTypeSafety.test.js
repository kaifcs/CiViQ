// Reject malformed input with 400 and prevent redaction from being bypassed.

const test = require("node:test")
const assert = require("node:assert/strict")
const http = require("node:http")
const { mongoAvailable, dropAndDisconnect, clearCollections, SKIP_REASON } = require("../helpers/db")
const { userDoc, departmentDoc } = require("../helpers/fixtures")

const PASSWORD = "civiq123456"

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app)
    server.listen(0, "127.0.0.1", () => resolve(server))
  })
}

test("malformed input is refused, not mishandled", async (t) => {
  if (!(await mongoAvailable())) return t.skip(SKIP_REASON)

  const app = require("../../src/app")
  const User = require("../../src/models/User")
  const Complaint = require("../../src/models/Complaint")
  const Department = require("../../src/models/Department")

  const server = await listen(app)
  const base = `http://127.0.0.1:${server.address().port}/api`

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await dropAndDisconnect()
  })

  await clearCollections()

  const department = await Department.create(departmentDoc())

  const mk = async (role, email) => {
    const user = new User(
      userDoc({
        role,
        email,
        password: PASSWORD,
        department: String(department._id),
      }),
    )
    await user.save()
    return user
  }

  await mk("admin", "its-admin@s5.test")
  const officer = await mk("officer", "its-officer@s5.test")
  const other = await mk("officer", "its-other@s5.test")

  const call = async (path, { token, method = "GET", body } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

    return {
      status: res.status,
      headers: res.headers,
      body: await res.json().catch(() => null),
    }
  }

  const login = async (email) => {
    const res = await call("/auth/login", {
      method: "POST",
      body: { email, password: PASSWORD },
    })

    assert.equal(
      res.status,
      200,
      `login failed for ${email}: ${JSON.stringify(res.body)}`,
    )

    return res.body.token
  }

  const adminToken = await login("its-admin@s5.test")
  const officerToken = await login("its-officer@s5.test")

  const refused = (res, label) => {
    assert.notEqual(
      res.status,
      429,
      `${label} was rate limited; the test spent too much of the auth budget`,
    )
    assert.equal(
      res.status,
      400,
      `${label} did not return 400: ${res.status} ${JSON.stringify(res.body)}`,
    )
    assert.equal(res.body.success, false)
    assert.equal(res.body.error.code, "VALIDATION_ERROR")
    assert.equal(res.body.message, res.body.error.message, "envelope shape changed")
  }

  await t.test("a non-string credential is a 400, not a 500", async (st) => {
    await st.test("login email", async () => {
      refused(
        await call("/auth/login", {
          method: "POST",
          body: { email: { $ne: null }, password: PASSWORD },
        }),
        "object email",
      )
    })

    await st.test("login email as an array that looks like an address", async () => {
      refused(
        await call("/auth/login", {
          method: "POST",
          body: {
            email: ["its-officer@s5.test"],
            password: PASSWORD,
          },
        }),
        "array email",
      )
    })

    await st.test("login password", async () => {
      refused(
        await call("/auth/login", {
          method: "POST",
          body: {
            email: "its-officer@s5.test",
            password: { $ne: null },
          },
        }),
        "object password",
      )
    })

    await st.test("registration name", async () => {
      refused(
        await call("/auth/register", {
          token: adminToken,
          method: "POST",
          body: {
            fullName: { $ne: null },
            email: "new@s5.test",
            password: PASSWORD,
            role: "officer",
          },
        }),
        "object fullName",
      )
    })

    await st.test("password change", async () => {
      refused(
        await call("/auth/password", {
          token: officerToken,
          method: "PUT",
          body: {
            currentPassword: { $ne: null },
            newPassword: "replacement123",
          },
        }),
        "object currentPassword",
      )
    })

    await st.test("every writable profile field", async () => {
      for (const field of ["fullName", "phone", "avatar"]) {
        refused(
          await call("/auth/profile", {
            token: officerToken,
            method: "PUT",
            body: { [field]: { $ne: null } },
          }),
          `object ${field}`,
        )
      }
    })
  })

  await t.test("a malformed credential never authenticates", async () => {
    const res = await call("/auth/login", {
      method: "POST",
      body: {
        email: { $ne: null },
        password: { $ne: null },
      },
    })

    assert.equal(res.status, 400)
    assert.ok(!res.body.token, "a token was issued for a malformed credential")
  })

  await t.test("the profile is unchanged by a refused update", async () => {
    const before = await User.findById(officer._id).lean()

    await call("/auth/profile", {
      token: officerToken,
      method: "PUT",
      body: { fullName: { $ne: null } },
    })

    const after = await User.findById(officer._id).lean()

    assert.equal(after.fullName, before.fullName)
    assert.equal(after.phone, before.phone)
  })

  await t.test("valid credentials still work", async () => {
    const ok = await call("/auth/login", {
      method: "POST",
      body: {
        email: "its-officer@s5.test",
        password: PASSWORD,
      },
    })

    assert.equal(ok.status, 200)
    assert.ok(ok.body.token)

    const wrong = await call("/auth/login", {
      method: "POST",
      body: {
        email: "its-officer@s5.test",
        password: "wrong-password",
      },
    })

    assert.equal(
      wrong.status,
      401,
      "a wrong password must stay 401, not become 400",
    )

    const profile = await call("/auth/profile", {
      token: officerToken,
      method: "PUT",
      body: {
        fullName: "Renamed",
        phone: "9999999999",
      },
    })

    assert.equal(profile.status, 200)
    assert.equal(profile.body.user.fullName, "Renamed")

    const blank = await call("/auth/profile", {
      token: officerToken,
      method: "PUT",
      body: { fullName: "   " },
    })

    assert.equal(
      blank.status,
      400,
      "the blank-name rule must survive the type check in front of it",
    )
    assert.equal(blank.body.message, "Full name cannot be empty")
  })

  await t.test(
    "an unauthenticated caller cannot filter by internal allocation",
    async (st) => {
      await Complaint.deleteMany({})

      const mkComplaint = (over) =>
        Complaint.create({
          issueType: "pothole",
          description: "fixture",
          location: {
            ward: "Ward-1",
            coords: {
              lat: 28.6692,
              lng: 77.4538,
            },
          },
          ...over,
        })

      await mkComplaint({
        description: "assigned to officer",
        assignedOfficer: officer._id,
        assignedDepartment: String(department._id),
      })

      await mkComplaint({
        description: "assigned to other",
        assignedOfficer: other._id,
      })

      await mkComplaint({
        description: "unassigned",
      })

      const all = await call("/complaints")

      assert.equal(all.status, 200)
      assert.equal(all.body.length, 3)

      await st.test("the fields are redacted to begin with", () => {
        for (const complaint of all.body) {
          assert.ok(!("assignedOfficer" in complaint))
          assert.ok(!("assignedDepartment" in complaint))
        }
      })

      await st.test("?assignedOfficer does not narrow the result", async () => {
        const res = await call(`/complaints?assignedOfficer=${officer._id}`)

        assert.equal(res.status, 200)
        assert.equal(
          res.body.length,
          3,
          "the filter was honoured, which re-exposes the redacted assignment",
        )
      })

      await st.test("?department does not narrow the result", async () => {
        const res = await call(`/complaints?department=${department._id}`)

        assert.equal(res.status, 200)
        assert.equal(res.body.length, 3)
      })

      await st.test("X-Total-Count is not a counting oracle", async () => {
        const res = await call(
          `/complaints?assignedOfficer=${officer._id}`,
        )

        assert.equal(res.headers.get("x-total-count"), "3")
      })

      await st.test("an ignored filter is not validated", async () => {
        const res = await call(
          "/complaints?assignedOfficer=not-an-object-id",
        )

        assert.equal(res.status, 200)
        assert.equal(res.body.length, 3)
      })

      await st.test("filters that reveal nothing internal still work", async () => {
        const byType = await call("/complaints?issueType=pothole")
        assert.equal(byType.body.length, 3)

        const bySearch = await call("/complaints?search=unassigned")
        assert.equal(bySearch.body.length, 1)

        const byStatus = await call("/complaints?status=submitted")
        assert.equal(byStatus.body.length, 3)
      })
    },
  )

  await t.test("an authenticated caller keeps both filters", async (st) => {
    await st.test("?assignedOfficer narrows", async () => {
      const res = await call(
        `/complaints?assignedOfficer=${officer._id}`,
        { token: officerToken },
      )

      assert.equal(res.status, 200)
      assert.equal(res.body.length, 1)
      assert.equal(res.body[0].description, "assigned to officer")
    })

    await st.test("?department narrows", async () => {
      const res = await call(
        `/complaints?department=${department._id}`,
        { token: officerToken },
      )

      assert.equal(res.status, 200)
      assert.equal(res.body.length, 1)
    })

    await st.test("the rows are not redacted", async () => {
      const res = await call("/complaints", {
        token: officerToken,
      })

      assert.ok(res.body.some((c) => "assignedOfficer" in c))
    })

    await st.test("an invalid id is still rejected for a staff caller", async () => {
      const res = await call(
        "/complaints?assignedOfficer=not-an-object-id",
        { token: officerToken },
      )

      assert.equal(res.status, 400)
      assert.equal(res.body.error.code, "VALIDATION_ERROR")
    })
  })
})
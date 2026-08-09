// Auth input validation; credential fields must be primitive strings.
const test = require("node:test")
const assert = require("node:assert/strict")
const {
  validateRegisterInput, validateLoginInput, isString, CREATABLE_ROLES,
} = require("../../src/utils/validators")

const NON_STRINGS = {
  object: { $ne: null },
  array: ["value"],
  arrayEmail: ["real@civiq.test"],
  number: 12345,
  boolean: true,
  null: null,
}

const validRegister = {
  fullName: "Full Name",
  email: "person@civiq.test",
  password: "civiq12345",
  role: "officer",
}

test("isString accepts only primitive strings", () => {
  assert.equal(isString("x"), true)
  assert.equal(isString(""), true, "emptiness is a separate question from type")
  for (const [label, value] of Object.entries(NON_STRINGS)) {
    assert.equal(isString(value), false, `${label} was treated as a string`)
  }
  assert.equal(isString(undefined), false)
})

test("registration rejects a non-string in every string field", async (t) => {
  for (const field of ["fullName", "email", "password"]) {
    await t.test(field, () => {
      for (const [label, value] of Object.entries(NON_STRINGS)) {
        const message = validateRegisterInput({ ...validRegister, [field]: value })
        assert.ok(
          message,
          `${field} as ${label} was accepted, and would reach a string method or bcrypt`
        )
        assert.equal(typeof message, "string")
      }
    })
  }
})

test("regression: an array that coerces to a valid email is still rejected", () => {
  assert.equal(
    validateRegisterInput({
      ...validRegister,
      email: ["real@civiq.test"],
    }),
    "A valid email address is required"
  )
})

test("login rejects a non-string email or password", async (t) => {
  for (const field of ["email", "password"]) {
    await t.test(field, () => {
      for (const [label, value] of Object.entries(NON_STRINGS)) {
        const message = validateLoginInput({
          email: "person@civiq.test",
          password: "civiq12345",
          [field]: value,
        })
        assert.ok(message, `${field} as ${label} was accepted`)
      }
    })
  }
})

// Wrong types must remain indistinguishable from missing credentials.
test("every login failure converges on one message", () => {
  const missing = validateLoginInput({})
  const messages = new Set([missing])

  for (const value of Object.values(NON_STRINGS)) {
    messages.add(validateLoginInput({
      email: value,
      password: "civiq12345",
    }))
    messages.add(validateLoginInput({
      email: "person@civiq.test",
      password: value,
    }))
  }

  assert.equal(
    messages.size,
    1,
    `a wrong type is distinguishable from a missing field: ${[...messages].join(" | ")}`
  )
  assert.equal(missing, "Email and password are required")
})

test("valid input still passes", () => {
  assert.equal(validateRegisterInput(validRegister), null)
  assert.equal(
    validateLoginInput({
      email: "person@civiq.test",
      password: "civiq12345",
    }),
    null
  )

  for (const role of CREATABLE_ROLES) {
    assert.equal(validateRegisterInput({ ...validRegister, role }), null)
  }
})

// Existing validation rules remain unchanged.
test("the established validation rules are unchanged", () => {
  assert.equal(
    validateRegisterInput({ ...validRegister, fullName: "   " }),
    "Full name is required"
  )
  assert.equal(
    validateRegisterInput({ ...validRegister, fullName: "" }),
    "Full name is required"
  )
  assert.equal(
    validateRegisterInput({ ...validRegister, email: "not-an-email" }),
    "A valid email address is required"
  )
  assert.equal(
    validateRegisterInput({ ...validRegister, password: "short" }),
    "Password must be at least 8 characters long"
  )
  assert.equal(
    validateLoginInput({ email: "", password: "civiq12345" }),
    "Email and password are required"
  )
  assert.equal(
    validateLoginInput({
      email: "person@civiq.test",
      password: "",
    }),
    "Email and password are required"
  )
})

// Registration must never mint an administrator.
test("registration still refuses to create an administrator", () => {
  assert.ok(!CREATABLE_ROLES.includes("admin"))
  const message = validateRegisterInput({
    ...validRegister,
    role: "admin",
  })
  assert.equal(
    message,
    `Role must be one of: ${CREATABLE_ROLES.join(", ")}`
  )
})
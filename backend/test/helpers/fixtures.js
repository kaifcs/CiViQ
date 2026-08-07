// Every builder returns only the fields the schema requires plus the caller's
// overrides, so a test states exactly what it cares about. Values are
// deterministic, so a failure reproduces exactly.

const mongoose = require("mongoose")

const oid = () => new mongoose.Types.ObjectId()

// Ghaziabad, matching the coordinates the application works with.
const BASE_LAT = 28.6692
const BASE_LNG = 77.4538

let seq = 0
const nextSeq = () => ++seq

function departmentDoc(overrides = {}) {
  const n = nextSeq()
  return { name: `Department ${n}`, code: `D${n}`, isActive: true, ...overrides }
}

function userDoc(overrides = {}) {
  const n = nextSeq()
  return {
    fullName: `User ${n}`,
    email: `user${n}@civiq.test`,
    password: "civiq123",
    role: "officer",
    isActive: true,
    ...overrides,
  }
}

// `metres` offsets the location north of the base point, so clash tests can
// place two projects a known distance apart. `ward` is lifted out of `location`
// so it can be varied without restating the coordinates.
function projectDoc(overrides = {}) {
  const n = nextSeq()
  const { metres = 0, ward = "Ward-1", location, ...rest } = overrides
  return {
    title: `Project ${n}`,
    projectId: `PRJ-TEST-${n}`,
    department: oid(),
    createdBy: oid(),
    projectType: "road",
    description: "fixture",
    startDate: new Date("2025-01-01"),
    endDate: new Date("2025-06-01"),
    status: "active",
    priority: "Medium",
    location: {
      ward,
      city: "Ghaziabad",
      area: 500,
      centerCoords: { lat: BASE_LAT + metres / 111320, lng: BASE_LNG },
      ...location,
    },
    ...rest,
  }
}

function notificationDoc(overrides = {}) {
  const n = nextSeq()
  return {
    recipient: oid(),
    type: "project_approved",
    title: `Notification ${n}`,
    message: `Message ${n}`,
    category: "project",
    priority: "normal",
    read: false,
    archived: false,
    ...overrides,
  }
}

// Shaped as `protect` attaches it, for pure authorization tests.
const asUser = (role, id = oid()) => ({ _id: id, role })

module.exports = {
  oid, asUser, departmentDoc, userDoc, projectDoc, notificationDoc,
  BASE_LAT, BASE_LNG,
}

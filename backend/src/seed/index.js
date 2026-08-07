// Development fixture loader — DESTRUCTIVE. Empties all seven collections in
// the database MONGODB_URI names, in dependency order, before inserting. Never
// point it at production.

// Documents go through Model.create() so the pre-save hooks run, and Project and
// Complaint strictly sequentially because their ids derive from a document count.

// Fixture values must match the runtime scale and vocabulary: `mcdmScore` is the
// engine's 0-10 `score`, and `tenderStatus` uses the keys its tenderMap reads.

const mongoose = require("mongoose")
const dotenv = require("dotenv")
dotenv.config()

const { logger } = require("../utils/logger")

const Department = require("../models/Department")
const User = require("../models/User")
const Project = require("../models/Project")
const Complaint = require("../models/Complaint")
const Conflict = require("../models/Conflict")
const Notification = require("../models/Notification")
const AuditLog = require("../models/AuditLog")

const { NOTIFICATION_TYPES, metadataForType } = require("../config/notificationTypes")

const SEED_PASSWORD = "civiq123"

// Relative to today, so the seeded timelines stay sensible whenever it is run.
function daysFromNow(days) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d
}

const departmentDefs = [
  { name: "Public Works Department", code: "PWD", description: "Roads, footpaths, flyovers and general municipal civil works.", color: "#E63946" },
  { name: "Water Supply", code: "WS", description: "Potable water pipelines, pumping stations and distribution.", color: "#457B9D" },
  { name: "Electricity", code: "ELEC", description: "Street lighting and municipal electrical infrastructure.", color: "#F4A261" },
  { name: "Traffic Engineering", code: "TE", description: "Signals, signage and road safety works.", color: "#2A9D8F" },
  { name: "Urban Planning", code: "UP", description: "Zoning, utility ducting and long-range city infrastructure planning.", color: "#6D6875" },
  { name: "Sanitation", code: "SAN", description: "Solid waste collection and public sanitation works.", color: "#8D99AE" },
  { name: "Health", code: "HLTH", description: "Public health infrastructure and sanitation-linked health works.", color: "#EF476F" },
  { name: "Parks & Horticulture", code: "PARK", description: "Parks, green belts and horticultural maintenance.", color: "#06D6A0" },
  { name: "Smart City Cell", code: "SCC", description: "ICT-enabled and smart-city infrastructure projects.", color: "#118AB2" },
  { name: "Drainage & Sewerage", code: "DS", description: "Stormwater drainage and sewer network works.", color: "#073B4C" },
]


const userDefs = [
  { fullName: "Rajesh Kumar",    email: "rajesh.kumar@civiq.in",    role: "admin",      deptCode: "PWD",  phone: "9876500001" },
  { fullName: "Suresh Singh",    email: "suresh.singh@civiq.in",    role: "supervisor", deptCode: "PWD",  phone: "9876500002" },
  { fullName: "Anjali Verma",    email: "anjali.verma@civiq.in",    role: "supervisor", deptCode: "WS",   phone: "9876500003" },
  { fullName: "Amit Sharma",     email: "amit.sharma@civiq.in",     role: "officer",    deptCode: "PWD",  phone: "9876500004" },
  { fullName: "Mohan Kumar",     email: "mohan.kumar@civiq.in",     role: "officer",    deptCode: "WS",   phone: "9876500005" },
  { fullName: "Vinay Pandey",    email: "vinay.pandey@civiq.in",    role: "officer",    deptCode: "ELEC", phone: "9876500006" },
  { fullName: "Priya Singh",     email: "priya.singh@civiq.in",     role: "officer",    deptCode: "TE",   phone: "9876500007" },
  { fullName: "Deepak Yadav",    email: "deepak.yadav@civiq.in",    role: "officer",    deptCode: "UP",   phone: "9876500008" },
  { fullName: "Neha Gupta",      email: "neha.gupta@civiq.in",      role: "officer",    deptCode: "SAN",  phone: "9876500009" },
  { fullName: "Ravi Chauhan",    email: "ravi.chauhan@civiq.in",    role: "officer",    deptCode: "DS",   phone: "9876500010" },
]

// References are the live ObjectIds returned by the earlier inserts.
function buildProjectDefs(deptByCode, admin) {
  return [
    {
      title: "Widening of GT Road, Sahibabad",
      deptCode: "PWD", projectType: "road",
      description: "Widening of GT Road carriageway from Sahibabad crossing to Vijay Chowk to ease congestion.",
      startDate: daysFromNow(-60), endDate: daysFromNow(45),
      estimatedCost: 45000000, budgetSource: "State Infrastructure Fund", tenderNumber: "GDA/PWD/2026/014",
      contractorName: "R.K. Constructions", contractorFirm: "R.K. Infra Pvt. Ltd.",
      location: { roadName: "GT Road", neighbourhood: "Sahibabad", ward: "Ward 12", zone: "Zone 2", address: "GT Road, near Vijay Chowk", centerCoords: { lat: 28.6692, lng: 77.4538 }, shape: "corridor", length: 2200, width: 24, buffer: 15 },
      status: "active", priority: "High", progress: 55,
      officerEmail: "amit.sharma@civiq.in", supervisorEmail: "suresh.singh@civiq.in",
      mcdmScore: 7.8, mcdmInputs: { conditionRating: "poor", incidents: ["pothole","waterlogging"], lastWorkYear: 2019, tenderStatus: "complete", contractorAssigned: true, roadClosure: "partial", utilityDisruption: ["water"], disruptionDays: 30 },
    },
    {
      title: "Vaishali Water Pipeline Replacement",
      deptCode: "WS", projectType: "water",
      description: "Replacement of aging cast-iron trunk main serving Sector 5, Vaishali with HDPE pipeline.",
      startDate: daysFromNow(-10), endDate: daysFromNow(80),
      estimatedCost: 32000000, budgetSource: "AMRUT 2.0", tenderNumber: "GDA/WS/2026/007",
      contractorName: "Ganga Jal Engineers", contractorFirm: "Ganga Jal Engineers Pvt. Ltd.",
      location: { roadName: "Vaishali Sector 5 Main Road", neighbourhood: "Vaishali", ward: "Ward 8", zone: "Zone 1", address: "Sector 5, Vaishali", centerCoords: { lat: 28.6450, lng: 77.3600 }, shape: "corridor", length: 1500, width: 6, buffer: 8 },
      status: "approved", priority: "Critical", progress: 10,
      officerEmail: "mohan.kumar@civiq.in", supervisorEmail: "suresh.singh@civiq.in",
      mcdmScore: 8.8, mcdmInputs: { conditionRating: "critical", incidents: ["pipeline_burst","low_pressure"], lastWorkYear: 2012, tenderStatus: "complete", contractorAssigned: true, roadClosure: "none", utilityDisruption: [], disruptionDays: 0 },
    },
    {
      title: "Raj Nagar Streetlight Upgrade",
      deptCode: "ELEC", projectType: "electricity",
      description: "Replacement of legacy sodium-vapour streetlights with LED fixtures across Raj Nagar.",
      startDate: daysFromNow(-120), endDate: daysFromNow(-15),
      estimatedCost: 9000000, budgetSource: "Smart City Mission", tenderNumber: "GDA/ELEC/2025/041",
      contractorName: "Bright Lite Corp", contractorFirm: "Bright Lite Corporation",
      location: { roadName: "Raj Nagar Main Road", neighbourhood: "Raj Nagar", ward: "Ward 5", zone: "Zone 1", address: "Raj Nagar, Ghaziabad", centerCoords: { lat: 28.6500, lng: 77.4200 }, shape: "corridor", length: 3000, width: 10, buffer: 5 },
      status: "completed", priority: "Medium", progress: 100, actualEndDate: daysFromNow(-18),
      officerEmail: "vinay.pandey@civiq.in", supervisorEmail: "anjali.verma@civiq.in",
      mcdmScore: 6.2, mcdmInputs: { conditionRating: "fair", incidents: ["streetlight_outage"], lastWorkYear: 2010, tenderStatus: "complete", contractorAssigned: true, roadClosure: "none", utilityDisruption: [], disruptionDays: 0 },
    },
    {
      title: "Smart Traffic Signals, Kavi Nagar",
      deptCode: "TE", projectType: "other",
      description: "Installation of adaptive smart traffic signals at four major Kavi Nagar intersections.",
      startDate: daysFromNow(-5), endDate: daysFromNow(70),
      estimatedCost: 21000000, budgetSource: "Smart City Cell Fund", tenderNumber: "GDA/TE/2026/003",
      contractorName: "Signal Tech India", contractorFirm: "Signal Tech India Ltd.",
      location: { roadName: "Kavi Nagar Crossing", neighbourhood: "Kavi Nagar", ward: "Ward 9", zone: "Zone 2", address: "Kavi Nagar Main Crossing", centerCoords: { lat: 28.6602, lng: 77.4331 }, shape: "circle", area: 900, buffer: 20 },
      status: "active", priority: "High", progress: 30,
      officerEmail: "priya.singh@civiq.in", supervisorEmail: "anjali.verma@civiq.in",
      mcdmScore: 7.1, mcdmInputs: { conditionRating: "fair", incidents: ["traffic_congestion"], lastWorkYear: 2021, tenderStatus: "complete", contractorAssigned: true, roadClosure: "partial", utilityDisruption: ["electricity"], disruptionDays: 10 },
    },
    {
      title: "Lohia Nagar Drainage Improvement",
      deptCode: "DS", projectType: "sewage",
      description: "Desilting and capacity augmentation of the storm drain network in Lohia Nagar to prevent monsoon waterlogging.",
      startDate: daysFromNow(20), endDate: daysFromNow(110),
      estimatedCost: 18500000, budgetSource: "Municipal Corporation Fund", tenderNumber: "GDA/DS/2026/019",
      contractorName: "Jal Nirmaan Pvt Ltd", contractorFirm: "Jal Nirmaan Pvt. Ltd.",
      location: { roadName: "Lohia Nagar Main Drain", neighbourhood: "Lohia Nagar", ward: "Ward 14", zone: "Zone 3", address: "Lohia Nagar, Ghaziabad", centerCoords: { lat: 28.6600, lng: 77.4400 }, shape: "corridor", length: 1800, width: 4, buffer: 6 },
      status: "pending", priority: "High", progress: 0,
      officerEmail: "ravi.chauhan@civiq.in", supervisorEmail: "suresh.singh@civiq.in",
      mcdmScore: 7.4, mcdmInputs: { conditionRating: "poor", incidents: ["waterlogging","drain_blockage"], lastWorkYear: 2017, tenderStatus: "in_process", contractorAssigned: false, roadClosure: "none", utilityDisruption: [], disruptionDays: 0 },
    },
    {
      title: "Indirapuram Park Redevelopment",
      deptCode: "PARK", projectType: "parks",
      description: "Redevelopment of the central Indirapuram park with new pathways, seating and irrigation.",
      startDate: daysFromNow(15), endDate: daysFromNow(95),
      estimatedCost: 12000000, budgetSource: "Parks Development Fund", tenderNumber: "GDA/PARK/2026/006",
      contractorName: "GreenScape Landscapes", contractorFirm: "GreenScape Landscapes LLP",
      location: { roadName: "Nyay Khand Road", neighbourhood: "Indirapuram", ward: "Ward 21", zone: "Zone 4", address: "Nyay Khand II, Indirapuram", centerCoords: { lat: 28.6461, lng: 77.3720 }, shape: "polygon", area: 12000, buffer: 0 },
      status: "approved", priority: "Low", progress: 0,
      officerEmail: "deepak.yadav@civiq.in", supervisorEmail: "anjali.verma@civiq.in",
      mcdmScore: 4.9, mcdmInputs: { conditionRating: "fair", incidents: [], lastWorkYear: 2015, tenderStatus: "complete", contractorAssigned: true, roadClosure: "none", utilityDisruption: [], disruptionDays: 0 },
    },
    {
      title: "Vasundhara Footpath Construction",
      deptCode: "SAN", projectType: "other",
      description: "Construction of continuous paved footpaths along Sector 4 and 5, Vasundhara, with waste bin placements.",
      startDate: daysFromNow(30), endDate: daysFromNow(100),
      estimatedCost: 8600000, budgetSource: "Sanitation Improvement Fund", tenderNumber: "GDA/SAN/2026/011",
      contractorName: "Nagar Nirman Co.", contractorFirm: "Nagar Nirman Company",
      location: { roadName: "Sector 4-5 Link Road", neighbourhood: "Vasundhara", ward: "Ward 18", zone: "Zone 3", address: "Sector 4, Vasundhara", centerCoords: { lat: 28.6664, lng: 77.3931 }, shape: "corridor", length: 2600, width: 3, buffer: 2 },
      status: "pending", priority: "Medium", progress: 0,
      officerEmail: "neha.gupta@civiq.in", supervisorEmail: "suresh.singh@civiq.in",
      mcdmScore: 4.0, mcdmInputs: { conditionRating: "fair", incidents: ["garbage_accumulation"], lastWorkYear: 2016, tenderStatus: "in_process", contractorAssigned: false, roadClosure: "none", utilityDisruption: [], disruptionDays: 0 },
    },
    {
      title: "Hapur Road Flyover Maintenance",
      deptCode: "PWD", projectType: "road",
      description: "Structural maintenance and resurfacing of the Hapur Road flyover deck and expansion joints.",
      startDate: daysFromNow(-30), endDate: daysFromNow(40),
      estimatedCost: 27000000, budgetSource: "State Infrastructure Fund", tenderNumber: "GDA/PWD/2026/022",
      contractorName: "R.K. Constructions", contractorFirm: "R.K. Infra Pvt. Ltd.",
      location: { roadName: "Hapur Road", neighbourhood: "Ghaziabad City", ward: "Ward 3", zone: "Zone 1", address: "Hapur Road Flyover", centerCoords: { lat: 28.6733, lng: 77.4392 }, shape: "corridor", length: 950, width: 18, buffer: 10 },
      status: "rescheduled", priority: "Critical", progress: 20, suggestedDate: daysFromNow(55),
      officerEmail: "amit.sharma@civiq.in", supervisorEmail: "suresh.singh@civiq.in",
      adminNote: "Rescheduled to avoid clash with the festival season traffic diversion plan.",
      mcdmScore: 8.2, mcdmInputs: { conditionRating: "critical", incidents: ["structural_crack"], lastWorkYear: 2014, tenderStatus: "complete", contractorAssigned: true, roadClosure: "full", utilityDisruption: [], disruptionDays: 45 },
    },
    {
      title: "Shastri Nagar Sewer Line Upgrade",
      deptCode: "DS", projectType: "sewage",
      description: "Upgrade of the undersized sewer trunk line serving Shastri Nagar to handle increased load.",
      startDate: daysFromNow(-15), endDate: daysFromNow(60),
      estimatedCost: 19800000, budgetSource: "AMRUT 2.0", tenderNumber: "GDA/DS/2026/009",
      contractorName: "Jal Nirmaan Pvt Ltd", contractorFirm: "Jal Nirmaan Pvt. Ltd.",
      location: { roadName: "Shastri Nagar Main Road", neighbourhood: "Shastri Nagar", ward: "Ward 6", zone: "Zone 1", address: "Shastri Nagar, Ghaziabad", centerCoords: { lat: 28.6787, lng: 77.4290 }, shape: "corridor", length: 1300, width: 5, buffer: 6 },
      status: "active", priority: "High", progress: 40,
      officerEmail: "ravi.chauhan@civiq.in", supervisorEmail: "suresh.singh@civiq.in",
      mcdmScore: 7.6, mcdmInputs: { conditionRating: "poor", incidents: ["sewer_overflow"], lastWorkYear: 2013, tenderStatus: "complete", contractorAssigned: true, roadClosure: "partial", utilityDisruption: ["water"], disruptionDays: 20 },
    },
    {
      title: "Sector 4 Vasundhara Utility Duct Installation",
      deptCode: "UP", projectType: "other",
      description: "Installation of a shared underground utility duct along Sector 4, Vasundhara for future cabling.",
      startDate: daysFromNow(-40), endDate: daysFromNow(5),
      estimatedCost: 15200000, budgetSource: "Urban Planning Capital Fund", tenderNumber: "GDA/UP/2025/037",
      contractorName: "MetroDuct Infra", contractorFirm: "MetroDuct Infra Pvt. Ltd.",
      location: { roadName: "Sector 4 Main Road", neighbourhood: "Vasundhara", ward: "Ward 18", zone: "Zone 3", address: "Sector 4, Vasundhara", centerCoords: { lat: 28.6670, lng: 77.3945 }, shape: "corridor", length: 2100, width: 2, buffer: 3 },
      status: "rejected", priority: "Medium", progress: 0,
      officerEmail: "deepak.yadav@civiq.in", supervisorEmail: "anjali.verma@civiq.in",
      rejectionReason: "Duplicate scope with the already-approved Vasundhara footpath project; resubmit as a combined proposal.",
      mcdmScore: 3.3, mcdmInputs: { conditionRating: "fair", incidents: [], lastWorkYear: 2018, tenderStatus: "planning", contractorAssigned: false, roadClosure: "none", utilityDisruption: [], disruptionDays: 0 },
    },
  ].map((def) => ({
    ...def,
    department: deptByCode[def.deptCode]._id,
    createdBy: admin._id,
  }))
}

function buildComplaintDefs(deptByCode) {
  return [
    { issueType: "pothole", description: "Large pothole on MG Road near Vijay Chowk is causing two-wheeler accidents.", location: { address: "MG Road, Vijay Nagar", ward: "Ward 12", coords: { lat: 28.6692, lng: 77.4538 } }, status: "submitted", deptCode: "PWD" },
    { issueType: "water_leak", description: "Water leaking continuously from the main pipeline near Sector 5 market for three days.", location: { address: "Sector 5 Market, Vaishali", ward: "Ward 8", coords: { lat: 28.6448, lng: 77.3598 } }, status: "acknowledged", deptCode: "WS" },
    { issueType: "pothole", description: "Multiple deep potholes on GT Road are causing night-time accidents.", location: { address: "GT Road, Ghaziabad", ward: "Ward 12", coords: { lat: 28.6730, lng: 77.4560 } }, status: "in_progress", deptCode: "PWD" },
    { issueType: "streetlight", description: "Three consecutive streetlights have not worked for over two weeks, making the stretch unsafe.", location: { address: "Raj Nagar Main Road", ward: "Ward 5", coords: { lat: 28.6502, lng: 77.4198 } }, status: "resolved", deptCode: "ELEC" },
    { issueType: "drainage", description: "Blocked drain is causing severe waterlogging every time it rains.", location: { address: "Lohia Nagar", ward: "Ward 14", coords: { lat: 28.6598, lng: 77.4402 } }, status: "submitted", deptCode: "DS" },
    { issueType: "garbage", description: "Garbage has not been collected from the community bin in over a week.", location: { address: "Nyay Khand II, Indirapuram", ward: "Ward 21", coords: { lat: 28.6463, lng: 77.3718 } }, status: "acknowledged", deptCode: "SAN" },
    { issueType: "pothole", description: "Pothole cluster near the Kavi Nagar crossing is slowing traffic and damaging vehicles.", location: { address: "Kavi Nagar Crossing", ward: "Ward 9", coords: { lat: 28.6604, lng: 77.4329 } }, status: "in_progress", deptCode: "TE" },
    { issueType: "water_leak", description: "Underground pipeline leak has left the road surface constantly waterlogged.", location: { address: "Shastri Nagar Main Road", ward: "Ward 6", coords: { lat: 28.6789, lng: 77.4288 } }, status: "resolved", deptCode: "DS" },
    { issueType: "other", description: "Encroachment on the newly built footpath is forcing pedestrians onto the road.", location: { address: "Sector 4, Vasundhara", ward: "Ward 18", coords: { lat: 28.6666, lng: 77.3933 } }, status: "submitted", deptCode: "UP" },
    { issueType: "drainage", description: "Open drain cover is a safety hazard near the park entrance.", location: { address: "Indirapuram Central Park", ward: "Ward 21", coords: { lat: 28.6459, lng: 77.3722 } }, status: "acknowledged", deptCode: "PARK" },
  ].map((def) => ({
    ...def,
    assignedDepartment: deptByCode[def.deptCode]._id.toString(),
  }))
}

async function clearCollections() {
  await Notification.deleteMany()
  await AuditLog.deleteMany()
  await Conflict.deleteMany()
  await Complaint.deleteMany()
  await Project.deleteMany()
  await User.deleteMany()
  await Department.deleteMany()
  logger.info("Cleared existing Notification, AuditLog, Conflict, Complaint, Project, User and Department collections")
}

async function seedDepartments() {
  const departments = []
  for (const def of departmentDefs) {
    departments.push(await Department.create(def))
  }
  const deptByCode = {}
  for (const dept of departments) deptByCode[dept.code] = dept
  logger.info(`Seeded ${departments.length} departments`)
  return { departments, deptByCode }
}

async function seedUsers(deptByCode) {
  const users = []
  for (const def of userDefs) {
    users.push(
      await User.create({
        fullName: def.fullName,
        email: def.email,
        password: SEED_PASSWORD, // hashed by the User pre-save hook
        role: def.role,
        department: deptByCode[def.deptCode]._id.toString(),
        phone: def.phone,
        isActive: true,
      })
    )
  }
  const userByEmail = {}
  for (const user of users) userByEmail[user.email] = user
  const admin = users.find((u) => u.role === "admin")
  logger.info(`Seeded ${users.length} users`)
  return { users, userByEmail, admin }
}

// Sequential: projectId derives from countDocuments() at save time.
async function seedProjects(deptByCode, userByEmail, admin) {
  const defs = buildProjectDefs(deptByCode, admin)
  const projects = []
  for (const def of defs) {
    const { officerEmail, supervisorEmail, ...rest } = def
    projects.push(
      await Project.create({
        ...rest,
        officer: userByEmail[officerEmail]._id,
        supervisor: userByEmail[supervisorEmail]._id,
      })
    )
  }
  logger.info(`Seeded ${projects.length} projects`)
  return projects
}

// Sequential for the same reason as seedProjects.
async function seedComplaints(deptByCode) {
  const defs = buildComplaintDefs(deptByCode)
  const complaints = []
  for (const def of defs) {
    complaints.push(await Complaint.create(def))
  }
  logger.info(`Seeded ${complaints.length} complaints`)
  return complaints
}

async function seedConflicts(projects, userByEmail, admin) {
  const defs = [
    { p1: 0, p2: 7, clashTypes: ["geographic", "timeline"], severity: "incompatible", status: "resolved_both",
      adminResolution: { action: "approve_both", coordinationNote: "Staggered lane closures agreed with both contractors.", resolvedBy: admin._id, resolvedAt: daysFromNow(-20) } },
    { p1: 1, p2: 4, clashTypes: ["worktype"], severity: "conditional", status: "pending" },
    { p1: 2, p2: 3, clashTypes: ["geographic"], severity: "conditional", status: "awaiting_officer",
      suggestedDate: daysFromNow(25) },
    { p1: 3, p2: 8, clashTypes: ["timeline", "worktype"], severity: "incompatible", status: "pending" },
    { p1: 4, p2: 9, clashTypes: ["geographic", "worktype"], severity: "conditional", status: "resolved_rejected",
      adminResolution: { action: "reject_lower", overrideCategory: "budget_priority", overrideReason: "Lower MCDM score deferred to next cycle.", overrideRef: "ADM-2026-0091", resolvedBy: admin._id, resolvedAt: daysFromNow(-5) } },
    { p1: 5, p2: 6, clashTypes: ["geographic"], severity: "conditional", status: "pending" },
    { p1: 6, p2: 9, clashTypes: ["worktype"], severity: "conditional", status: "awaiting_officer", suggestedDate: daysFromNow(40) },
    { p1: 7, p2: 8, clashTypes: ["timeline"], severity: "incompatible", status: "resolved_both",
      adminResolution: { action: "approve_both", coordinationNote: "Night-shift work agreed for the flyover to avoid the sewer crew's daytime window.", resolvedBy: admin._id, resolvedAt: daysFromNow(-8) },
      officerResponse: { action: "accept", respondedBy: userByEmail["ravi.chauhan@civiq.in"]._id, respondedAt: daysFromNow(-7) } },
    { p1: 0, p2: 2, clashTypes: ["geographic", "timeline", "worktype"], severity: "incompatible", status: "awaiting_officer",
      suggestedDate: daysFromNow(60) },
    { p1: 8, p2: 2, clashTypes: ["geographic"], severity: "conditional", status: "resolved_both",
      adminResolution: { action: "approve_both", coordinationNote: "Duct trench routed around the completed streetlight bases.", resolvedBy: admin._id, resolvedAt: daysFromNow(-2) } },
  ]

  const conflicts = []
  for (const def of defs) {
    const { p1, p2, ...rest } = def
    conflicts.push(
      await Conflict.create({
        project1: projects[p1]._id,
        project2: projects[p2]._id,
        recheckPassed: rest.status === "resolved_both" ? true : undefined,
        ...rest,
      })
    )
  }
  logger.info(`Seeded ${conflicts.length} conflicts`)
  return conflicts
}

async function seedNotifications(userByEmail, projects, complaints, conflicts) {
  const defs = [
    // Links are namespaced by the recipient's role, exactly as
    // notificationService resolves them at runtime.
    { type: NOTIFICATION_TYPES.CLASH_DETECTED, title: "Project clash detected", message: `A scheduling clash was detected between "${projects[0].title}" and "${projects[7].title}".`, recipient: "suresh.singh@civiq.in", read: false, link: `/supervisor/tasks/${projects[0]._id}`, data: { conflictId: conflicts[0]._id } },
    { type: NOTIFICATION_TYPES.PROJECT_APPROVED, title: "Project approved", message: `Your project "${projects[1].title}" has been approved.`, recipient: "mohan.kumar@civiq.in", read: true, link: `/officer/projects/${projects[1]._id}`, data: { projectId: projects[1]._id } },
    { type: NOTIFICATION_TYPES.PROJECT_REJECTED, title: "Project rejected", message: `Your project "${projects[9].title}" was rejected. See the admin note for details.`, recipient: "deepak.yadav@civiq.in", read: false, link: `/officer/projects/${projects[9]._id}`, data: { projectId: projects[9]._id } },
    { type: NOTIFICATION_TYPES.PROJECT_ASSIGNED, title: "New project assigned", message: `You have been assigned as officer for "${projects[4].title}".`, recipient: "ravi.chauhan@civiq.in", read: true, link: `/officer/projects/${projects[4]._id}`, data: { projectId: projects[4]._id } },
    { type: NOTIFICATION_TYPES.PROJECT_COMPLETED, title: "Project marked completed", message: `"${projects[2].title}" has been marked as completed.`, recipient: "anjali.verma@civiq.in", read: false, link: `/supervisor/tasks/${projects[2]._id}`, data: { projectId: projects[2]._id } },
    { type: NOTIFICATION_TYPES.EARLY_COMPLETION, title: "Project completed ahead of schedule", message: `"${projects[2].title}" was completed ahead of its scheduled end date.`, recipient: "rajesh.kumar@civiq.in", read: false, link: `/admin/projects/${projects[2]._id}`, data: { projectId: projects[2]._id } },
    { type: NOTIFICATION_TYPES.COMPLAINT_ASSIGNED, title: "New complaint assigned", message: `Complaint ${complaints[0].cnrId} has been assigned to you.`, recipient: "amit.sharma@civiq.in", read: false, link: `/officer/complaints/${complaints[0]._id}`, data: { complaintId: complaints[0]._id } },
    { type: NOTIFICATION_TYPES.COMPLAINT_STATUS_CHANGED, title: "Complaint status updated", message: `Complaint ${complaints[3].cnrId} was marked resolved.`, recipient: "vinay.pandey@civiq.in", read: true, link: `/officer/complaints/${complaints[3]._id}`, data: { complaintId: complaints[3]._id } },
    { type: NOTIFICATION_TYPES.ROLE_CHANGED, title: "Your role was updated", message: "Your account role was changed by an administrator.", recipient: "priya.singh@civiq.in", read: false, data: {} },
    { type: NOTIFICATION_TYPES.CLASH_DETECTED, title: "Project clash detected", message: `A scheduling clash was detected between "${projects[8].title}" and "${projects[2].title}".`, recipient: "deepak.yadav@civiq.in", read: true, link: `/officer/conflicts/${conflicts[9]._id}`, data: { conflictId: conflicts[9]._id } },
  ]

  const notifications = []
  for (const def of defs) {
    const { recipient, read, ...rest } = def
    const meta = metadataForType(def.type)
    const recipientUser = userByEmail[recipient]

    if (!recipientUser) {
      throw new Error(`Seed notification references unknown user: ${recipient}`)
    }

    notifications.push(
      await Notification.create({
        ...rest,
        recipient: recipientUser._id,
        category: meta.category,
        priority: meta.priority,
        read,
        readAt: read ? daysFromNow(-1) : null,
        deliveryStatus: read ? "delivered" : "pending",
        deliveredAt: read ? daysFromNow(-1) : null,
      })
    )
  }
  logger.info(`Seeded ${notifications.length} notifications`)
  return notifications
}

async function seedAuditLogs(userByEmail, projects, complaints, conflicts) {
  const defs = [
    // Only actions a controller actually emits, so the audit screen's filter
    // can match them.
    { action: "project_status_updated", performedBy: "rajesh.kumar@civiq.in", targetType: "Project", targetId: projects[9]._id, details: { isActive: false }, ipAddress: "10.20.30.1" },
    { action: "project_created", performedBy: "amit.sharma@civiq.in", targetType: "Project", targetId: projects[0]._id, details: { title: projects[0].title }, ipAddress: "10.20.30.4" },
    { action: "project_updated", performedBy: "amit.sharma@civiq.in", targetType: "Project", targetId: projects[0]._id, details: { field: "progress", from: 40, to: 55 }, ipAddress: "10.20.30.4" },
    { action: "project_approved", performedBy: "rajesh.kumar@civiq.in", targetType: "Project", targetId: projects[1]._id, details: { title: projects[1].title }, ipAddress: "10.20.30.1" },
    { action: "progress_updated", performedBy: "anjali.verma@civiq.in", targetType: "Project", targetId: projects[2]._id, details: { progress: 100 }, ipAddress: "10.20.30.3" },
    { action: "complaint_assigned", performedBy: "rajesh.kumar@civiq.in", targetType: "Complaint", targetId: complaints[1]._id, details: { assignedOfficer: userByEmail["neha.gupta@civiq.in"]._id }, ipAddress: "10.20.30.1" },
    { action: "conflict_responded", performedBy: "ravi.chauhan@civiq.in", targetType: "Conflict", targetId: conflicts[2]._id, details: { action: "accept", recheckPassed: true }, ipAddress: "10.20.30.10" },
    { action: "complaint_created", performedBy: "amit.sharma@civiq.in", targetType: "Complaint", targetId: complaints[0]._id, details: { cnrId: complaints[0].cnrId }, ipAddress: "10.20.30.4" },
    { action: "complaint_status_updated", performedBy: "vinay.pandey@civiq.in", targetType: "Complaint", targetId: complaints[3]._id, details: { status: "resolved" }, ipAddress: "10.20.30.6" },
    { action: "conflict_resolved", performedBy: "rajesh.kumar@civiq.in", targetType: "Conflict", targetId: conflicts[0]._id, details: { action: "approve_both" }, isOverride: true, ipAddress: "10.20.30.1" },
  ]

  const auditLogs = []
  for (const def of defs) {
    const { performedBy, ...rest } = def
    auditLogs.push(
      await AuditLog.create({
        ...rest,
        performedBy: userByEmail[performedBy]._id,
      })
    )
  }
  logger.info(`Seeded ${auditLogs.length} audit logs`)
  return auditLogs
}

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI)
  logger.info("Connected to MongoDB for seeding")

  await clearCollections()

  const { deptByCode } = await seedDepartments()
  const { users, userByEmail, admin } = await seedUsers(deptByCode)
  const projects = await seedProjects(deptByCode, userByEmail, admin)
  const complaints = await seedComplaints(deptByCode)
  const conflicts = await seedConflicts(projects, userByEmail, admin)
  const notifications = await seedNotifications(userByEmail, projects, complaints, conflicts)
  const auditLogs = await seedAuditLogs(userByEmail, projects, complaints, conflicts)

  logger.info("Seed complete", {
    departments: Object.keys(deptByCode).length,
    users: users.length,
    projects: projects.length,
    complaints: complaints.length,
    conflicts: conflicts.length,
    notifications: notifications.length,
    auditLogs: auditLogs.length,
  })
}

seed()
  .then(async () => {
    await mongoose.disconnect()
    logger.info("Disconnected from MongoDB")
    process.exit(0)
  })
  .catch(async (err) => {
    logger.fatal("Seed failed", { error: err.message, stack: err.stack })
    try {
      await mongoose.disconnect()
    } catch (disconnectErr) {
      logger.fatal("Failed to disconnect after seed error", { error: disconnectErr.message })
    }
    process.exit(1)
  })
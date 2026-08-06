// Express application: middleware, routes and error handling.
//
// Separated from server.js so the app can be tested independently. Middleware
// order is intentional: correlation first, then routes, then 404 and error
// handlers last.

const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const compression = require("compression")
const morgan = require("morgan")
const rateLimit = require("express-rate-limit")

const { fail, ERROR_CODES } = require("./utils/apiResponse")
const notFound = require("./middleware/notFound")
const errorHandler = require("./middleware/error")
const { logger } = require("./utils/logger")
const { requestContext } = require("./middleware/requestContext")

// express-rate-limit emits its own body; route it through the shared helper so
// a 429 looks like every other error in the API.
const rateLimited = (req, res) =>
  fail(res, 429, ERROR_CODES.RATE_LIMITED, "Too many requests, please try again later.")

const app = express()

// Configure Express proxy trust from TRUST_PROXY to preserve accurate client
// IPs for rate limiting and audit logging across different deployments.
function parseTrustProxy(raw) {
  if (raw === undefined || raw === "") return false
  const value = String(raw).trim()
  if (value.toLowerCase() === "false") return false
  if (value.toLowerCase() === "true") return true
  const hops = Number(value)
  return Number.isInteger(hops) && hops >= 0 ? hops : value
}

app.set("trust proxy", parseTrustProxy(process.env.TRUST_PROXY))

// Correlation first: every later log line, including Morgan's, carries the id.
app.use(requestContext)

// Security / parsing / performance middleware
app.use(helmet())
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }))
app.use(compression())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

morgan.token("request-id", (req) => req.requestId || "-")

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev", { stream: logger.stream }))
} else {
  app.use(morgan(':remote-addr :method :url :status :res[content-length] - :response-time ms :request-id',
    { stream: logger.stream }))
}

// Basic API-wide rate limiting
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimited,
    // One SSE connection is a single long-lived request, but a flapping
    // network reconnects repeatedly; counting those would drain the user's
    // ordinary API allowance. The stream has its own limiter below.
    skip: (req) => req.path === "/notifications/stream",
  })
)

// Reconnection budget for the stream itself, kept separate from the API quota.
app.use(
  "/api/notifications/stream",
  rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimited,
  })
)

// Authentication endpoints use a stricter rate limit to slow credential
// stuffing. Successful logins do not count, and /auth/me is excluded so normal
// page loads are unaffected.
app.use(
  ["/api/auth/login", "/api/auth/register"],
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimited,
  })
)

// Infrastructure routes
app.use("/api/health", require("./routes/health"))
// OpenAPI docs: GET /api/docs (UI) and GET /api/docs.json (raw spec)
app.use("/api", require("./routes/docs"))

// Routes
app.use("/api/auth", require("./routes/auth"))
app.use("/api/departments", require("./routes/departments"))
app.use("/api/projects", require("./routes/projects"))
app.use("/api/conflicts", require("./routes/conflicts"))
app.use("/api/complaints", require("./routes/complaints"))
app.use("/api/users", require("./routes/users"))
app.use("/api/audit", require("./routes/audit"))
app.use("/api/dashboard", require("./routes/dashboard"))
app.use("/api/notifications", require("./routes/notifications"))

// 404 + error handling (must be registered last, in this order)
app.use(notFound)
app.use(errorHandler)

module.exports = app

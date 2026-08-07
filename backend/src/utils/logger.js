// The one structured logger for the backend: a single place that decides
// format, level and what must never reach a log line. Production emits one JSON
// object per line; development keeps human-readable output.

const { AsyncLocalStorage } = require("node:async_hooks")

const LEVELS = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4 }

const activeLevel = () => (process.env.NODE_ENV === "production" ? LEVELS.info : LEVELS.debug)
const isProduction = () => process.env.NODE_ENV === "production"

// Request-scoped context held in async storage, so services keep their
// signatures rather than threading a correlation id through every call.
const store = new AsyncLocalStorage()
const runWithContext = (context, fn) => store.run(context, fn)
const currentContext = () => store.getStore() || {}

// Secrets must never be logged, however they arrive: as a field name, or
// embedded in a connection string or bearer header inside a message.
const SECRET_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|jwt|credential/i
const REDACTED = "[REDACTED]"

const SECRET_PATTERNS = [
  // mongodb://user:pass@host and redis://user:pass@host
  [/\b((?:mongodb(?:\+srv)?|redis|rediss):\/\/[^:/\s]+:)[^@\s]+@/gi, `$1${REDACTED}@`],
  // Authorization: Bearer <jwt>
  [/\b(bearer\s+)[A-Za-z0-9._~+/-]{12,}=*/gi, `$1${REDACTED}`],
  // ?token=… / &ticket=… / api-key=…
  [/\b((?:api[-_]?key|token|ticket|secret|password)\s*[=:]\s*)[^\s,&"')]+/gi, `$1${REDACTED}`],
]

function scrubString(value) {
  let out = String(value)
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement)
  return out
}

// Cycles are tolerated.
function scrub(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value
  if (typeof value === "string") return scrubString(value)
  if (typeof value !== "object") return value
  if (seen.has(value)) return "[Circular]"
  seen.add(value)

  if (Array.isArray(value)) return value.map((v) => scrub(v, seen))
  if (value instanceof Date) return value.toISOString()

  const out = {}
  for (const [key, val] of Object.entries(value)) {
    out[key] = SECRET_KEY.test(key) ? REDACTED : scrub(val, seen)
  }
  return out
}

function write(level, message, fields = {}) {
  if (LEVELS[level] > activeLevel()) return

  const context = currentContext()
  const { requestId } = context
  // Read lazily: `protect` attaches req.user after the context is created.
  const userId = context.req?.user?._id
  const role = context.req?.user?.role
  const entry = {
    level,
    time: new Date().toISOString(),
    message: scrubString(message),
    ...(requestId ? { requestId } : {}),
    ...(userId ? { userId: String(userId) } : {}),
    ...(role ? { role } : {}),
    ...scrub(fields),
  }

  // fatal and error go to stderr so process supervisors can separate them.
  const sink = LEVELS[level] <= LEVELS.error ? console.error : console.log

  if (isProduction()) {
    sink(JSON.stringify(entry))
    return
  }

  const tag = requestId ? ` [${String(requestId).slice(0, 8)}]` : ""
  const extras = Object.keys(entry).filter(
    (k) => !["level", "time", "message", "requestId", "userId", "role"].includes(k)
  )
  const detail = extras.length ? ` ${JSON.stringify(scrub(fields))}` : ""
  sink(`${level.toUpperCase()}${tag} ${entry.message}${detail}`)
}

const logger = {
  fatal: (message, fields) => write("fatal", message, fields),
  error: (message, fields) => write("error", message, fields),
  warn: (message, fields) => write("warn", message, fields),
  info: (message, fields) => write("info", message, fields),
  debug: (message, fields) => write("debug", message, fields),

  // Sink for Morgan, so request logs share this write path.
  stream: {
    write: (line) => write("info", String(line).trim(), { source: "http" }),
  },
}

module.exports = { logger, runWithContext, currentContext, scrub, LEVELS }

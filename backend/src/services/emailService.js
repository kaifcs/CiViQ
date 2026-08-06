// Brevo transactional email delivery.
//
// This service knows how to construct and send an email and nothing else — it
// has no notion of notifications, recipients-by-id, or when a message is
// warranted. NotificationService decides that and is the only caller.
//
// Talks to the Brevo REST API through the global fetch in Node 18+, so no HTTP
// client or provider SDK is added to the dependency tree.

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email"
const REQUEST_TIMEOUT_MS = 10000

/**
 * Email is optional infrastructure: without credentials the app still runs and
 * notifications still persist, delivery is simply skipped.
 */
function isEnabled() {
  return Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM_EMAIL)
}

function sender() {
  return {
    email: process.env.MAIL_FROM_EMAIL,
    name: process.env.MAIL_FROM_NAME || "CiViQ",
  }
}

/**
 * Sends one transactional email. Resolves with Brevo's response on success and
 * throws on failure — isolating that failure is the caller's responsibility, so
 * a direct caller still sees what went wrong.
 */
async function sendEmail({ to, toName, subject, html, text }) {
  if (!isEnabled()) {
    return { skipped: true, reason: "email_not_configured" }
  }
  if (!to) {
    throw new Error("sendEmail requires a recipient address")
  }

  // Node's fetch has no default timeout; without this a hung provider would
  // keep the handle open indefinitely.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: sender(),
        to: [toName ? { email: to, name: toName } : { email: to }],
        subject,
        htmlContent: html,
        ...(text ? { textContent: text } : {}),
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      const error = new Error(`Brevo responded ${response.status}: ${detail.slice(0, 200)}`)
      // Carried so the caller can tell a transient outage from a rejected
      // payload without re-parsing the message.
      error.status = response.status
      error.retryable = isRetryableStatus(response.status)
      throw error
    }

    return await response.json().catch(() => ({}))
  } catch (err) {
    // An aborted or refused request never reached the provider, so it is worth
    // trying again; anything already classified above keeps its own verdict.
    if (err.retryable === undefined) err.retryable = true
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Rate limiting and provider-side faults are worth retrying. A 4xx other than
 * 429 means the request itself was rejected — retrying sends the same bad
 * payload again, so those are permanent.
 */
function isRetryableStatus(status) {
  if (status === 429) return true
  return status >= 500
}

module.exports = { sendEmail, isEnabled, isRetryableStatus }

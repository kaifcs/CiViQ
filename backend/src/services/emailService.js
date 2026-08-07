// Brevo transactional email delivery. Transport only: it has no notion of
// notifications or when a message is warranted. Uses the global fetch, so no
// provider SDK or HTTP client is added to the dependency tree.

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email"
const REQUEST_TIMEOUT_MS = 10000

// Optional infrastructure: without credentials the app runs and notifications
// persist; delivery is simply skipped.
function isEnabled() {
  return Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM_EMAIL)
}

function sender() {
  return {
    email: process.env.MAIL_FROM_EMAIL,
    name: process.env.MAIL_FROM_NAME || "CiViQ",
  }
}

// Throws on failure; isolating that failure is the caller's responsibility.
async function sendEmail({ to, toName, subject, html, text }) {
  if (!isEnabled()) {
    return { skipped: true, reason: "email_not_configured" }
  }
  if (!to) {
    throw new Error("sendEmail requires a recipient address")
  }

  // Node's fetch has no default timeout, so a hung provider would keep the
  // handle open indefinitely.
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
      // So the caller can tell a transient outage from a rejected payload.
      error.status = response.status
      error.retryable = isRetryableStatus(response.status)
      throw error
    }

    return await response.json().catch(() => ({}))
  } catch (err) {
    // An aborted or refused request never reached the provider, so retry it.
    if (err.retryable === undefined) err.retryable = true
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// A 4xx other than 429 means the payload itself was rejected, so retrying would
// only resend it.
function isRetryableStatus(status) {
  if (status === 429) return true
  return status >= 500
}

module.exports = { sendEmail, isEnabled, isRetryableStatus }

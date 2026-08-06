// Email rendering for notifications. One layout, one call site — nothing here
// duplicates markup, and every category renders through the same shell so the
// branding cannot drift between project, complaint, conflict and user mail.

const { NOTIFICATION_CATEGORIES } = require("../config/notificationTypes")

const BRAND = "CiViQ"
const BRAND_TAGLINE = "Plan together. Build once."
const ACCENT = "#5E6AD2"

// Only the accent differs per category; the shell is shared.
const CATEGORY_ACCENT = {
  [NOTIFICATION_CATEGORIES.PROJECT]: "#5E6AD2",
  [NOTIFICATION_CATEGORIES.COMPLAINT]: "#0EA5E9",
  [NOTIFICATION_CATEGORIES.CONFLICT]: "#DC2626",
  [NOTIFICATION_CATEGORIES.SYSTEM]: "#475569",
}

const CATEGORY_LABEL = {
  [NOTIFICATION_CATEGORIES.PROJECT]: "Project update",
  [NOTIFICATION_CATEGORIES.COMPLAINT]: "Complaint update",
  [NOTIFICATION_CATEGORIES.CONFLICT]: "Conflict alert",
  [NOTIFICATION_CATEGORIES.SYSTEM]: "Account update",
}

/** Minimal HTML escaping — every value below is interpolated through this. */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Turns a stored relative link into an absolute one the mail client can open. */
function absoluteLink(link) {
  if (!link) return null
  if (/^https?:\/\//i.test(link)) return link
  const base = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "")
  return `${base}/${String(link).replace(/^\/+/, "")}`
}

/**
 * The single email shell. Table-based and inline-styled because mail clients
 * strip stylesheets and collapse modern layout.
 */
function layout({ accent, eyebrow, heading, body, actionUrl, actionLabel }) {
  const button = actionUrl
    ? `<tr><td style="padding:8px 32px 0 32px;">
         <a href="${escapeHtml(actionUrl)}"
            style="display:inline-block;background:${accent};color:#FFFFFF;text-decoration:none;
                   font-size:14px;font-weight:600;padding:11px 20px;border-radius:6px;">
           ${escapeHtml(actionLabel)}
         </a>
       </td></tr>`
    : ""

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#F7F7F7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#FFFFFF;border:1px solid #E5E5E5;border-radius:10px;
                    font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
        <tr><td style="padding:24px 32px 0 32px;">
          <span style="font-size:17px;font-weight:700;color:#0F172A;letter-spacing:-0.2px;">${BRAND}</span>
          <span style="font-size:12px;color:#9CA3AF;padding-left:8px;">${BRAND_TAGLINE}</span>
        </td></tr>
        <tr><td style="padding:20px 32px 0 32px;">
          <span style="display:inline-block;font-size:11px;font-weight:600;text-transform:uppercase;
                       letter-spacing:0.08em;color:${accent};">${escapeHtml(eyebrow)}</span>
        </td></tr>
        <tr><td style="padding:6px 32px 0 32px;">
          <h1 style="margin:0;font-size:19px;line-height:1.35;color:#0F172A;font-weight:700;">${escapeHtml(heading)}</h1>
        </td></tr>
        <tr><td style="padding:10px 32px 0 32px;">
          <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">${escapeHtml(body)}</p>
        </td></tr>
        ${button}
        <tr><td style="padding:24px 32px 24px 32px;">
          <hr style="border:none;border-top:1px solid #E5E5E5;margin:0 0 12px 0;" />
          <p style="margin:0;font-size:11px;line-height:1.5;color:#9CA3AF;">
            Sent by ${BRAND} — Ghaziabad Municipal Corporation. You are receiving this
            because of activity on your account.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

/**
 * Renders a persisted notification into a subject, HTML body and plain-text
 * fallback. Takes the notification as stored, so nothing has to be re-derived.
 */
function renderNotificationEmail(notification) {
  const category = notification.category || NOTIFICATION_CATEGORIES.SYSTEM
  const accent = CATEGORY_ACCENT[category] || ACCENT
  const eyebrow = CATEGORY_LABEL[category] || CATEGORY_LABEL[NOTIFICATION_CATEGORIES.SYSTEM]
  const actionUrl = absoluteLink(notification.link)

  return {
    subject: `${BRAND}: ${notification.title}`,
    html: layout({
      accent,
      eyebrow,
      heading: notification.title,
      body: notification.message,
      actionUrl,
      actionLabel: "Open in CiViQ",
    }),
    text: [
      notification.title,
      "",
      notification.message,
      actionUrl ? `\nOpen in ${BRAND}: ${actionUrl}` : "",
    ].join("\n").trim(),
  }
}

module.exports = { renderNotificationEmail, absoluteLink, escapeHtml }

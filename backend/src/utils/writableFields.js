// Writable-field whitelisting for client-supplied write payloads.
//
// Every write that accepts a request body must pass it through here first. A
// whitelist — never a blacklist — is what keeps a field added to a schema later
// from becoming client-writable by accident, and what keeps server-owned state
// (ownership, workflow status, engine-computed scores) out of reach of the
// caller even when the caller is authorized to touch the record.
//
// This is the same helper complaintsController already applied locally; it is
// shared so projects and complaints cannot drift apart on the one rule.

/**
 * Copies only the listed fields from a request body.
 *
 * A key absent from the body is left absent from the result rather than being
 * written as undefined, so a partial update stays partial.
 */
function pickWritable(body = {}, fields = []) {
  const out = {}
  for (const key of fields) {
    if (body[key] !== undefined) out[key] = body[key]
  }
  return out
}

module.exports = { pickWritable }

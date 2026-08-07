// Writable-field whitelisting for client-supplied write payloads. A whitelist,
// never a blacklist, so a field added to a schema later cannot become
// client-writable by accident.

// An absent key stays absent rather than becoming undefined, so a partial
// update stays partial.
function pickWritable(body = {}, fields = []) {
  const out = {}
  for (const key of fields) {
    if (body[key] !== undefined) out[key] = body[key]
  }
  return out
}

module.exports = { pickWritable }

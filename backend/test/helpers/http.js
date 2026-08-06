// Express request/response doubles.
//
// The response helpers under test only ever call status(), json(), set() and
// writeHead()/write()/end(), so a recording stub is enough to assert the exact
// shape a client would receive — no HTTP server, no port, no timing.
//
// One double for the whole suite: tests assert against `res.body`, `res.status`
// and `res.headers` rather than each inventing its own mock.

const { EventEmitter } = require("node:events")

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    chunks: [],
    ended: false,
    headersSent: false,
  }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (payload) => { res.body = payload; res.ended = true; return res }
  res.set = (key, value) => { res.headers[String(key).toLowerCase()] = value; return res }
  res.setHeader = res.set
  res.writeHead = (code, headers = {}) => {
    res.statusCode = code
    res.headersSent = true
    for (const [k, v] of Object.entries(headers)) res.headers[k.toLowerCase()] = v
    return res
  }
  res.flushHeaders = () => res
  res.write = (chunk) => { res.chunks.push(String(chunk)); return true }
  res.end = () => { res.ended = true; return res }
  res.on = () => res
  res.setTimeout = () => res
  return res
}

/** Request double with the EventEmitter surface the SSE hub subscribes to. */
function mockReq(overrides = {}) {
  const req = new EventEmitter()
  Object.assign(req, { params: {}, query: {}, body: {}, headers: {} }, overrides)
  return req
}

/** Text written to an SSE response, as the client would receive it. */
const written = (res) => res.chunks.join("")

module.exports = { mockRes, mockReq, written }

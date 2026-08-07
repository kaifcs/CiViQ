// Express request/response doubles. A recording stub is enough to assert the
// exact shape a client would receive, with no server, port or timing involved.
// One double for the whole suite, so no test invents its own.

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

// Carries the EventEmitter surface the SSE hub subscribes to.
function mockReq(overrides = {}) {
  const req = new EventEmitter()
  Object.assign(req, { params: {}, query: {}, body: {}, headers: {} }, overrides)
  return req
}

// Text written to an SSE response, as the client would receive it.
const written = (res) => res.chunks.join("")

module.exports = { mockRes, mockReq, written }

// Express 4 does not await route handlers, so an unwrapped rejection hangs the
// request until it times out. Wrapping routes the failure to middleware/error.
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

module.exports = asyncHandler

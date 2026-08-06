// Forwards a rejected promise to Express's error middleware.
//
// Express 4 does not await route handlers, so a rejection inside an async
// handler becomes an unhandled rejection and the request hangs until it times
// out. Wrapping routes the failure to middleware/error instead, where it
// becomes the standard error envelope.

/** Wraps an async route handler so rejections reach next(). */
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

module.exports = asyncHandler

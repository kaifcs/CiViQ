// Analytics endpoints — a thin pass-through to analyticsService.
//
// No aggregation logic lives here. Each endpoint hands the query string to the
// service and wraps whatever comes back, which is what keeps every dashboard
// figure derived in one place rather than recomputed per route.

const analytics = require("../services/analyticsService")
const { ERROR_CODES, badRequest, fail } = require("../utils/apiResponse")
const { logger } = require("../utils/logger")

/**
 * Builds a route handler around one analytics function.
 *
 * The service reports a bad filter by returning `{ error }` rather than
 * throwing, so an invalid query becomes a 400 while a genuine fault becomes a
 * 500 — the two are distinguished here instead of in every endpoint.
 */
function handler(fn, failureMessage) {
  return async (req, res) => {
    try {
      const result = await fn(req.query)
      if (result && result.error) {
        return badRequest(res, result.error)
      }
      res.status(200).json({ success: true, data: result })
    } catch (err) {
      logger.error(`${failureMessage}`, { error: err.message })
      fail(res, 500, ERROR_CODES.INTERNAL_ERROR, failureMessage)
    }
  }
}

exports.getSummary = handler(analytics.getSummary, "Server error building dashboard summary")
exports.getProjects = handler(analytics.getProjectAnalytics, "Server error building project analytics")
exports.getConflicts = handler(analytics.getConflictAnalytics, "Server error building conflict analytics")
exports.getComplaints = handler(analytics.getComplaintAnalytics, "Server error building complaint analytics")
exports.getDepartments = handler(analytics.getDepartmentAnalytics, "Server error building department analytics")
exports.getActivity = handler(analytics.getActivityAnalytics, "Server error building activity analytics")

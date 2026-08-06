// Serves the OpenAPI spec: Swagger UI at /api/docs, raw document at
// /api/docs.json. Left unauthenticated, like /api/health, so the contract is
// readable without a token.

const router = require("express").Router()
const swaggerUi = require("swagger-ui-express")
const spec = require("../openapi/openapi")

router.get("/docs.json", (req, res) => res.json(spec))
router.use("/docs", swaggerUi.serve, swaggerUi.setup(spec, {
  explorer: true,
  customSiteTitle: "CIVIQ API Documentation",
}))

module.exports = router

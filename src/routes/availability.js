const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/authenticate");

const {
  checkAvailabilityDiagnostics,
} = require("../controllers/availabilityController");

router.get("/diagnostics", authenticate, checkAvailabilityDiagnostics);

module.exports = router;

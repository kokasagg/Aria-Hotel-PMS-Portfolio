const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/authenticate");

const {
  getRatePlansDirect,
  getRatePlanByIDDirect,
  updateRatePlanDirect,
  activateRatePlanDirect,
  deactivateRatePlanDirect,
} = require("../controllers/ratePlansController");

const {
  updateRatePlanDailyDirect,
  getRatePlanDailyDirect,
} = require("../controllers/ratePlanDailyController");

//#######################
// RATE PLANS (FIRST)
//#######################
router.get("/", authenticate, getRatePlansDirect);
router.get("/:rate_plan_id", authenticate, getRatePlanByIDDirect);
router.put("/:rate_plan_id", authenticate, updateRatePlanDirect);
router.put("/:rate_plan_id/activate", authenticate, activateRatePlanDirect);
router.put("/:rate_plan_id/deactivate", authenticate, deactivateRatePlanDirect);

//#######################
// RATE PLANS DAILY(RESTRICTIONS)
//#######################
router.put("/:rate_plan_id/daily", authenticate, updateRatePlanDailyDirect);
router.get("/:rate_plan_id/daily", authenticate, getRatePlanDailyDirect);

module.exports = router;

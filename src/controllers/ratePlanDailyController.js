const ratePlanDailyService = require("../services/ratePlanDailyService");
const { success } = require("../utils/response");
const handleError = require("../utils/handleError");

// ======================================
// UPDATE RATE PLAN DAILY
// ======================================
async function updateRatePlanDaily(req, res) {
  try {
    const result = await ratePlanDailyService.updateRatePlanDaily(
      req.params.property_id,
      req.params.room_type_id,
      req.params.rate_plan_id,
      req.body,
      req.user,
    );

    return success(
      res,
      result,
      "Rate plan daily restrictions updated successfully",
    );
  } catch (err) {
    return handleError(res, err);
  }
}

// ======================================
// GET RATE PLAN DAILY
// ======================================
async function getRatePlanDaily(req, res) {
  try {
    const result = await ratePlanDailyService.getRatePlanDaily(
      req.params.property_id,
      req.params.room_type_id,
      req.params.rate_plan_id,
      req.query,
      req.user,
    );

    return success(
      res,
      result,
      "Rate plan daily restrictions fetched successfully",
    );
  } catch (err) {
    return handleError(res, err);
  }
}

// ======================================
// UPDATE PLAN DAILY DIRECT
// ======================================
async function getRatePlanDailyDirect(req, res) {
  try {
    const result = await ratePlanDailyService.getRatePlanDailyDirect(
      req.params.rate_plan_id,
      req.query,
      req.user,
    );

    return success(res, result, "Rate plan daily fetched successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

// ======================================
// GET RATE PLAN DAILY DIRECT
// ======================================
async function updateRatePlanDailyDirect(req, res) {
  try {
    const result = await ratePlanDailyService.updateRatePlanDailyDirect(
      req.params.rate_plan_id,
      req.body,
      req.user,
    );

    return success(res, result, "Rate plan daily updated successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  updateRatePlanDaily,
  getRatePlanDaily,
  updateRatePlanDailyDirect,
  getRatePlanDailyDirect,
};

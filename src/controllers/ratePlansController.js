const ratePlanService = require("../services/ratePlanService");
const { success } = require("../utils/response");
const handleError = require("../utils/handleError");

//=========================
//CREATE RATE PLAN
//=========================
async function createRatePlan(req, res) {
  try {
    const rate_plan = await ratePlanService.createRatePlan(
      req.params.property_id,
      req.params.room_type_id,
      req.body,
      req.user,
    );

    return success(res, { rate_plan }, "Rate plan created successfully", 201);
  } catch (err) {
    return handleError(res, err);
  }
}

//=========================
//GET RATE PLANS
//=========================
async function getRatePlans(req, res) {
  try {
    const result = await ratePlanService.getRatePlans(
      req.params.property_id,
      req.params.room_type_id,
      req.query,
      req.user,
    );

    return success(
      res,
      result,
      result.rate_plans.length
        ? "Rate plans fetched successfully"
        : "No rate plans found",
    );
  } catch (err) {
    return handleError(res, err);
  }
}

//=========================
//GET RATE PLAN BY ID
//=========================
async function getRatePlanByID(req, res) {
  try {
    const rate_plan = await ratePlanService.getRatePlanByID(
      req.params.property_id,
      req.params.room_type_id,
      req.params.rate_plan_id,
      req.user,
      req.query,
    );

    return success(res, { rate_plan }, "Rate plan fetched successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

//=========================
//UPDATE RATE PLAN
//=========================
async function updateRatePlan(req, res) {
  try {
    const rate_plan = await ratePlanService.updateRatePlan(
      req.params.property_id,
      req.params.room_type_id,
      req.params.rate_plan_id,
      req.body,
      req.user,
    );

    return success(res, { rate_plan }, "Rate plan updated successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

//=========================
//ACTIVATE RATE PLAN
//=========================
async function activateRatePlan(req, res) {
  try {
    const rate_plan = await ratePlanService.activateRatePlan(
      req.params.property_id,
      req.params.room_type_id,
      req.params.rate_plan_id,
      req.user,
    );

    return success(res, { rate_plan }, "Rate plan activated successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

//=========================
//DEACTIVATE RATE PLAN
//=========================
async function deactivateRatePlan(req, res) {
  try {
    const rate_plan = await ratePlanService.deactivateRatePlan(
      req.params.property_id,
      req.params.room_type_id,
      req.params.rate_plan_id,
      req.user,
    );

    return success(res, { rate_plan }, "Rate plan deactivated successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

//======================================================================================================================================
//======================================================================================================================================
//======================================================================================================================================
//======================================================================================================================================
//======================================================================================================================================
//======================================================RATE PLANS DIRECT===============================================================
//======================================================================================================================================
//======================================================================================================================================
//======================================================================================================================================
//======================================================================================================================================
//======================================================================================================================================

//=========================
//GET RATE PLANS DIRECT
//=========================
async function getRatePlansDirect(req, res) {
  try {
    const result = await ratePlanService.getRatePlansDirect(
      req.query,
      req.user,
    );

    return success(
      res,
      result,
      result.rate_plans.length
        ? "Rate plans fetched successfully"
        : "No rate plans found",
    );
  } catch (err) {
    return handleError(res, err);
  }
}

//=========================
//GET RATE PLAN BY ID DIRECT
//=========================
async function getRatePlanByIDDirect(req, res) {
  try {
    const rate_plan = await ratePlanService.getRatePlanByIDDirect(
      req.params.rate_plan_id,
      req.user,
    );

    return success(res, { rate_plan }, "Rate plan fetched successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

//=========================
//UPDATE RATE PLAN DIRECT
//=========================
async function updateRatePlanDirect(req, res) {
  try {
    const rate_plan = await ratePlanService.updateRatePlanDirect(
      req.params.rate_plan_id,
      req.body,
      req.user,
    );

    return success(res, { rate_plan }, "Rate plan updated successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

//=========================
//ACTIVATE RATE PLAN DIRECT
//=========================
async function activateRatePlanDirect(req, res) {
  try {
    const rate_plan = await ratePlanService.activateRatePlanDirect(
      req.params.rate_plan_id,
      req.user,
    );

    return success(res, { rate_plan }, "Rate plan activated successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

//=========================
//DEACTIVATE RATE PLAN DIRECT
//=========================
async function deactivateRatePlanDirect(req, res) {
  try {
    const rate_plan = await ratePlanService.deactivateRatePlanDirect(
      req.params.rate_plan_id,
      req.user,
    );

    return success(res, { rate_plan }, "Rate plan deactivated successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  createRatePlan,
  getRatePlans,
  getRatePlanByID,
  updateRatePlan,
  activateRatePlan,
  deactivateRatePlan,
  getRatePlansDirect,
  getRatePlanByIDDirect,
  updateRatePlanDirect,
  activateRatePlanDirect,
  deactivateRatePlanDirect,
};

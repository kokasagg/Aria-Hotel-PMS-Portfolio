const { channexRequest } = require("./channexClient");

// ======================================
// PAYLOAD FOR CREATE RATE PLAN IN CHANNEX
// ======================================
function buildCreateRatePlanPayload(body) {
  return {
    rate_plan: {
      property_id: body.channex_property_id,
      room_type_id: body.channex_room_type_id,
      title: body.title,
      meal_type: body.meal_type_code || null,
      children_fee: body.children_fee || 0,
      infant_fee: body.infant_fee || 0,
      max_stay: body.max_stay || [0, 0, 0, 0, 0, 0, 0],
      min_stay_arrival: body.min_stay_arrival || [1, 1, 1, 1, 1, 1, 1],
      min_stay_through: body.min_stay_through || [1, 1, 1, 1, 1, 1, 1],
      closed_to_arrival: body.closed_to_arrival || [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ],
      closed_to_departure: body.closed_to_departure || [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ],
      stop_sell: body.stop_sell || [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ],
      options: body.options || [],
      currency: body.currency || "EUR",
      sell_mode: body.sell_mode || "per_room",
      rate_mode: body.rate_mode || "manual",
      inherit_rate: false,
    },
  };
}

// ======================================
// PAYLOAD FOR UPDATE RATE PLAN IN CHANNEX
// ======================================
function buildUpdateRatePlanPayload(body) {
  const rate_plan = {};

  if (body.title !== undefined) rate_plan.title = body.title;
  if (body.meal_type_code !== undefined)
    rate_plan.meal_type = body.meal_type_code;
  if (body.currency !== undefined) rate_plan.currency = body.currency;
  if (body.sell_mode !== undefined) rate_plan.sell_mode = body.sell_mode;
  if (body.rate_mode !== undefined) rate_plan.rate_mode = body.rate_mode;
  if (body.children_fee !== undefined)
    rate_plan.children_fee = body.children_fee;
  if (body.infant_fee !== undefined) rate_plan.infant_fee = body.infant_fee;
  if (body.min_stay_arrival !== undefined)
    rate_plan.min_stay_arrival = body.min_stay_arrival;
  if (body.min_stay_through !== undefined)
    rate_plan.min_stay_through = body.min_stay_through;
  if (body.max_stay !== undefined) rate_plan.max_stay = body.max_stay;
  if (body.closed_to_arrival !== undefined)
    rate_plan.closed_to_arrival = body.closed_to_arrival;
  if (body.closed_to_departure !== undefined)
    rate_plan.closed_to_departure = body.closed_to_departure;
  if (body.stop_sell !== undefined) rate_plan.stop_sell = body.stop_sell;
  if (body.options !== undefined) rate_plan.options = body.options;

  return { rate_plan };
}

// ======================================
// CREATE RATE PLAN IN CHANNEX
// ======================================
async function createRatePlan(ratePlan) {
  const payload = buildCreateRatePlanPayload(ratePlan);

  const response = await channexRequest({
    method: "POST",
    url: "/rate_plans",
    data: payload,
  });

  return {
    payload,
    response,
  };
}

// ======================================
// GET RATE PLAN BY ID IN CHANNEX
// ======================================
async function getRatePlan(channex_rate_plan_id) {
  const response = await channexRequest({
    method: "GET",
    url: `/rate_plans/${channex_rate_plan_id}`,
  });

  return response;
}

// ======================================
// UPDATE RATE PLAN IN CHANNEX
// ======================================
async function updateRatePlan(channex_rate_plan_id, body) {
  const payload = buildUpdateRatePlanPayload(body);

  const response = await channexRequest({
    method: "PUT",
    url: `/rate_plans/${channex_rate_plan_id}`,
    data: payload,
  });

  return {
    payload,
    response,
  };
}

module.exports = {
  buildCreateRatePlanPayload,
  buildUpdateRatePlanPayload,
  createRatePlan,
  getRatePlan,
  updateRatePlan,
};

//================================================================
// REMOVE EXTERNAL CHANNEX FIELDS(ids)
//================================================================

const { canAccessAll } = require("./access");

function sanitizeProperty(row, user) {
  const property = { ...row };

  if (!canAccessAll(user.role)) {
    delete property.channex_property_id;
    delete property.external;
  }

  return property;
}

function sanitizeRoomType(row, user) {
  const roomType = { ...row };

  if (!canAccessAll(user.role)) {
    delete roomType.channex_room_type_id;
    delete roomType.external;
  }

  return roomType;
}

function sanitizeRatePlan(row, user) {
  const ratePlan = { ...row };

  if (!canAccessAll(user.role)) {
    delete ratePlan.channex_rate_plan_id;
    delete ratePlan.external;
  }

  return ratePlan;
}

module.exports = {
  sanitizeProperty,
  sanitizeRoomType,
  sanitizeRatePlan,
};

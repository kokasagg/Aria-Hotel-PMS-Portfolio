const { getPool, sql } = require("../../config/db");
const AppError = require("../../utils/AppError");
const ERROR_CODES = require("../../constants/errorCodes");

// =================================
// RETURN CHANNEX PROPERTY ID WITH PROPERTY ID
// =================================
async function getChannexPropertyId(propertyId) {
  const pool = getPool();

  const result = await pool
    .request()
    .input("propertyId", sql.UniqueIdentifier, propertyId).query(`
      SELECT
        channex_property_id
      FROM properties
      WHERE id = @propertyId
    `);

  const property = result.recordset[0];

  if (!property) {
    throw new AppError(
      "Property not found",
      ERROR_CODES.PROPERTY_NOT_FOUND,
      404,
    );
  }

  if (!property.channex_property_id) {
    throw new AppError(
      "Property is not synced with Channex",
      ERROR_CODES.PROPERTY_NOT_SYNCED,
      409,
    );
  }

  return property.channex_property_id;
}

// =================================
// RETURN CHANNEX ROOM TYPE ID WITH LOCAL ROOM TYPE ID
// =================================
async function getChannexRoomTypeId(roomTypeId) {
  const pool = getPool();

  const result = await pool
    .request()
    .input("roomTypeId", sql.UniqueIdentifier, roomTypeId).query(`
      SELECT channex_room_type_id
      FROM room_types
      WHERE id = @roomTypeId
    `);

  const roomType = result.recordset[0];

  if (!roomType) {
    throw new AppError(
      "Room type not found",
      ERROR_CODES.ROOM_TYPE_NOT_FOUND,
      404,
    );
  }

  if (!roomType.channex_room_type_id) {
    throw new AppError(
      "Room type is not synced",
      ERROR_CODES.ROOM_TYPE_NOT_SYNCED,
      409,
    );
  }

  return roomType.channex_room_type_id;
}

// =================================
// RETURN CHANNEX RATE PLAN ID WITH LOCAL RATE PLAN ID
// =================================
async function getChannexRatePlanId(ratePlanId) {
  const pool = getPool();

  const result = await pool
    .request()
    .input("ratePlanId", sql.UniqueIdentifier, ratePlanId).query(`
      SELECT channex_rate_plan_id
      FROM rate_plans
      WHERE id = @ratePlanId
    `);

  const ratePlan = result.recordset[0];

  if (!ratePlan) {
    throw new AppError(
      "Rate plan not found",
      ERROR_CODES.RATE_PLAN_NOT_FOUND,
      404,
    );
  }

  if (!ratePlan.channex_rate_plan_id) {
    throw new AppError(
      "Rate plan is not synced",
      ERROR_CODES.RATE_PLAN_NOT_SYNCED,
      409,
    );
  }

  return ratePlan.channex_rate_plan_id;
}
module.exports = {
  getChannexPropertyId,
  getChannexRoomTypeId,
  getChannexRatePlanId,
};

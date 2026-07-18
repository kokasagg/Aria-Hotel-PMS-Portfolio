const { sql } = require("../config/db");
const { canAccessAll } = require("../utils/access");
const AppError = require("../utils/AppError");
const ERROR_CODES = require("../constants/errorCodes");

function buildRatePlanFilters(filters, request, options = {},currentUser) {
  const { requirePropertyAndRoomType = true } = options;

  let whereClause = `
    WHERE 1 = 1
  `;

  //ID
  if(filters.id){
     if (!canAccessAll(currentUser.role)) {
      throw new AppError(
        "Access denied",
        ERROR_CODES.USER_UNAUTHORIZED,
        403);
    }

    whereClause += ` AND rp.id = @id OR rp.channex_rate_plan_id = @id `

    request.input("id",sql.UniqueIdentifier,`${filters.id}%`);
  }

  if (requirePropertyAndRoomType) {
    whereClause += `
      AND rp.property_id = @property_id
      AND rp.room_type_id = @room_type_id
    `;
  }

  if (filters.property_id) {
    whereClause += ` AND rp.property_id = @filter_property_id`;

    request.input(
      "filter_property_id",
      sql.UniqueIdentifier,
      filters.property_id,
    );
  }

  if (filters.room_type_id) {
    whereClause += ` AND rp.room_type_id = @filter_room_type_id`;

    request.input(
      "filter_room_type_id",
      sql.UniqueIdentifier,
      filters.room_type_id,
    );
  }

  if (filters.title) {
    whereClause += ` AND rp.title LIKE @title`;

    request.input("title", sql.NVarChar, `${filters.title}%`);
  }

  if (filters.search) {
    whereClause += `
      AND (
        rp.title LIKE @search
        OR rp.currency LIKE @search
        OR rp.meal_type_code LIKE @search
        OR mt.name_en LIKE @search
        OR mt.name_el LIKE @search
        OR rt.name LIKE @search
        OR p.name LIKE @search
      )
    `;

    request.input("search", sql.NVarChar, `%${filters.search}%`);
  }

  if (filters.is_active !== undefined) {
    whereClause += ` AND rp.is_active = @is_active`;

    request.input("is_active", sql.Bit, Number(filters.is_active));
  }

  if (filters.currency) {
    whereClause += ` AND rp.currency = @currency`;

    request.input("currency", sql.NVarChar, filters.currency);
  }

  if (filters.sell_mode) {
    whereClause += ` AND rp.sell_mode = @sell_mode`;

    request.input("sell_mode", sql.NVarChar, filters.sell_mode);
  }

  if (filters.rate_mode) {
    whereClause += ` AND rp.rate_mode = @rate_mode`;

    request.input("rate_mode", sql.NVarChar, filters.rate_mode);
  }

  if (filters.meal_type_code) {
    whereClause += ` AND rp.meal_type_code = @meal_type_code`;

    request.input("meal_type_code", sql.NVarChar, filters.meal_type_code);
  }

  return whereClause;
}

module.exports = buildRatePlanFilters;

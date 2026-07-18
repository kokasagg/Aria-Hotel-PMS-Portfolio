const { sql } = require("../config/db");
const { canAccessAll } = require("../utils/access");
const AppError = require("../utils/AppError");
const ERROR_CODES = require("../constants/errorCodes");

function buildRoomTypeFilters(filters, request, currentUser) {
  let whereClause = `
      WHERE rt.property_id = @property_id
    `;

  //ID
  if(filters.id){
     if (!canAccessAll(currentUser.role)) {
      throw new AppError(
        "Access denied",
        ERROR_CODES.USER_UNAUTHORIZED,
        403);
    }

    whereClause += ` AND rt.id = @id OR rt.channex_room_type_id = @id `

    request.input("id",sql.UniqueIdentifier,`${filters.id}%`);
  }

  //NAME
  if (filters.room_type_name) {
    whereClause += ` AND rt.name LIKE @room_type_name`;
    request.input("room_type_name", sql.NVarChar, `${filters.room_type_name}%`);
  }

  //IS ACTIVE
  if (filters.is_active !== undefined) {
    whereClause += ` AND rt.is_active = @is_active`;
    request.input("is_active", sql.Bit, Number(filters.is_active));
  }

  //MIN ROOMS
  if (filters.min_rooms !== undefined) {
    whereClause += ` AND rt.room_count >= @min_rooms`;
    request.input("min_rooms", sql.Int, filters.min_rooms);
  }

  //MAX ROOMS
  if (filters.max_rooms !== undefined) {
    whereClause += ` AND rt.room_count <= @max_rooms`;
    request.input("max_rooms", sql.Int, filters.max_rooms);
  }

  //SYNC STATUS
  if (filters.sync_status !== undefined) {
    whereClause += ` AND rt.sync_status <= @sync_status`;
    request.input("sync_status", sql.TinyInt, filters.sync_status);
  }

  //ADULTS
  if (filters.adults !== undefined) {
    whereClause += ` AND rt.adults = @adults`;
    request.input("adults", sql.Int, filters.adults);
  }

  //CHILDREN
  if (filters.children !== undefined) {
    whereClause += ` AND rt.children = @children`;
    request.input("children", sql.Int, filters.children);
  }

  //INFANTS
  if (filters.infants !== undefined) {
    whereClause += ` AND rt.infants = @infants`;
    request.input("infants", sql.Int, filters.infants);
  }

  //SEARCH
  /*if (filters.search) {
      whereClause += `
        AND (
          rt.name LIKE @search
        )
      `;
      request.input("search", sql.NVarChar, `%${filters.search}%`);
    }*/

  return whereClause;
}

module.exports = buildRoomTypeFilters;

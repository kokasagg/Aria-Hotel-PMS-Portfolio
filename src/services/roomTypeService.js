const { getPool, sql } = require("../config/db");
const AppError = require("../utils/AppError");
const ERROR_CODES = require("../constants/errorCodes");
const { canAccessAll } = require("../utils/access");
const buildRoomTypesFilters = require("../utils/buildRoomTypeFilters");
const getPagination = require("../utils/pagination");
const channexRoomTypeService = require("./channex/channexRoomTypeService");
const syncLogService = require("./sync/syncLogService");
const SYNC_STATUS = require("../constants/syncStatus");
const { getChannexPropertyId } = require("./channex/channexHelpers");
const { sanitizeRoomType } = require("../utils/sanitizeExternalFields");

// ======================================
// CREATE ROOM TYPE
// ======================================

async function createRoomType(property_id, body, currentUser) {
  const {
    name,
    room_count,
    adults,
    children = 0,
    infants = 0,
    default_occupancy,
  } = body;

  if (!name) {
    throw new AppError(
      "Name is required",
      ERROR_CODES.ROOM_TYPE_REQUIRED_FIELDS,
      400,
    );
  }

  if (
    room_count === undefined ||
    adults === undefined ||
    default_occupancy === undefined
  ) {
    throw new AppError(
      "room_count, adults and default_occupancy are required",
      ERROR_CODES.ROOM_TYPE_REQUIRED_FIELDS,
      400,
    );
  }

  if (
    room_count < 0 ||
    adults < 0 ||
    children < 0 ||
    infants < 0 ||
    default_occupancy < 0
  ) {
    throw new AppError(
      "Room values cannot be negative",
      ERROR_CODES.INVALID_ROOM_TYPE_VALUES,
      400,
    );
  }

  if (default_occupancy > adults + children + infants) {
    throw new AppError(
      "default_occupancy cannot exceed total capacity",
      ERROR_CODES.INVALID_ROOM_TYPE_VALUES,
      400,
    );
  }

  const pool = getPool();

  const propertyResult = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id).query(`
      SELECT
        id,
        user_id,
        max_allowed_rooms
      FROM properties
      WHERE id = @property_id
    `);

  const property = propertyResult.recordset[0];

  if (!property) {
    throw new AppError(
      "Property not found",
      ERROR_CODES.PROPERTY_NOT_FOUND,
      404,
    );
  }

  if (!canAccessAll(currentUser.role) && currentUser.id !== property.user_id) {
    throw new AppError("Access denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  const totalResult = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id).query(`
      SELECT COALESCE(SUM(room_count), 0) AS total_rooms
      FROM room_types
      WHERE property_id = @property_id
    `);

  const currentTotalRooms = totalResult.recordset[0].total_rooms;
  const newTotalRooms = currentTotalRooms + Number(room_count);

  if (newTotalRooms > property.max_allowed_rooms) {
    throw new AppError(
      "Room limit exceeded for this property",
      ERROR_CODES.ROOM_LIMIT_EXCEEDED,
      400,
    );
  }

  //CHANNEX INSERT
  const channexPropertyId = await getChannexPropertyId(property_id);

  let syncLog;
  let channexResult;
  let channexRoomType;
  let channexRoomTypeId;

  try {
    syncLog = await syncLogService.createSyncLog({
      entity_type: "room_type",
      entity_id: null,
      action: "create",
      request_payload: {
        property_id,
        ...body,
      },
    });

    channexResult = await channexRoomTypeService.createRoomType({
      ...body,
      channex_property_id: channexPropertyId,
    });

    channexRoomType = channexResult.response?.data;
    channexRoomTypeId = channexRoomType?.id;

    if (!channexRoomTypeId) {
      throw new AppError(
        "Channex did not return room type id",
        ERROR_CODES.INVALID_ROOM_TYPE_VALUES,
        500,
      );
    }
  } catch (err) {
    if (syncLog) {
      await syncLogService.markFailedChannex(syncLog.id, err);
    }

    throw err;
  }

  try {
    //LOCAL INSERT
    const result = await pool
      .request()
      .input("property_id", sql.UniqueIdentifier, property_id)
      .input("user_id", sql.UniqueIdentifier, property.user_id)
      .input("name", sql.NVarChar, channexRoomType.attributes.title)
      .input("room_count", sql.Int, channexRoomType.attributes.count_of_rooms)
      .input("adults", sql.Int, channexRoomType.attributes.occ_adults)
      .input("children", sql.Int, channexRoomType.attributes.occ_children)
      .input("infants", sql.Int, channexRoomType.attributes.occ_infants)
      .input(
        "default_occupancy",
        sql.Int,
        channexRoomType.attributes.default_occupancy,
      )
      .input("channex_room_type_id", sql.NVarChar, channexRoomTypeId)
      .input("sync_status", sql.TinyInt, SYNC_STATUS.SYNCED).query(`
        INSERT INTO room_types (
          property_id,
          user_id,
          name,
          room_count,
          adults,
          children,
          infants,
          default_occupancy,
          channex_room_type_id,
          sync_status
        )
        OUTPUT inserted.*
        VALUES (
          @property_id,
          @user_id,
          @name,
          @room_count,
          @adults,
          @children,
          @infants,
          @default_occupancy,
          @channex_room_type_id,
          @sync_status
        )
      `);

    const roomType = sanitizeRoomType(result.recordset[0], currentUser);

    await syncLogService.markSyncSuccess(syncLog.id, channexResult.response);

    return roomType;
  } catch (err) {
    await syncLogService.markFailedLocalSave(
      syncLog.id,
      err,
      channexResult.response,
    );

    console.log("LOCAL SAVE ERROR:", err);
    console.log(
      "CHANNEX RESPONSE:",
      JSON.stringify(channexResult.response, null, 2),
    );

    throw new AppError(
      "Room Type was created externally but local save failed. Recovery is required.",
      ERROR_CODES.ROOM_TYPE_LOCAL_SAVE_FAILED,
      500,
    );
  }
}

// ======================================
// GET ROOM TYPES
// ======================================

async function getRoomTypes(property_id, filters, currentUser) {
  const pool = getPool();

  const request = pool.request();

  request.input("property_id", sql.UniqueIdentifier, property_id);

  const whereClause = buildRoomTypesFilters(filters, request, currentUser);

  let query = `
    SELECT
      rt.id,
      rt.property_id,
      rt.user_id,
      rt.name,
      rt.room_count,
      rt.adults,
      rt.children,
      rt.infants,
      rt.default_occupancy,
      rt.is_active,
      rt.channex_room_type_id,
      rt.sync_status,
      rt.created_at,
      ss.name AS sync_status_name,
      ss.description AS sync_status_description

    FROM room_types rt
    LEFT JOIN sync_statuses ss
          ON rt.sync_status = ss.code
    
    ${whereClause}
  `;

  if (!canAccessAll(currentUser.role)) {
    query += `
      AND rt.user_id = @user_id
    `;

    request.input("user_id", sql.UniqueIdentifier, currentUser.id);
  }

  const { page, pageSize, offset } = getPagination(filters);

  request.input("offset", sql.Int, offset);
  request.input("pageSize", sql.Int, pageSize);

  const finalQuery = `
    ${query}
    ORDER BY rt.created_at DESC
    OFFSET @offset ROWS
    FETCH NEXT @pageSize ROWS ONLY
  `;

  const countRequest = pool.request();

  countRequest.input("property_id", sql.UniqueIdentifier, property_id);

  let countWhereClause = buildRoomTypesFilters(filters, countRequest,currentUser);

  if (!canAccessAll(currentUser.role)) {
    countWhereClause += `
      AND rt.user_id = @user_id
    `;

    countRequest.input("user_id", sql.UniqueIdentifier, currentUser.id);
  }

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM room_types rt
    ${countWhereClause}
  `;

  const totalResult = await countRequest.query(countQuery);
  const total = totalResult.recordset[0].total;

  const result = await request.query(finalQuery);

  let roomTypes = result.recordset;

  if (filters.include_external === "true" && canAccessAll(currentUser.role)) {
    for (const roomType of roomTypes) {
      if (!roomType.channex_room_type_id) continue;

      roomType.external = await channexRoomTypeService.getRoomType(
        roomType.channex_room_type_id,
      );
    }
  }

  roomTypes = roomTypes.map((roomType) =>
    sanitizeRoomType(roomType, currentUser),
  );

  return {
    room_types: roomTypes,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// ======================================
// GET ROOM TYPE BY ID
// ======================================

async function getRoomTypeByID(
  property_id,
  room_type_id,
  currentUser,
  options = {},
) {
  const pool = getPool();

  const request = pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id);

  let query = `
    SELECT
      rt.id,
      rt.property_id,
      rt.user_id,
      rt.name,
      rt.room_count,
      rt.adults,
      rt.children,
      rt.infants,
      rt.default_occupancy,
      rt.is_active,
      rt.channex_room_type_id,
      rt.sync_status,
      rt.created_at,
      ss.name AS sync_status_name,
      ss.description AS sync_status_description
    FROM room_types rt
    LEFT JOIN sync_statuses ss
      ON rt.sync_status = ss.code
    WHERE rt.id = @room_type_id
      AND rt.property_id = @property_id
  `;

  if (!canAccessAll(currentUser.role)) {
    query += `
      AND rt.user_id = @user_id
    `;

    request.input("user_id", sql.UniqueIdentifier, currentUser.id);
  }

  const result = await request.query(query);

  const roomType = result.recordset[0];

  if (!roomType) {
    throw new AppError(
      "Room type not found",
      ERROR_CODES.ROOM_TYPE_NOT_FOUND,
      404,
    );
  }

  if (
    options.include_external === "true" &&
    canAccessAll(currentUser.role) &&
    roomType.channex_room_type_id
  ) {
    const external = await channexRoomTypeService.getRoomType(
      roomType.channex_room_type_id,
    );

    return {
      room_type: sanitizeRoomType(roomType, currentUser),
      external,
    };
  }

  return sanitizeRoomType(roomType, currentUser);
}

// ======================================
// UPDATE ROOM TYPE
// ======================================
async function updateRoomType(property_id, room_type_id, body, currentUser) {
  body = body || {};

  const pool = getPool();

  const existingResult = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id).query(`
      SELECT
        rt.*,
        p.max_allowed_rooms,
        ss.name AS sync_status_name,
        ss.description AS sync_status_description
      FROM room_types rt
      INNER JOIN properties p
        ON rt.property_id = p.id
      LEFT JOIN sync_statuses ss
        ON rt.sync_status = ss.code
      WHERE rt.id = @room_type_id
        AND rt.property_id = @property_id
    `);

  const existingRoomType = existingResult.recordset[0];

  if (!existingRoomType) {
    throw new AppError(
      "Room type not found",
      ERROR_CODES.ROOM_TYPE_NOT_FOUND,
      404,
    );
  }

  if (
    !canAccessAll(currentUser.role) &&
    currentUser.id !== existingRoomType.user_id
  ) {
    throw new AppError("Access denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  if (!existingRoomType.is_active) {
    throw new AppError(
      "Room type is not active for updates",
      ERROR_CODES.ROOM_TYPE_INACTIVE,
      400,
    );
  }
  const updates = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.room_count !== undefined) updates.room_count = body.room_count;
  if (body.adults !== undefined) updates.adults = body.adults;
  if (body.children !== undefined) updates.children = body.children;
  if (body.infants !== undefined) updates.infants = body.infants;

  if (Object.keys(updates).length === 0) {
    throw new AppError(
      "No fields provided",
      ERROR_CODES.NO_FIELDS_TO_UPDATE,
      400,
    );
  }

  const finalRoomCount =
    updates.room_count !== undefined
      ? Number(updates.room_count)
      : Number(existingRoomType.room_count);

  const finalAdults =
    updates.adults !== undefined
      ? Number(updates.adults)
      : Number(existingRoomType.adults);

  const finalChildren =
    updates.children !== undefined
      ? Number(updates.children)
      : Number(existingRoomType.children);

  const finalInfants =
    updates.infants !== undefined
      ? Number(updates.infants)
      : Number(existingRoomType.infants);

  const finalDefaultOccupancy =
    updates.default_occupancy !== undefined
      ? Number(updates.default_occupancy)
      : Number(existingRoomType.default_occupancy);

  if (
    finalRoomCount < 0 ||
    finalAdults < 0 ||
    finalChildren < 0 ||
    finalInfants < 0 ||
    finalDefaultOccupancy < 0
  ) {
    throw new AppError(
      "Room values cannot be negative",
      ERROR_CODES.INVALID_ROOM_TYPE_VALUES,
      400,
    );
  }

  if (finalDefaultOccupancy > finalAdults + finalChildren + finalInfants) {
    throw new AppError(
      "default_occupancy cannot exceed total capacity",
      ERROR_CODES.INVALID_ROOM_TYPE_VALUES,
      400,
    );
  }

  if (updates.room_count !== undefined) {
    const totalResult = await pool
      .request()
      .input("property_id", sql.UniqueIdentifier, property_id)
      .input("room_type_id", sql.UniqueIdentifier, room_type_id).query(`
        SELECT COALESCE(SUM(room_count), 0) AS total_other_rooms
        FROM room_types
        WHERE property_id = @property_id
          AND id <> @room_type_id
      `);

    const totalOtherRooms = Number(totalResult.recordset[0].total_other_rooms);
    const newTotalRooms = totalOtherRooms + finalRoomCount;

    if (newTotalRooms > existingRoomType.max_allowed_rooms) {
      throw new AppError(
        "Room limit exceeded for this property",
        ERROR_CODES.ROOM_LIMIT_EXCEEDED,
        400,
      );
    }
  }

  // ======================================
  // SYNC VALIDATION
  // ======================================

  if (!existingRoomType.channex_room_type_id) {
    throw new AppError(
      "Room type is not synced",
      ERROR_CODES.ROOM_TYPE_NOT_SYNCED,
      409,
    );
  }

  // ======================================
  // UPDATE CHANNEX FIRST
  // ======================================

  let syncLog;
  let channexResult = null;

  try {
    syncLog = await syncLogService.createSyncLog({
      entity_type: "room_type",
      entity_id: room_type_id,
      action: "update",
      request_payload: body,
    });

    channexResult = await channexRoomTypeService.updateRoomType(
      existingRoomType.channex_room_type_id,
      body,
    );
  } catch (err) {
    if (syncLog) {
      await syncLogService.markFailedChannex(syncLog.id, err);
    }

    throw err;
  }

  const request = pool.request();

  request.input("property_id", sql.UniqueIdentifier, property_id);
  request.input("room_type_id", sql.UniqueIdentifier, room_type_id);

  const setClauses = [];

  for (const [key, value] of Object.entries(updates)) {
    setClauses.push(`${key} = @${key}`);

    if (key === "name") {
      request.input(key, sql.NVarChar, value);
    }

    if (
      key === "room_count" ||
      key === "adults" ||
      key === "children" ||
      key === "infants" ||
      key === "default_occupancy"
    ) {
      request.input(key, sql.Int, value);
    }
  }

  let result;

  try {
    result = await request.query(`
      UPDATE room_types
      SET ${setClauses.join(", ")}
      WHERE id = @room_type_id
        AND property_id = @property_id;

      SELECT *
      FROM room_types
      WHERE id = @room_type_id
        AND property_id = @property_id;
    `);
  } catch (err) {
    await syncLogService.markFailedLocalSave(
      syncLog.id,
      err,
      channexResult?.response || null,
    );

    throw new AppError(
      "Room type was updated externally but local update failed. Recovery is required.",
      ERROR_CODES.ROOM_TYPE_LOCAL_SAVE_FAILED,
      500,
    );
  }

  const updatedRoomType = result.recordset[0];

  await syncLogService.markSyncSuccess(
    syncLog.id,
    channexResult?.response || null,
  );

  return sanitizeRoomType(updatedRoomType, currentUser);
}

// ======================================
// ACTIVATE ROOM TYPE
// ======================================
async function activateRoomType(property_id, room_type_id, currentUser) {
  const pool = getPool();

  const existingResult = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id).query(`
      SELECT *
      FROM room_types
      WHERE id = @room_type_id AND property_id = @property_id
    `);

  const room_type = existingResult.recordset[0];

  if (!room_type) {
    throw new AppError(
      "Room type not found",
      ERROR_CODES.ROOM_TYPE_NOT_FOUND,
      404,
    );
  }

  if (!canAccessAll(currentUser.role) && currentUser.id !== room_type.user_id) {
    throw new AppError("Access denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  const result = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id).query(`
      UPDATE room_types
      SET is_active = 1
      WHERE id = @room_type_id
        AND property_id = @property_id;

      SELECT *
      FROM room_types
      WHERE id = @room_type_id
        AND property_id = @property_id;
    `);

  return result.recordset[0];
}

// ======================================
// DELETE ROOM TYPE(DE-ACTIVATE)
// ======================================
async function deactivateRoomType(property_id, room_type_id, currentUser) {
  const pool = getPool();

  const existingResult = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id).query(`
      SELECT *
      FROM room_types
      WHERE id = @room_type_id AND property_id = @property_id
    `);

  const room_type = existingResult.recordset[0];

  if (!room_type) {
    throw new AppError(
      "Room type not found",
      ERROR_CODES.ROOM_TYPE_NOT_FOUND,
      404,
    );
  }

  if (!canAccessAll(currentUser.role) && currentUser.id !== room_type.user_id) {
    throw new AppError("Access denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  const result = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id).query(`
      UPDATE room_types
      SET is_active = 0
      WHERE id = @room_type_id
        AND property_id = @property_id;

      SELECT *
      FROM room_types
      WHERE id = @room_type_id
        AND property_id = @property_id;
    `);

  return result.recordset[0];
}

module.exports = {
  createRoomType,
  getRoomTypes,
  getRoomTypeByID,
  updateRoomType,
  activateRoomType,
  deactivateRoomType,
};

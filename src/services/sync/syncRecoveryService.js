const { getPool, sql } = require("../../config/db");
const AppError = require("../../utils/AppError");
const ERROR_CODES = require("../../constants/errorCodes");
const SYNC_STATUS = require("../../constants/syncStatus");
const syncLogService = require("./syncLogService");
const getPagination = require("../../utils/pagination");

//GET LOGS
async function getSyncLogs(filters, currentUser) {
  if (currentUser.role !== "superadmin" && currentUser.role !== "admin") {
    throw new AppError("Access Denied", ERROR_CODES.USER_UNAUTHORIZED, 400);
  }

  const pool = getPool();
  const request = pool.request();

  let whereClause = `WHERE 1 = 1`;

  const status = filters.status || "failed_local_save";

  whereClause += ` AND status = @status `;
  request.input("status", sql.NVarChar, status);

  if (filters.entity_type) {
    whereClause += ` AND entity_type = @entity_type `;
    request.input("entity_type", sql.NVarChar, filters.entity_type);
  }

  if (filters.entity_id) {
    whereClause += ` AND entity_id = @entity_id `;
    request.input("entity_id", sql.UniqueIdentifier, filters.entity_id);
  }
  
  if (filters.action) {
    whereClause += ` AND action = @action `;
    request.input("action", sql.NVarChar, filters.action);
  }

  const { page, pageSize, offset } = getPagination(filters);

  request.input("offset", sql.Int, offset);
  request.input("pageSize", sql.Int, pageSize);

  const countRequest = pool.request();

  countRequest.input("status", sql.NVarChar, status);

  if (filters.entity_type) {
    countRequest.input("entity_type", sql.NVarChar, filters.entity_type);
  }

  if (filters.entity_id) {
    countRequest.input("entity_id", sql.UniqueIdentifier, filters.entity_id);
  }

  if (filters.action) {
    countRequest.input("action", sql.NVarChar, filters.action);
  }

  const totalResult = await countRequest.query(`
    SELECT COUNT(*) AS total
    FROM sync_logs
    ${whereClause}
  `);

  const total = totalResult.recordset[0].total;

  const result = await request.query(`
    SELECT
      id,
      entity_type,
      entity_id,
      action,
      status,
      error_message,
      request_payload,
      response_payload,
      created_at,
      updated_at
    FROM sync_logs
    ${whereClause}
    ORDER BY created_at DESC
    OFFSET @offset ROWS
    FETCH NEXT @pageSize ROWS ONLY
  `);

  return {
    sync_logs: result.recordset,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

//RECOVER SYNC LOGS
async function recoverSyncLog(sync_log_id, currentUser) {
  if (currentUser.role !== "superadmin" && currentUser.role !== "admin") {
    throw new AppError("Access Denied", ERROR_CODES.USER_UNAUTHORIZED, 400);
  }
  const pool = getPool();

  const logResult = await pool
    .request()
    .input("sync_log_id", sql.UniqueIdentifier, sync_log_id).query(`
      SELECT *
      FROM sync_logs
      WHERE id = @sync_log_id
    `);

  const syncLog = logResult.recordset[0];

  if (!syncLog) {
    throw new AppError(
      "Sync log not found",
      ERROR_CODES.SYNC_LOG_NOT_FOUND,
      404,
    );
  }

  if (syncLog.status !== "failed_local_save") {
    throw new AppError(
      "Only failed local saves can be recovered",
      ERROR_CODES.INVALID_SYNC_STATUS,
      400,
    );
  }

  if (syncLog.entity_type === "property") {
    return recoverProperty(syncLog, currentUser);
  }

  if (syncLog.entity_type === "room_type") {
    return recoverRoomType(syncLog, currentUser);
  }

  if (syncLog.entity_type === "rate_plan") {
    return recoverRatePlan(syncLog, currentUser);
  }

  if (syncLog.entity_type === "room_type_availability") {
    return recoverRoomTypeAvailability(syncLog, currentUser);
  }
 
  if (syncLog.entity_type === "rate_plan_daily") {
    return recoverRatePlanDaily(syncLog, currentUser);
  }

  throw new AppError(
    "Unsupported sync entity",
    ERROR_CODES.INVALID_SYNC_ENTITY,
    400,
  );
}

module.exports = {
  getSyncLogs,
  recoverSyncLog,
};

//===============================
//PROPERTY RECOVER
//===============================
async function recoverProperty(syncLog, currentUser) {
  const responsePayload = JSON.parse(syncLog.response_payload);
  const channexProperty = responsePayload.data;
  const attributes = channexProperty.attributes || {};

  const existingResult = await pool
    .request()
    .input("channex_property_id", sql.NVarChar, channexProperty.id).query(`
      SELECT id
      FROM properties
      WHERE channex_property_id = @channex_property_id
    `);

  if (existingResult.recordset.length > 0) {
    await syncLogService.markRecovered(sync_log_id);

    return {
      message: "Property already exists locally",
      property_id: existingResult.recordset[0].id,
    };
  }

  const requestPayload = JSON.parse(syncLog.request_payload);
  const userId = requestPayload.user_id || currentUser.id;

  const result = await pool
    .request()
    .input("user_id", sql.UniqueIdentifier, userId)
    .input("channex_property_id", sql.NVarChar, channexProperty.id)
    .input("sync_status", sql.TinyInt, SYNC_STATUS.SYNCED)

    .input("name", sql.NVarChar, attributes.title)
    .input("city", sql.NVarChar, attributes.city)
    .input("postal_code", sql.NVarChar, attributes.zip_code)
    .input("address", sql.NVarChar, attributes.address)
    .input("email", sql.NVarChar, attributes.email || null)
    .input("phone", sql.NVarChar, attributes.phone || null)
    .input("country", sql.NVarChar, attributes.country || "GR")
    .input("currency", sql.NVarChar, attributes.currency || "EUR")
    .input(
      "property_type_code",
      sql.NVarChar,
      attributes.property_type || "hotel",
    )
    .input(
      "max_allowed_rooms",
      sql.Int,
      requestPayload.max_allowed_rooms || null,
    ).query(`
      INSERT INTO properties (
        user_id,
        channex_property_id,
        sync_status,

        name,
        city,
        postal_code,
        address,
        email,
        phone,
        country,
        currency,
        property_type_code,
        max_allowed_rooms
      )
      OUTPUT inserted.*
      VALUES (
        @user_id,
        @channex_property_id,
        @sync_status,

        @name,
        @city,
        @postal_code,
        @address,
        @email,
        @phone,
        @country,
        @currency,
        @property_type_code,
        @max_allowed_rooms
      )
    `);

  await syncLogService.markRecovered(sync_log_id);

  return {
    property: result.recordset[0],
  };
}

//===============================
//ROOM TYPE RECOVER
//===============================
async function recoverRoomType(syncLog, currentUser) {
  const pool = getPool();

  const responsePayload = JSON.parse(syncLog.response_payload);
  const requestPayload = JSON.parse(syncLog.request_payload);

  const channexRoomType = responsePayload.data;
  const attributes = channexRoomType.attributes || {};

  const existingResult = await pool
    .request()
    .input("channex_room_type_id", sql.NVarChar, channexRoomType.id).query(`
      SELECT id
      FROM room_types
      WHERE channex_room_type_id = @channex_room_type_id
    `);

  if (existingResult.recordset.length > 0) {
    await syncLogService.markRecovered(syncLog.id);

    return {
      message: "Room type already exists locally",
      room_type_id: existingResult.recordset[0].id,
    };
  }

  const propertyResult = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, requestPayload.property_id)
    .query(`
      SELECT id, user_id
      FROM properties
      WHERE id = @property_id
    `);

  const property = propertyResult.recordset[0];

  if (!property) {
    throw new AppError(
      "Property not found for room type recovery",
      ERROR_CODES.PROPERTY_NOT_FOUND,
      404,
    );
  }

  const result = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property.id)
    .input("user_id", sql.UniqueIdentifier, property.user_id)
    .input("channex_room_type_id", sql.NVarChar, channexRoomType.id)
    .input("sync_status", sql.TinyInt, SYNC_STATUS.SYNCED)

    .input("name", sql.NVarChar, attributes.title)
    .input("room_count", sql.Int, attributes.count_of_rooms)
    .input("adults", sql.Int, attributes.occ_adults)
    .input("children", sql.Int, attributes.occ_children || 0)
    .input("infants", sql.Int, attributes.occ_infants || 0)
    .input("default_occupancy", sql.Int, attributes.default_occupancy).query(`
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

  await syncLogService.markRecovered(syncLog.id);

  return {
    room_type: result.recordset[0],
  };
}

//===============================
//RATE PLAN RECOVER
//===============================
async function recoverRatePlan(syncLog, currentUser) {
  const pool = getPool();

  const responsePayload = JSON.parse(syncLog.response_payload);
  const requestPayload = JSON.parse(syncLog.request_payload);

  const channexRatePlan = responsePayload.data;
  const attrs = channexRatePlan.attributes || {};

  const existingResult = await pool
    .request()
    .input("channex_rate_plan_id", sql.NVarChar, channexRatePlan.id).query(`
      SELECT id
      FROM rate_plans
      WHERE channex_rate_plan_id = @channex_rate_plan_id
    `);

  if (existingResult.recordset.length > 0) {
    await syncLogService.markRecovered(syncLog.id);

    return {
      message: "Rate plan already exists locally",
      rate_plan_id: existingResult.recordset[0].id,
    };
  }

  const roomTypeResult = await pool
    .request()
    .input("room_type_id", sql.UniqueIdentifier, requestPayload.room_type_id)
    .query(`
      SELECT id, property_id, user_id
      FROM room_types
      WHERE id = @room_type_id
    `);

  const roomType = roomTypeResult.recordset[0];

  if (!roomType) {
    throw new AppError(
      "Room type not found for rate plan recovery",
      ERROR_CODES.ROOM_TYPE_NOT_FOUND,
      404,
    );
  }

  const ratePlanResult = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, roomType.property_id)
    .input("room_type_id", sql.UniqueIdentifier, roomType.id)
    .input("user_id", sql.UniqueIdentifier, roomType.user_id)
    .input("meal_type_code", sql.NVarChar, attrs.meal_type || null)
    .input("title", sql.NVarChar, attrs.title)
    .input("currency", sql.NVarChar, attrs.currency || "EUR")
    .input("sell_mode", sql.NVarChar, attrs.sell_mode || "per_room")
    .input("rate_mode", sql.NVarChar, attrs.rate_mode || "manual")
    .input("children_fee", sql.Decimal(10, 2), attrs.children_fee || 0)
    .input("infant_fee", sql.Decimal(10, 2), attrs.infant_fee || 0)
    .input(
      "min_stay_arrival",
      sql.NVarChar,
      JSON.stringify(attrs.min_stay_arrival || [1, 1, 1, 1, 1, 1, 1]),
    )
    .input(
      "min_stay_through",
      sql.NVarChar,
      JSON.stringify(attrs.min_stay_through || [1, 1, 1, 1, 1, 1, 1]),
    )
    .input(
      "max_stay",
      sql.NVarChar,
      JSON.stringify(attrs.max_stay || [0, 0, 0, 0, 0, 0, 0]),
    )
    .input(
      "closed_to_arrival",
      sql.NVarChar,
      JSON.stringify(
        attrs.closed_to_arrival || [
          false,
          false,
          false,
          false,
          false,
          false,
          false,
        ],
      ),
    )
    .input(
      "closed_to_departure",
      sql.NVarChar,
      JSON.stringify(
        attrs.closed_to_departure || [
          false,
          false,
          false,
          false,
          false,
          false,
          false,
        ],
      ),
    )
    .input(
      "stop_sell",
      sql.NVarChar,
      JSON.stringify(
        attrs.stop_sell || [false, false, false, false, false, false, false],
      ),
    )
    .input("channex_rate_plan_id", sql.NVarChar, channexRatePlan.id)
    .input("sync_status", sql.TinyInt, SYNC_STATUS.SYNCED).query(`
      INSERT INTO rate_plans (
        property_id,
        room_type_id,
        user_id,
        meal_type_code,
        title,
        currency,
        sell_mode,
        rate_mode,
        children_fee,
        infant_fee,
        min_stay_arrival,
        min_stay_through,
        max_stay,
        closed_to_arrival,
        closed_to_departure,
        stop_sell,
        channex_rate_plan_id,
        sync_status
      )
      OUTPUT inserted.*
      VALUES (
        @property_id,
        @room_type_id,
        @user_id,
        @meal_type_code,
        @title,
        @currency,
        @sell_mode,
        @rate_mode,
        @children_fee,
        @infant_fee,
        @min_stay_arrival,
        @min_stay_through,
        @max_stay,
        @closed_to_arrival,
        @closed_to_departure,
        @stop_sell,
        @channex_rate_plan_id,
        @sync_status
      )
    `);

  const ratePlan = ratePlanResult.recordset[0];

  for (const option of requestPayload.options || []) {
    await pool
      .request()
      .input("rate_plan_id", sql.UniqueIdentifier, ratePlan.id)
      .input("occupancy", sql.Int, option.occupancy)
      .input("is_primary", sql.Bit, option.is_primary)
      .input("rate", sql.Decimal(10, 2), option.rate).query(`
        INSERT INTO rate_plan_options (
          rate_plan_id,
          occupancy,
          is_primary,
          rate
        )
        VALUES (
          @rate_plan_id,
          @occupancy,
          @is_primary,
          @rate
        )
      `);
  }

  await syncLogService.markRecovered(syncLog.id);

  return {
    rate_plan: ratePlan,
  };
}


//===============================
//ROOM TYPE AVAILABILITY RECOVER
//===============================
async function recoverRoomTypeAvailability(syncLog, currentUser) {
  const pool = getPool();

  const requestPayload = JSON.parse(syncLog.request_payload);

  const {
    property_id,
    room_type_id,
    date,
    date_from,
    date_to,
    availability
  } = requestPayload;

  const startDate = new Date(date || date_from);
  const endDate = new Date(date || date_to);

  const roomTypeResult = await pool.request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id)
    .query(`
      SELECT id, property_id, user_id
      FROM room_types
      WHERE id = @room_type_id
        AND property_id = @property_id
    `);

  const roomType = roomTypeResult.recordset[0];

  if (!roomType) {
    throw new AppError(
      "Room type not found for availability recovery",
      ERROR_CODES.ROOM_TYPE_NOT_FOUND,
      404
    );
  }

  let updated = 0;
  let inserted = 0;

  const days =
    Math.floor((endDate - startDate) / 86400000) + 1;

  for (let i = 0; i < days; i++) {
    const currentDate =
      new Date(startDate.getTime() + i * 86400000);

    const result = await pool.request()
      .input("property_id", sql.UniqueIdentifier, property_id)
      .input("room_type_id", sql.UniqueIdentifier, room_type_id)
      .input("user_id", sql.UniqueIdentifier, roomType.user_id)
      .input("date", sql.Date, currentDate)
      .input("availability", sql.Int, availability)
      .query(`
        IF EXISTS (
          SELECT 1
          FROM room_type_availability
          WHERE room_type_id = @room_type_id
            AND date = @date
        )
        BEGIN
          UPDATE room_type_availability
          SET
            availability = @availability,
            manual_override = 1,
            updated_at = GETDATE()
          WHERE room_type_id = @room_type_id
            AND date = @date;

          SELECT 'updated' AS action;
        END
        ELSE
        BEGIN
          INSERT INTO room_type_availability (
            property_id,
            room_type_id,
            user_id,
            date,
            availability,
            manual_override
          )
          VALUES (
            @property_id,
            @room_type_id,
            @user_id,
            @date,
            @availability,
            1
          );

          SELECT 'inserted' AS action;
        END
      `);

    if (result.recordset[0].action === "updated") {
      updated++;
    } else {
      inserted++;
    }
  }

  await syncLogService.markRecovered(syncLog.id);

  return {
    room_type_availability: {
      property_id,
      room_type_id,
      date_from: startDate.toISOString().slice(0, 10),
      date_to: endDate.toISOString().slice(0, 10),
      availability,
      days,
      updated,
      inserted
    }
  };
}


//===============================
//RATE PLAN DAILY RECOVER
//===============================
async function recoverRatePlanDaily(syncLog, currentUser) {
  const pool = getPool();

  const requestPayload = JSON.parse(syncLog.request_payload);

  const {
    property_id,
    room_type_id,
    rate_plan_id,
    date,
    date_from,
    date_to,
    min_stay_arrival,
    min_stay_through,
    max_stay,
    closed_to_arrival,
    closed_to_departure,
    stop_sell,
    options
  } = requestPayload;

  const startDate = new Date(date || date_from);
  const endDate = new Date(date || date_to);

  const ratePlanResult = await pool.request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id)
    .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id)
    .query(`
      SELECT id, property_id, room_type_id, user_id
      FROM rate_plans
      WHERE id = @rate_plan_id
        AND property_id = @property_id
        AND room_type_id = @room_type_id
    `);

  const ratePlan = ratePlanResult.recordset[0];

  if (!ratePlan) {
    throw new AppError(
      "Rate plan not found for daily recovery",
      ERROR_CODES.RATE_PLAN_NOT_FOUND,
      404
    );
  }

  let updated = 0;
  let inserted = 0;
  let optionsUpdated = 0;
  let optionsInserted = 0;

  const days = Math.floor((endDate - startDate) / 86400000) + 1;

  for (let i = 0; i < days; i++) {
    const currentDate = new Date(startDate.getTime() + i * 86400000);

    const dailyResult = await pool.request()
      .input("property_id", sql.UniqueIdentifier, property_id)
      .input("room_type_id", sql.UniqueIdentifier, room_type_id)
      .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id)
      .input("user_id", sql.UniqueIdentifier, ratePlan.user_id)
      .input("date", sql.Date, currentDate)
      .input("min_stay_arrival", sql.Int, min_stay_arrival ?? null)
      .input("min_stay_through", sql.Int, min_stay_through ?? null)
      .input("max_stay", sql.Int, max_stay ?? null)
      .input("closed_to_arrival", sql.Bit, closed_to_arrival !== undefined ? Number(closed_to_arrival) : null)
      .input("closed_to_departure", sql.Bit, closed_to_departure !== undefined ? Number(closed_to_departure) : null)
      .input("stop_sell", sql.Bit, stop_sell !== undefined ? Number(stop_sell) : null)
      .query(`
        IF EXISTS (
          SELECT 1
          FROM rate_plan_daily
          WHERE rate_plan_id = @rate_plan_id
            AND date = @date
        )
        BEGIN
          UPDATE rate_plan_daily
          SET
            min_stay_arrival = COALESCE(@min_stay_arrival, min_stay_arrival),
            min_stay_through = COALESCE(@min_stay_through, min_stay_through),
            max_stay = COALESCE(@max_stay, max_stay),
            closed_to_arrival = COALESCE(@closed_to_arrival, closed_to_arrival),
            closed_to_departure = COALESCE(@closed_to_departure, closed_to_departure),
            stop_sell = COALESCE(@stop_sell, stop_sell),
            updated_at = GETDATE()
          OUTPUT inserted.id, 'updated' AS action
          WHERE rate_plan_id = @rate_plan_id
            AND date = @date;
        END
        ELSE
        BEGIN
          INSERT INTO rate_plan_daily (
            property_id,
            room_type_id,
            rate_plan_id,
            user_id,
            date,
            min_stay_arrival,
            min_stay_through,
            max_stay,
            closed_to_arrival,
            closed_to_departure,
            stop_sell
          )
          OUTPUT inserted.id, 'inserted' AS action
          VALUES (
            @property_id,
            @room_type_id,
            @rate_plan_id,
            @user_id,
            @date,
            @min_stay_arrival,
            @min_stay_through,
            @max_stay,
            @closed_to_arrival,
            @closed_to_departure,
            @stop_sell
          );
        END
      `);

    const daily = dailyResult.recordset[0];

    if (daily.action === "updated") updated++;
    else inserted++;

    if (Array.isArray(options)) {
      for (const option of options) {
        const optionResult = await pool.request()
          .input("rate_plan_daily_id", sql.UniqueIdentifier, daily.id)
          .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id)
          .input("occupancy", sql.Int, option.occupancy)
          .input("rate", sql.Decimal(10, 2), option.rate)
          .query(`
            IF EXISTS (
              SELECT 1
              FROM rate_plan_daily_options
              WHERE rate_plan_daily_id = @rate_plan_daily_id
                AND occupancy = @occupancy
            )
            BEGIN
              UPDATE rate_plan_daily_options
              SET rate = @rate, updated_at = GETDATE()
              WHERE rate_plan_daily_id = @rate_plan_daily_id
                AND occupancy = @occupancy;

              SELECT 'updated' AS action;
            END
            ELSE
            BEGIN
              INSERT INTO rate_plan_daily_options (
                rate_plan_daily_id,
                rate_plan_id,
                occupancy,
                rate
              )
              VALUES (
                @rate_plan_daily_id,
                @rate_plan_id,
                @occupancy,
                @rate
              );

              SELECT 'inserted' AS action;
            END
          `);

        if (optionResult.recordset[0].action === "updated") optionsUpdated++;
        else optionsInserted++;
      }
    }
  }

  await syncLogService.markRecovered(syncLog.id);

  return {
    rate_plan_daily: {
      property_id,
      room_type_id,
      rate_plan_id,
      date_from: startDate.toISOString().slice(0, 10),
      date_to: endDate.toISOString().slice(0, 10),
      days,
      restrictions_updated: updated,
      restrictions_inserted: inserted,
      options_updated: optionsUpdated,
      options_inserted: optionsInserted
    }
  };
}

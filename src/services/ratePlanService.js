const { getPool, sql } = require("../config/db");
const AppError = require("../utils/AppError");
const ERROR_CODES = require("../constants/errorCodes");
const { canAccessAll } = require("../utils/access");
const buildRatePlanFilters = require("../utils/buildRatePlanFilters");
const getPagination = require("../utils/pagination");
const channexRatePlanService = require("./channex/channexRatePlanService");
const syncLogService = require("./sync/syncLogService");
const SYNC_STATUS = require("../constants/syncStatus");
const {
  getChannexPropertyId,
  getChannexRoomTypeId,
} = require("./channex/channexHelpers");
const { sanitizeRatePlan } = require("../utils/sanitizeExternalFields");

// ======================================
// CREATE RATE PLAN
// ======================================

async function createRatePlan(property_id, room_type_id, body, currentUser) {
  const {
    title,
    meal_type_code = null,
    currency = "EUR",
    sell_mode = "per_room",
    rate_mode = "manual",
    children_fee = 0,
    infant_fee = 0,
    min_stay_arrival = [1, 1, 1, 1, 1, 1, 1],
    min_stay_through = [1, 1, 1, 1, 1, 1, 1],
    max_stay = [0, 0, 0, 0, 0, 0, 0],
    closed_to_arrival = [false, false, false, false, false, false, false],
    closed_to_departure = [false, false, false, false, false, false, false],
    stop_sell = [false, false, false, false, false, false, false],
    options,
  } = body;

  if (!title) {
    throw new AppError(
      "Title is required",
      ERROR_CODES.RATE_PLAN_REQUIRED_FIELDS,
      400,
    );
  }

  if (!Array.isArray(options) || options.length === 0) {
    throw new AppError(
      "At least one rate plan option is required",
      ERROR_CODES.RATE_PLAN_REQUIRED_FIELDS,
      400,
    );
  }

  if (!["per_room", "per_person"].includes(sell_mode)) {
    throw new AppError(
      "Invalid sell_mode",
      ERROR_CODES.INVALID_RATE_PLAN_VALUES,
      400,
    );
  }

  if (!["manual", "derived", "auto", "cascade"].includes(rate_mode)) {
    throw new AppError(
      "Invalid rate_mode",
      ERROR_CODES.INVALID_RATE_PLAN_VALUES,
      400,
    );
  }

  if (rate_mode !== "manual") {
    throw new AppError(
      "Only manual rate mode is supported for now",
      ERROR_CODES.INVALID_RATE_PLAN_VALUES,
      400,
    );
  }

  if (children_fee < 0 || infant_fee < 0) {
    throw new AppError(
      "Children fee and infant fee cannot be negative",
      ERROR_CODES.INVALID_RATE_PLAN_VALUES,
      400,
    );
  }

  const pool = getPool();

  const roomTypeResult = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id).query(`
      SELECT
        rt.id,
        rt.property_id,
        rt.user_id,
        rt.adults,
        rt.children,
        rt.infants,
        rt.default_occupancy
      FROM room_types rt
      WHERE rt.id = @room_type_id
        AND rt.property_id = @property_id
        AND rt.is_active = 1
    `);

  const roomType = roomTypeResult.recordset[0];

  if (!roomType) {
    throw new AppError(
      "Room type not found",
      ERROR_CODES.ROOM_TYPE_NOT_FOUND,
      404,
    );
  }

  if (!canAccessAll(currentUser.role) && currentUser.id !== roomType.user_id) {
    throw new AppError("Access denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  if (meal_type_code) {
    const mealTypeResult = await pool
      .request()
      .input("meal_type_code", sql.NVarChar, meal_type_code).query(`
        SELECT code
        FROM meal_types
        WHERE code = @meal_type_code
          AND is_active = 1
      `);

    if (mealTypeResult.recordset.length === 0) {
      throw new AppError(
        "Meal type not found",
        ERROR_CODES.MEAL_TYPE_NOT_FOUND,
        404,
      );
    }
  }

  const primaryOptions = options.filter((option) => option.is_primary === true);

  if (primaryOptions.length !== 1) {
    throw new AppError(
      "Exactly one primary option is required",
      ERROR_CODES.INVALID_RATE_PLAN_VALUES,
      400,
    );
  }

  const maxAllowedOccupancy =
    Number(roomType.adults) +
    Number(roomType.children) +
    Number(roomType.infants);

  for (const option of options) {
    if (!option.occupancy || option.occupancy <= 0) {
      throw new AppError(
        "Option occupancy must be positive",
        ERROR_CODES.INVALID_RATE_PLAN_VALUES,
        400,
      );
    }

    if (option.occupancy > maxAllowedOccupancy) {
      throw new AppError(
        "Option occupancy exceeds room type capacity",
        ERROR_CODES.INVALID_RATE_PLAN_VALUES,
        400,
      );
    }

    if (option.rate === undefined || option.rate < 0) {
      throw new AppError(
        "Option rate must be zero or greater",
        ERROR_CODES.INVALID_RATE_PLAN_VALUES,
        400,
      );
    }
  }

  // ======================================
  // CHANNEX CREATE FIRST
  // ======================================

  const channexPropertyId = await getChannexPropertyId(property_id);
  const channexRoomTypeId = await getChannexRoomTypeId(room_type_id);

  const ratePlanData = {
    title,
    meal_type_code,
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
    options,
    channex_property_id: channexPropertyId,
    channex_room_type_id: channexRoomTypeId,
  };

  let syncLog;
  let channexResult;
  let channexRatePlan;
  let channexRatePlanId;

  try {
    syncLog = await syncLogService.createSyncLog({
      entity_type: "rate_plan",
      entity_id: null,
      action: "create",
      request_payload: {
        property_id,
        room_type_id,
        ...ratePlanData,
      },
    });

    channexResult = await channexRatePlanService.createRatePlan(ratePlanData);

    channexRatePlan = channexResult.response?.data;
    channexRatePlanId = channexRatePlan?.id;

    if (!channexRatePlanId) {
      throw new AppError(
        "Channex did not return rate plan id",
        ERROR_CODES.INVALID_RATE_PLAN_VALUES,
        500,
      );
    }
  } catch (err) {
    if (syncLog) {
      await syncLogService.markFailedChannex(syncLog.id, err);
    }

    throw err;
  }

  let rate_plan;
  let optionsResult;
  // ======================================
  // LOCAL INSERT
  // ======================================
  try {
    const ratePlanResult = await pool
      .request()
      .input("property_id", sql.UniqueIdentifier, property_id)
      .input("room_type_id", sql.UniqueIdentifier, room_type_id)
      .input("user_id", sql.UniqueIdentifier, roomType.user_id)
      .input(
        "meal_type_code",
        sql.NVarChar,
        channexRatePlan.attributes.meal_type_code,
      )
      .input("title", sql.NVarChar, channexRatePlan.attributes.title)
      .input("currency", sql.NVarChar, channexRatePlan.attributes.currency)
      .input("sell_mode", sql.NVarChar, channexRatePlan.attributes.sell_mode)
      .input("rate_mode", sql.NVarChar, channexRatePlan.attributes.rate_mode)
      .input(
        "children_fee",
        sql.Decimal(10, 2),
        channexRatePlan.attributes.children_fee,
      )
      .input(
        "infant_fee",
        sql.Decimal(10, 2),
        channexRatePlan.attributes.infant_fee,
      )
      .input(
        "min_stay_arrival",
        sql.NVarChar,
        channexRatePlan.attributes.min_stay_arrival,
      )
      .input(
        "min_stay_through",
        sql.NVarChar,
        channexRatePlan.attributes.min_stay_through,
      )
      .input("max_stay", sql.NVarChar, channexRatePlan.attributes.max_stay)
      .input(
        "closed_to_arrival",
        sql.NVarChar,
        channexRatePlan.attributes.closed_to_arrival,
      )
      .input(
        "closed_to_departure",
        sql.NVarChar,
        channexRatePlan.attributes.closed_to_departure,
      )
      .input("stop_sell", sql.NVarChar, channexRatePlan.attributes.stop_sell)
      .input("channex_rate_plan_id", sql.NVarChar, channexRatePlanId)
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

    rate_plan = ratePlanResult.recordset[0];

    for (const option of options) {
      await pool
        .request()
        .input("rate_plan_id", sql.UniqueIdentifier, rate_plan.id)
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

    optionsResult = await pool
      .request()
      .input("rate_plan_id", sql.UniqueIdentifier, rate_plan.id).query(`
        SELECT *
        FROM rate_plan_options
        WHERE rate_plan_id = @rate_plan_id
        ORDER BY occupancy ASC
      `);
  } catch (err) {
    await syncLogService.markFailedLocalSave(
      syncLog.id,
      err,
      channexResult.response,
    );

    throw new AppError(
      "Rate plan was created externally but local save failed. Recovery is required.",
      ERROR_CODES.RATE_PLAN_LOCAL_SAVE_FAILED,
      500,
    );
  }

  await syncLogService.markSyncSuccess(syncLog.id, channexResult.response);

  return {
    ...rate_plan,
    options: optionsResult.recordset,
  };
}

// ======================================
// GET RATE PLANS
// ======================================

async function getRatePlans(property_id, room_type_id, filters, currentUser) {
  const pool = getPool();

  const roomTypeResult = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id).query(`
      SELECT
        id,
        property_id,
        user_id
      FROM room_types
      WHERE id = @room_type_id
        AND property_id = @property_id
    `);

  const roomType = roomTypeResult.recordset[0];

  if (!roomType) {
    throw new AppError(
      "Room type not found",
      ERROR_CODES.ROOM_TYPE_NOT_FOUND,
      404,
    );
  }

  if (!canAccessAll(currentUser.role) && currentUser.id !== roomType.user_id) {
    throw new AppError("Access denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  const request = pool.request();

  request.input("property_id", sql.UniqueIdentifier, property_id);
  request.input("room_type_id", sql.UniqueIdentifier, room_type_id);

  const whereClause = buildRatePlanFilters(filters, request, {requirePropertyAndRoomType: true,},currentUser);

  const query = `
    SELECT
      rp.id,
      rp.property_id,
      rp.room_type_id,
      rp.user_id,
      rp.meal_type_code,
      rp.sync_status,
      rp.channex_rate_plan_id,

      ss.name AS sync_status_name,
      ss.description AS sync_status_description,
      mt.name_en AS meal_type_name_en,
      mt.name_el AS meal_type_name_el,

      rp.title,
      rp.currency,
      rp.sell_mode,
      rp.rate_mode,
      rp.children_fee,
      rp.infant_fee,
      rp.min_stay_arrival,
      rp.min_stay_through,
      rp.max_stay,
      rp.closed_to_arrival,
      rp.closed_to_departure,
      rp.stop_sell,
      rp.is_active,
      rp.created_at
    FROM rate_plans rp
    LEFT JOIN meal_types mt
      ON rp.meal_type_code = mt.code
    LEFT JOIN sync_statuses ss
        ON rp.sync_status = ss.code
    ${whereClause}
  `;

  const { page, pageSize, offset } = getPagination(filters);

  request.input("offset", sql.Int, offset);
  request.input("pageSize", sql.Int, pageSize);

  const finalQuery = `
    ${query}
    ORDER BY rp.created_at DESC
    OFFSET @offset ROWS
    FETCH NEXT @pageSize ROWS ONLY
  `;

  const countRequest = pool.request();

  countRequest.input("property_id", sql.UniqueIdentifier, property_id);
  countRequest.input("room_type_id", sql.UniqueIdentifier, room_type_id);

  const countWhereClause = buildRatePlanFilters(filters, countRequest, {requirePropertyAndRoomType: true,},currentUser);

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM rate_plans rp
    LEFT JOIN meal_types mt
      ON rp.meal_type_code = mt.code
    ${countWhereClause}
  `;

  const totalResult = await countRequest.query(countQuery);
  const total = totalResult.recordset[0].total;

  const result = await request.query(finalQuery);

  const ratePlans = result.recordset;

  for (const ratePlan of ratePlans) {
    const optionsResult = await pool
      .request()
      .input("rate_plan_id", sql.UniqueIdentifier, ratePlan.id).query(`
        SELECT
          id,
          rate_plan_id,
          occupancy,
          is_primary,
          rate,
          created_at
        FROM rate_plan_options
        WHERE rate_plan_id = @rate_plan_id
        ORDER BY occupancy ASC
      `);

    ratePlan.options = optionsResult.recordset;
  }
  if (filters.include_external === "true" && canAccessAll(currentUser.role)) {
    for (const ratePlan of ratePlans) {
      if (!ratePlan.channex_rate_plan_id) continue;

      ratePlan.external = await channexRatePlanService.getRatePlan(
        ratePlan.channex_rate_plan_id,
      );
    }
  }

  if (filters.include_external === "true" && canAccessAll(currentUser.role)) {
    for (const ratePlan of ratePlans) {
      if (!ratePlan.channex_rate_plan_id) {
        continue;
      }

      ratePlan.external = await channexRatePlanService.getRatePlan(
        ratePlan.channex_rate_plan_id,
      );
    }
  }

  const sanitizedRatePlans = ratePlans.map((ratePlan) =>
    sanitizeRatePlan(ratePlan, currentUser),
  );

  return {
    rate_plans: sanitizedRatePlans,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// ======================================
// GET RATE PLAN BY ID
// ======================================

async function getRatePlanByID(
  property_id,
  room_type_id,
  rate_plan_id,
  currentUser,
  options = {},
) {
  const pool = getPool();

  const request = pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id)
    .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id);

  let query = `
    SELECT
      rp.id,
      rp.property_id,
      rp.room_type_id,
      rp.user_id,
      rp.meal_type_code,
      rp.sync_status,
      rp.channex_rate_plan_id,

      ss.name AS sync_status_name,
      ss.description AS sync_status_description,

      mt.name_en AS meal_type_name_en,
      mt.name_el AS meal_type_name_el,

      rp.title,
      rp.currency,
      rp.sell_mode,
      rp.rate_mode,
      rp.children_fee,
      rp.infant_fee,
      rp.min_stay_arrival,
      rp.min_stay_through,
      rp.max_stay,
      rp.closed_to_arrival,
      rp.closed_to_departure,
      rp.stop_sell,
      rp.is_active,
      rp.created_at
    FROM rate_plans rp
    LEFT JOIN meal_types mt
      ON rp.meal_type_code = mt.code
    LEFT JOIN sync_statuses ss
      ON rp.sync_status = ss.code
    WHERE rp.id = @rate_plan_id
      AND rp.property_id = @property_id
      AND rp.room_type_id = @room_type_id
  `;

  if (!canAccessAll(currentUser.role)) {
    query += `
      AND rp.user_id = @user_id
    `;

    request.input("user_id", sql.UniqueIdentifier, currentUser.id);
  }

  const result = await request.query(query);

  const ratePlan = result.recordset[0];

  if (!ratePlan) {
    throw new AppError(
      "Rate plan not found",
      ERROR_CODES.RATE_PLAN_NOT_FOUND,
      404,
    );
  }

  const optionsResult = await pool
    .request()
    .input("rate_plan_id", sql.UniqueIdentifier, ratePlan.id).query(`
      SELECT
        id,
        rate_plan_id,
        occupancy,
        is_primary,
        rate,
        created_at
      FROM rate_plan_options
      WHERE rate_plan_id = @rate_plan_id
      ORDER BY occupancy ASC
    `);

  ratePlan.options = optionsResult.recordset;

  if (
    options.include_external === "true" &&
    canAccessAll(currentUser.role) &&
    ratePlan.channex_rate_plan_id
  ) {
    const external = await channexRatePlanService.getRatePlan(
      ratePlan.channex_rate_plan_id,
    );

    return {
      rate_plan: sanitizeRatePlan(ratePlan, currentUser),
      external,
    };
  }

  if (
    options.include_external === "true" &&
    canAccessAll(currentUser.role) &&
    ratePlan.channex_rate_plan_id
  ) {
    const external = await channexRatePlanService.getRatePlan(
      ratePlan.channex_rate_plan_id
    );

    return {
      rate_plan: sanitizeRatePlan(ratePlan, currentUser),
      external
    };
  }


  return sanitizeRatePlan(ratePlan, currentUser);
}

// ======================================
// UPDATE RATE PLAN
// ======================================

async function updateRatePlan(
  property_id,
  room_type_id,
  rate_plan_id,
  body,
  currentUser,
) {
  body = body || {};

  const pool = getPool();

  const existingResult = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id)
    .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id).query(`
      SELECT *
      FROM rate_plans
      WHERE id = @rate_plan_id
        AND property_id = @property_id
        AND room_type_id = @room_type_id
    `);

  const existingRatePlan = existingResult.recordset[0];

  if (!existingRatePlan) {
    throw new AppError(
      "Rate plan not found",
      ERROR_CODES.RATE_PLAN_NOT_FOUND,
      404,
    );
  }

  if (
    !canAccessAll(currentUser.role) &&
    currentUser.id !== existingRatePlan.user_id
  ) {
    throw new AppError("Access denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  const updates = {};

  if (body.title !== undefined) updates.title = body.title;
  if (body.meal_type_code !== undefined)
    updates.meal_type_code = body.meal_type_code;
  if (body.currency !== undefined) updates.currency = body.currency;
  if (body.sell_mode !== undefined) updates.sell_mode = body.sell_mode;
  if (body.rate_mode !== undefined) updates.rate_mode = body.rate_mode;
  if (body.children_fee !== undefined) updates.children_fee = body.children_fee;
  if (body.infant_fee !== undefined) updates.infant_fee = body.infant_fee;

  if (body.min_stay_arrival !== undefined) {
    updates.min_stay_arrival = JSON.stringify(body.min_stay_arrival);
  }

  if (body.min_stay_through !== undefined) {
    updates.min_stay_through = JSON.stringify(body.min_stay_through);
  }

  if (body.max_stay !== undefined) {
    updates.max_stay = JSON.stringify(body.max_stay);
  }

  if (body.closed_to_arrival !== undefined) {
    updates.closed_to_arrival = JSON.stringify(body.closed_to_arrival);
  }

  if (body.closed_to_departure !== undefined) {
    updates.closed_to_departure = JSON.stringify(body.closed_to_departure);
  }

  if (body.stop_sell !== undefined) {
    updates.stop_sell = JSON.stringify(body.stop_sell);
  }

  if (body.is_active !== undefined) {
    updates.is_active = body.is_active;
  }

  if (Object.keys(updates).length === 0 && body.options === undefined) {
    throw new AppError(
      "No fields provided",
      ERROR_CODES.NO_FIELDS_TO_UPDATE,
      400,
    );
  }

  if (
    updates.sell_mode &&
    !["per_room", "per_person"].includes(updates.sell_mode)
  ) {
    throw new AppError(
      "Invalid sell_mode",
      ERROR_CODES.INVALID_RATE_PLAN_VALUES,
      400,
    );
  }

  if (
    updates.rate_mode &&
    !["manual", "derived", "auto", "cascade"].includes(updates.rate_mode)
  ) {
    throw new AppError(
      "Invalid rate_mode",
      ERROR_CODES.INVALID_RATE_PLAN_VALUES,
      400,
    );
  }

  if (updates.rate_mode && updates.rate_mode !== "manual") {
    throw new AppError(
      "Only manual rate mode is supported for now",
      ERROR_CODES.INVALID_RATE_PLAN_VALUES,
      400,
    );
  }

  if (updates.children_fee !== undefined && updates.children_fee < 0) {
    throw new AppError(
      "Children fee cannot be negative",
      ERROR_CODES.INVALID_RATE_PLAN_VALUES,
      400,
    );
  }

  if (updates.infant_fee !== undefined && updates.infant_fee < 0) {
    throw new AppError(
      "Infant fee cannot be negative",
      ERROR_CODES.INVALID_RATE_PLAN_VALUES,
      400,
    );
  }

  if (updates.meal_type_code) {
    const mealTypeResult = await pool
      .request()
      .input("meal_type_code", sql.NVarChar, updates.meal_type_code).query(`
        SELECT code
        FROM meal_types
        WHERE code = @meal_type_code
          AND is_active = 1
      `);

    if (mealTypeResult.recordset.length === 0) {
      throw new AppError(
        "Meal type not found",
        ERROR_CODES.MEAL_TYPE_NOT_FOUND,
        404,
      );
    }
  }
  if (!existingRatePlan.channex_rate_plan_id) {
    throw new AppError(
      "Rate plan is not synced",
      ERROR_CODES.RATE_PLAN_NOT_SYNCED,
      409,
    );
  }

  let syncLog;
  let channexResult;

  console.log(
  "CHANNEX RATE PLAN UPDATE PAYLOAD:",
  JSON.stringify(channexRatePlanService.buildUpdateRatePlanPayload(body), null, 2)
);
  try {
    syncLog = await syncLogService.createSyncLog({
      entity_type: "rate_plan",
      entity_id: rate_plan_id,
      action: "update",
      request_payload: body,
    });

    channexResult = await channexRatePlanService.updateRatePlan(
      existingRatePlan.channex_rate_plan_id,
      body,
    );
  } catch (err) {
    if (syncLog) {
      await syncLogService.markFailedChannex(syncLog.id, err);
    }

    throw err;
  }

  try {
    if (Object.keys(updates).length > 0) {
      const request = pool.request();

      request.input("property_id", sql.UniqueIdentifier, property_id);
      request.input("room_type_id", sql.UniqueIdentifier, room_type_id);
      request.input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id);

      const setClauses = [];

      for (const [key, value] of Object.entries(updates)) {
        setClauses.push(`${key} = @${key}`);

        if (
          key === "title" ||
          key === "currency" ||
          key === "sell_mode" ||
          key === "rate_mode" ||
          key === "meal_type_code" ||
          key === "min_stay_arrival" ||
          key === "min_stay_through" ||
          key === "max_stay" ||
          key === "closed_to_arrival" ||
          key === "closed_to_departure" ||
          key === "stop_sell"
        ) {
          request.input(key, sql.NVarChar, value);
        }

        if (key === "children_fee" || key === "infant_fee") {
          request.input(key, sql.Decimal(10, 2), value);
        }

        if (key === "is_active") {
          request.input(key, sql.Bit, Number(value));
        }
      }

      await request.query(`
        UPDATE rate_plans
        SET ${setClauses.join(", ")}
        WHERE id = @rate_plan_id
          AND property_id = @property_id
          AND room_type_id = @room_type_id
      `);
    }

    if (body.options !== undefined) {
      if (!Array.isArray(body.options) || body.options.length === 0) {
        throw new AppError(
          "At least one rate plan option is required",
          ERROR_CODES.RATE_PLAN_REQUIRED_FIELDS,
          400,
        );
      }

      const primaryOptions = body.options.filter(
        (option) => option.is_primary === true,
      );

      if (primaryOptions.length !== 1) {
        throw new AppError(
          "Exactly one primary option is required",
          ERROR_CODES.INVALID_RATE_PLAN_VALUES,
          400,
        );
      }

      const roomTypeResult = await pool
        .request()
        .input("property_id", sql.UniqueIdentifier, property_id)
        .input("room_type_id", sql.UniqueIdentifier, room_type_id).query(`
          SELECT adults, children, infants
          FROM room_types
          WHERE id = @room_type_id
            AND property_id = @property_id
        `);

      const roomType = roomTypeResult.recordset[0];

      const maxAllowedOccupancy =
        Number(roomType.adults) +
        Number(roomType.children) +
        Number(roomType.infants);

      for (const option of body.options) {
        if (!option.occupancy || option.occupancy <= 0) {
          throw new AppError(
            "Option occupancy must be positive",
            ERROR_CODES.INVALID_RATE_PLAN_VALUES,
            400,
          );
        }

        if (option.occupancy > maxAllowedOccupancy) {
          throw new AppError(
            "Option occupancy exceeds room type capacity",
            ERROR_CODES.INVALID_RATE_PLAN_VALUES,
            400,
          );
        }

        if (option.rate === undefined || option.rate < 0) {
          throw new AppError(
            "Option rate must be zero or greater",
            ERROR_CODES.INVALID_RATE_PLAN_VALUES,
            400,
          );
        }
      }

      await pool
        .request()
        .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id).query(`
          DELETE FROM rate_plan_options
          WHERE rate_plan_id = @rate_plan_id
        `);

      for (const option of body.options) {
        await pool
          .request()
          .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id)
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
    }
  } catch (err) {
    await syncLogService.markFailedLocalSave(
      syncLog.id,
      err,
      channexResult?.response || null,
    );

    throw new AppError(
      "Rate plan was updated externally but local update failed. Recovery is required.",
      ERROR_CODES.RATE_PLAN_LOCAL_SAVE_FAILED,
      500,
    );
  }

  await syncLogService.markSyncSuccess(
    syncLog.id,
    channexResult?.response || null,
  );

  return await getRatePlanByID(
    property_id,
    room_type_id,
    rate_plan_id,
    currentUser,
  );
}

//=========================
//ACTIVATE RATE PLAN
//=========================
async function activateRatePlan(
  property_id,
  room_type_id,
  rate_plan_id,
  currentUser,
) {
  const pool = getPool();

  const existingResult = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id)
    .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id).query(`
      SELECT *
      FROM rate_plans
      WHERE id = @rate_plan_id
        AND property_id = @property_id
        AND room_type_id = @room_type_id
    `);

  const rate_plan = existingResult.recordset[0];

  if (!rate_plan) {
    throw new AppError(
      "Rate plan not found",
      ERROR_CODES.RATE_PLAN_NOT_FOUND,
      404,
    );
  }

  if (!canAccessAll(currentUser.role) && currentUser.id !== rate_plan.user_id) {
    throw new AppError("Access denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  const result = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id)
    .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id).query(`
      UPDATE rate_plans
      SET is_active = 1
      WHERE id = @rate_plan_id
        AND property_id = @property_id
        AND room_type_id = @room_type_id;

      SELECT *
      FROM rate_plans
      WHERE id = @rate_plan_id
        AND property_id = @property_id
        AND room_type_id = @room_type_id;
    `);

  return result.recordset[0];
}

//=========================
//DEACTIVATE RATE PLAN
//=========================
async function deactivateRatePlan(
  property_id,
  room_type_id,
  rate_plan_id,
  currentUser,
) {
  const pool = getPool();

  const existingResult = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id)
    .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id).query(`
      SELECT *
      FROM rate_plans
      WHERE id = @rate_plan_id
        AND property_id = @property_id
        AND room_type_id = @room_type_id
    `);

  const rate_plan = existingResult.recordset[0];

  if (!rate_plan) {
    throw new AppError(
      "Rate plan not found",
      ERROR_CODES.RATE_PLAN_NOT_FOUND,
      404,
    );
  }

  if (!canAccessAll(currentUser.role) && currentUser.id !== rate_plan.user_id) {
    throw new AppError("Access denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  const result = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id)
    .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id).query(`
      UPDATE rate_plans
      SET is_active = 0
      WHERE id = @rate_plan_id
        AND property_id = @property_id
        AND room_type_id = @room_type_id;

      SELECT *
      FROM rate_plans
      WHERE id = @rate_plan_id
        AND property_id = @property_id
        AND room_type_id = @room_type_id;
    `);

  return result.recordset[0];
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
//GET RATE PLAN CONTEXT
//=========================
async function getRatePlanContext(rate_plan_id, currentUser) {
  const pool = getPool();

  const result = await pool
    .request()
    .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id).query(`
      SELECT
        id,
        property_id,
        room_type_id,
        user_id,
        ss.name AS sync_status_name,
        ss.description AS sync_status_description
      FROM rate_plans
      LEFT JOIN sync_statuses ss
        ON rp.sync_status = ss.code
      WHERE id = @rate_plan_id

    `);

  const ratePlan = result.recordset[0];

  if (!ratePlan) {
    throw new AppError(
      "Rate plan not found",
      ERROR_CODES.RATE_PLAN_NOT_FOUND,
      404,
    );
  }

  if (!canAccessAll(currentUser.role) && currentUser.id !== ratePlan.user_id) {
    throw new AppError("Access denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  return ratePlan;
}

//=========================
//GET RATE PLANS DIRECT
//=========================
async function getRatePlansDirect(filters, currentUser) {
  const pool = getPool();

  const request = pool.request();

  let whereClause = buildRatePlanFilters(filters, request, {requirePropertyAndRoomType: false,},currentUser);

  if (!canAccessAll(currentUser.role)) {
    whereClause += `
      AND rp.user_id = @user_id
    `;

    request.input("user_id", sql.UniqueIdentifier, currentUser.id);
  }

  const { page, pageSize, offset } = getPagination(filters);

  request.input("offset", sql.Int, offset);
  request.input("pageSize", sql.Int, pageSize);

  const query = `
    SELECT
      rp.id,
      rp.property_id,
      rp.room_type_id,
      rp.user_id,
      ss.name AS sync_status_name,
      ss.description AS sync_status_description,

      rp.meal_type_code,
      mt.name_en AS meal_type_name_en,
      mt.name_el AS meal_type_name_el,

      p.name AS property_name,
      rt.name AS room_type_name,

      rp.title,
      rp.currency,
      rp.sell_mode,
      rp.rate_mode,
      rp.children_fee,
      rp.infant_fee,

      rp.min_stay_arrival,
      rp.min_stay_through,
      rp.max_stay,

      rp.closed_to_arrival,
      rp.closed_to_departure,
      rp.stop_sell,

      rp.is_active,
      rp.created_at

    FROM rate_plans rp

    LEFT JOIN sync_statuses ss
        ON rp.sync_status = ss.code

    LEFT JOIN meal_types mt
      ON rp.meal_type_code = mt.code

    INNER JOIN properties p
      ON rp.property_id = p.id

    INNER JOIN room_types rt
      ON rp.room_type_id = rt.id

    ${whereClause}

    ORDER BY rp.created_at DESC

    OFFSET @offset ROWS
    FETCH NEXT @pageSize ROWS ONLY
  `;

  const countRequest = pool.request();

  let countWhereClause = buildRatePlanFilters(filters, countRequest, {requirePropertyAndRoomType: false,},currentUser);

  if (!canAccessAll(currentUser.role)) {
    countWhereClause += `
      AND rp.user_id = @user_id
    `;

    countRequest.input("user_id", sql.UniqueIdentifier, currentUser.id);
  }

  const countQuery = `
    SELECT COUNT(*) AS total

    FROM rate_plans rp

    LEFT JOIN meal_types mt
      ON rp.meal_type_code = mt.code

    INNER JOIN properties p
      ON rp.property_id = p.id

    INNER JOIN room_types rt
      ON rp.room_type_id = rt.id

    ${countWhereClause}
  `;

  const totalResult = await countRequest.query(countQuery);

  const total = totalResult.recordset[0].total;

  const result = await request.query(query);

  const ratePlans = result.recordset;

  for (const ratePlan of ratePlans) {
    const optionsResult = await pool
      .request()
      .input("rate_plan_id", sql.UniqueIdentifier, ratePlan.id).query(`
          SELECT
            id,
            rate_plan_id,
            occupancy,
            is_primary,
            rate,
            created_at

          FROM rate_plan_options

          WHERE rate_plan_id = @rate_plan_id

          ORDER BY occupancy ASC
        `);

    ratePlan.options = optionsResult.recordset;
  }

  return {
    rate_plans: ratePlans,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

//=========================
//GET RATE PLAN BY ID DIRECT
//=========================
async function getRatePlanByIDDirect(rate_plan_id, currentUser) {
  const ratePlan = await getRatePlanContext(rate_plan_id, currentUser);

  return await getRatePlanByID(
    ratePlan.property_id,
    ratePlan.room_type_id,
    ratePlan.id,
    currentUser,
  );
}

//=========================
//UPDATE RATE PLAN DIRECT
//=========================
async function updateRatePlanDirect(rate_plan_id, body, currentUser) {
  const ratePlan = await getRatePlanContext(rate_plan_id, currentUser);

  return await updateRatePlan(
    ratePlan.property_id,
    ratePlan.room_type_id,
    ratePlan.id,
    body,
    currentUser,
  );
}

//=========================
//ACTIVATE RATE PLAN DIRECT
//=========================
async function activateRatePlanDirect(rate_plan_id, currentUser) {
  const ratePlan = await getRatePlanContext(rate_plan_id, currentUser);

  return await activateRatePlan(
    ratePlan.property_id,
    ratePlan.room_type_id,
    ratePlan.id,
    currentUser,
  );
}

//=========================
//DEACTIVATE RATE PLAN DIRECT
//=========================
async function deactivateRatePlanDirect(rate_plan_id, currentUser) {
  const ratePlan = await getRatePlanContext(rate_plan_id, currentUser);

  return await deactivateRatePlan(
    ratePlan.property_id,
    ratePlan.room_type_id,
    ratePlan.id,
    currentUser,
  );
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

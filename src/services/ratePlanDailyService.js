const { getPool, sql } = require("../config/db");
const AppError = require("../utils/AppError");
const ERROR_CODES = require("../constants/errorCodes");
const { canAccessAll } = require("../utils/access");
const channexARIService = require("./channex/channexARIService");
const syncLogService = require("./sync/syncLogService");

const {
  getChannexPropertyId,
  getChannexRoomTypeId
} = require("./channex/channexHelpers");

// =======================================
// UPDATE RATE PLAN DAILY
// =======================================
async function updateRatePlanDaily(
  property_id,
  room_type_id,
  rate_plan_id,
  body,
  currentUser,
) {
  const {
    date,
    date_from,
    date_to,
    min_stay_arrival,
    min_stay_through,
    max_stay,
    closed_to_arrival,
    closed_to_departure,
    stop_sell,
    options,
  } = body || {};

  let startDate;
  let endDate;

  if (date) {
    startDate = new Date(date);
    endDate = new Date(date);
  } else {
    if (!date_from || !date_to) {
      throw new AppError(
        "date or date_from/date_to is required",
        ERROR_CODES.INVALID_RATE_PLAN_DAILY_VALUES,
        400,
      );
    }

    startDate = new Date(date_from);
    endDate = new Date(date_to);
  }

  if (isNaN(startDate) || isNaN(endDate)) {
    throw new AppError(
      "Invalid date format",
      ERROR_CODES.INVALID_RATE_PLAN_DAILY_VALUES,
      400,
    );
  }

  if (startDate > endDate) {
    throw new AppError(
      "date_from cannot be after date_to",
      ERROR_CODES.INVALID_RATE_PLAN_DAILY_VALUES,
      400,
    );
  }

  const days = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

  if (days > 730) {
    throw new AppError(
      "Date range cannot exceed 730 days",
      ERROR_CODES.INVALID_RATE_PLAN_DAILY_VALUES,
      400,
    );
  }

  const hasAtLeastOneRestriction =
    min_stay_arrival !== undefined ||
    min_stay_through !== undefined ||
    max_stay !== undefined ||
    closed_to_arrival !== undefined ||
    closed_to_departure !== undefined ||
    stop_sell !== undefined;

  if (
    !hasAtLeastOneRestriction &&
    (!Array.isArray(options) || options.length === 0)
  ) {
    throw new AppError(
      "At least one restriction field is required",
      ERROR_CODES.INVALID_RATE_PLAN_DAILY_VALUES,
      400,
    );
  }

  if (
    (min_stay_arrival !== undefined && min_stay_arrival < 0) ||
    (min_stay_through !== undefined && min_stay_through < 0) ||
    (max_stay !== undefined && max_stay < 0)
  ) {
    throw new AppError(
      "Stay values cannot be negative",
      ERROR_CODES.INVALID_RATE_PLAN_DAILY_VALUES,
      400,
    );
  }

  const pool = getPool();

  const ratePlanResult = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id)
    .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id).query(`
      SELECT
        id,
        property_id,
        room_type_id,
        user_id,
        channex_rate_plan_id
      FROM rate_plans
      WHERE id = @rate_plan_id
        AND property_id = @property_id
        AND room_type_id = @room_type_id
    `);

  const ratePlan = ratePlanResult.recordset[0];

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
  //OPTIONS VALIDATION THAT EXIST IN DEFAULT RATE PLAN
  if (Array.isArray(options) && options.length > 0) {
    const allowedOptionsResult = await pool
      .request()
      .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id).query(`
      SELECT occupancy
      FROM rate_plan_options
      WHERE rate_plan_id = @rate_plan_id
    `);

    const allowedOccupancies = allowedOptionsResult.recordset.map((option) =>
      Number(option.occupancy),
    );

    for (const option of options) {
      if (!allowedOccupancies.includes(Number(option.occupancy))) {
        throw new AppError(
          `Occupancy ${option.occupancy} does not exist in this rate plan`,
          ERROR_CODES.INVALID_RATE_PLAN_DAILY_VALUES,
          400,
        );
      }
    }
  }

  // ======================================
  // CHANNEX UPDATE FIRST
  // ======================================

  if (!ratePlan.channex_rate_plan_id) {
    throw new AppError(
      "Rate plan is not synced",
      ERROR_CODES.RATE_PLAN_NOT_SYNCED,
      409
    );
  }

  const finalDateFrom = startDate.toISOString().slice(0, 10);
  const finalDateTo = endDate.toISOString().slice(0, 10);

  const channexPayload = {
    values: [
      {
        property_id: await getChannexPropertyId(property_id),
        rate_plan_id: ratePlan.channex_rate_plan_id,
        date_from: finalDateFrom,
        date_to: finalDateTo
      }
    ]
  };

  if (min_stay_arrival !== undefined) {
    channexPayload.values[0].min_stay_arrival = min_stay_arrival;
  }

  if (min_stay_through !== undefined) {
    channexPayload.values[0].min_stay_through = min_stay_through;
  }

  if (max_stay !== undefined) {
    channexPayload.values[0].max_stay = max_stay;
  }

  if (closed_to_arrival !== undefined) {
    channexPayload.values[0].closed_to_arrival = closed_to_arrival;
  }

  if (closed_to_departure !== undefined) {
    channexPayload.values[0].closed_to_departure = closed_to_departure;
  }

  if (stop_sell !== undefined) {
    channexPayload.values[0].stop_sell = stop_sell;
  }

  if (Array.isArray(options)) {
    channexPayload.values[0].rates = options.map(option => ({
      occupancy: Number(option.occupancy),
      rate: Number(option.rate)
    }));
  }

  let syncLog;
  let channexResult;

  try {
    syncLog = await syncLogService.createSyncLog({
      entity_type: "rate_plan_daily",
      entity_id: rate_plan_id,
      action: "update",
      request_payload: {
        property_id,
        room_type_id,
        rate_plan_id,
        date: date || null,
        date_from: date ? null : finalDateFrom,
        date_to: date ? null : finalDateTo,
        ...body
      }
    });

    channexResult = await channexARIService.updateRestrictions(
      channexPayload
    );

  } catch (err) {
    if (syncLog) {
      await syncLogService.markFailedChannex(syncLog.id, err);
    }

    throw err;
  }

  let updated = 0;
  let inserted = 0;
  let optionsUpdated = 0;
  let optionsInserted = 0;
  let dailyId;

  try{
    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate.getTime() + i * 86400000);

      const existingResult = await pool
        .request()
        .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id)
        .input("date", sql.Date, currentDate).query(`
          SELECT id
          FROM rate_plan_daily
          WHERE rate_plan_id = @rate_plan_id
            AND date = @date
        `);

      const existing = existingResult.recordset[0];

      if (existing) {
        dailyId = existing.id;
        const request = pool.request();

        request.input("id", sql.UniqueIdentifier, existing.id);

        const updates = [];

        if (min_stay_arrival !== undefined) {
          updates.push("min_stay_arrival = @min_stay_arrival");
          request.input("min_stay_arrival", sql.Int, min_stay_arrival);
        }

        if (min_stay_through !== undefined) {
          updates.push("min_stay_through = @min_stay_through");
          request.input("min_stay_through", sql.Int, min_stay_through);
        }

        if (max_stay !== undefined) {
          updates.push("max_stay = @max_stay");
          request.input("max_stay", sql.Int, max_stay);
        }

        if (closed_to_arrival !== undefined) {
          updates.push("closed_to_arrival = @closed_to_arrival");
          request.input("closed_to_arrival", sql.Bit, Number(closed_to_arrival));
        }

        if (closed_to_departure !== undefined) {
          updates.push("closed_to_departure = @closed_to_departure");
          request.input("closed_to_departure",sql.Bit,Number(closed_to_departure),);
        }

        if (stop_sell !== undefined) {
          updates.push("stop_sell = @stop_sell");
          request.input("stop_sell", sql.Bit, Number(stop_sell));
        }

        updates.push("updated_at = GETDATE()");

        await request.query(`
          UPDATE rate_plan_daily
          SET ${updates.join(", ")}
          WHERE id = @id
        `);

        updated++;
      } else {
        const insertResult = await pool
          .request()
          .input("property_id", sql.UniqueIdentifier, property_id)
          .input("room_type_id", sql.UniqueIdentifier, room_type_id)
          .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id)
          .input("user_id", sql.UniqueIdentifier, ratePlan.user_id)
          .input("date", sql.Date, currentDate)
          .input("min_stay_arrival",sql.Int,min_stay_arrival !== undefined ? min_stay_arrival : null,)
          .input("min_stay_through",sql.Int,min_stay_through !== undefined ? min_stay_through : null,)
          .input("max_stay", sql.Int, max_stay !== undefined ? max_stay : null)
          .input("closed_to_arrival",sql.Bit,closed_to_arrival !== undefined ? Number(closed_to_arrival) : null,)
          .input("closed_to_departure",sql.Bit,closed_to_departure !== undefined? Number(closed_to_departure): null,)
          .input("stop_sell",sql.Bit,stop_sell !== undefined ? Number(stop_sell) : null,)
          .query(`
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
              OUTPUT inserted.id
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
              )
          `);

        dailyId = insertResult.recordset[0].id;

        inserted++;
      }
      if (Array.isArray(options)) {
        for (const option of options) {
          if (!option.occupancy || option.occupancy <= 0) {
            throw new AppError(
              "Option occupancy must be positive",
              ERROR_CODES.INVALID_RATE_PLAN_DAILY_VALUES,
              400,
            );
          }

          if (option.rate === undefined || option.rate < 0) {
            throw new AppError(
              "Option rate must be zero or greater",
              ERROR_CODES.INVALID_RATE_PLAN_DAILY_VALUES,
              400,
            );
          }

          const optionResult = await pool
            .request()
            .input("rate_plan_daily_id", sql.UniqueIdentifier, dailyId)
            .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id)
            .input("occupancy", sql.Int, option.occupancy)
            .input("rate", sql.Decimal(10, 2), option.rate).query(`
          IF EXISTS (
            SELECT 1
            FROM rate_plan_daily_options
            WHERE rate_plan_daily_id = @rate_plan_daily_id
              AND occupancy = @occupancy
          )
          BEGIN
            UPDATE rate_plan_daily_options
            SET
              rate = @rate,
              updated_at = GETDATE()
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

          if (optionResult.recordset[0].action === "updated") {
            optionsUpdated++;
          } else {
            optionsInserted++;
          }
        }
      }
    }
  } catch (err) {
    await syncLogService.markFailedLocalSave(
      syncLog.id,
      err,
      channexResult || null
    );

    throw new AppError(
      "Rate plan daily values were updated externally but local save failed. Recovery is required.",
      ERROR_CODES.RATE_PLAN_DAILY_LOCAL_SAVE_FAILED,
      500
    );
  }

  await syncLogService.markSyncSuccess(
    syncLog.id,
    channexResult || null
  );
  return {
    rate_plan_id,
    date_from: startDate.toISOString().slice(0, 10),
    date_to: endDate.toISOString().slice(0, 10),
    days,
    restrictions_updated: updated,
    restrictions_inserted: inserted,
    options_updated: optionsUpdated,
    options_inserted: optionsInserted,
  };
}

// ======================================
// GET RATE PLAN DAILY
// ======================================
async function getRatePlanDaily(
  property_id,
  room_type_id,
  rate_plan_id,
  filters,
  currentUser,
) {
  const { date_from, date_to } = filters;

  if (!date_from || !date_to) {
    throw new AppError(
      "date_from and date_to are required",
      ERROR_CODES.INVALID_RATE_PLAN_DAILY_VALUES,
      400,
    );
  }

  const startDate = new Date(date_from);
  const endDate = new Date(date_to);

  if (isNaN(startDate) || isNaN(endDate)) {
    throw new AppError(
      "Invalid date format",
      ERROR_CODES.INVALID_RATE_PLAN_DAILY_VALUES,
      400,
    );
  }

  if (startDate > endDate) {
    throw new AppError(
      "date_from cannot be after date_to",
      ERROR_CODES.INVALID_RATE_PLAN_DAILY_VALUES,
      400,
    );
  }

  const pool = getPool();

  const ratePlanResult = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id)
    .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id).query(`
      SELECT
        id,
        property_id,
        room_type_id,
        user_id,
        title,
        min_stay_arrival,
        min_stay_through,
        max_stay,
        closed_to_arrival,
        closed_to_departure,
        stop_sell
      FROM rate_plans
      WHERE id = @rate_plan_id
        AND property_id = @property_id
        AND room_type_id = @room_type_id
    `);

  const ratePlan = ratePlanResult.recordset[0];

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

  const defaultOptionsResult = await pool
    .request()
    .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id).query(`
      SELECT
        occupancy,
        is_primary,
        rate
      FROM rate_plan_options
      WHERE rate_plan_id = @rate_plan_id
      ORDER BY occupancy ASC
    `);

  const overridesResult = await pool
    .request()
    .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id)
    .input("date_from", sql.Date, startDate)
    .input("date_to", sql.Date, endDate).query(`
      SELECT
        id,
        date,
        min_stay_arrival,
        min_stay_through,
        max_stay,
        closed_to_arrival,
        closed_to_departure,
        stop_sell,
        created_at,
        updated_at
      FROM rate_plan_daily
      WHERE rate_plan_id = @rate_plan_id
        AND date >= @date_from
        AND date <= @date_to
      ORDER BY date ASC
    `);

  const dailyOptionsResult = await pool
    .request()
    .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id)
    .input("date_from", sql.Date, startDate)
    .input("date_to", sql.Date, endDate).query(`
      SELECT
        rpd.date,
        rpdo.occupancy,
        rpdo.rate
      FROM rate_plan_daily_options rpdo
      INNER JOIN rate_plan_daily rpd
        ON rpdo.rate_plan_daily_id = rpd.id
      WHERE rpdo.rate_plan_id = @rate_plan_id
        AND rpd.date >= @date_from
        AND rpd.date <= @date_to
      ORDER BY rpd.date ASC, rpdo.occupancy ASC
    `);

  const overridesMap = {};

  for (const row of overridesResult.recordset) {
    const key = row.date.toISOString().slice(0, 10);
    overridesMap[key] = row;
  }

  const dailyOptionsMap = {};

  for (const row of dailyOptionsResult.recordset) {
    const key = row.date.toISOString().slice(0, 10);

    if (!dailyOptionsMap[key]) {
      dailyOptionsMap[key] = {};
    }

    dailyOptionsMap[key][row.occupancy] = row.rate;
  }

  function parseDefault(value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed[0] : parsed;
    } catch {
      return value;
    }
  }

  const defaultRestrictions = {
    min_stay_arrival: parseDefault(ratePlan.min_stay_arrival),
    min_stay_through: parseDefault(ratePlan.min_stay_through),
    max_stay: parseDefault(ratePlan.max_stay),
    closed_to_arrival: parseDefault(ratePlan.closed_to_arrival),
    closed_to_departure: parseDefault(ratePlan.closed_to_departure),
    stop_sell: parseDefault(ratePlan.stop_sell),
  };

  const days = [];

  const totalDays =
    Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

  for (let i = 0; i < totalDays; i++) {
    const currentDate = new Date(startDate.getTime() + i * 86400000);
    const dateKey = currentDate.toISOString().slice(0, 10);

    const override = overridesMap[dateKey];
    const optionOverrides = dailyOptionsMap[dateKey] || {};

    const options = defaultOptionsResult.recordset.map((option) => ({
      occupancy: option.occupancy,
      is_primary: option.is_primary,
      rate: optionOverrides[option.occupancy] ?? option.rate,
      is_override: optionOverrides[option.occupancy] !== undefined,
    }));

    days.push({
      date: dateKey,
      restrictions: {
        min_stay_arrival:
          override?.min_stay_arrival ?? defaultRestrictions.min_stay_arrival,

        min_stay_through:
          override?.min_stay_through ?? defaultRestrictions.min_stay_through,

        max_stay: override?.max_stay ?? defaultRestrictions.max_stay,

        closed_to_arrival:
          override?.closed_to_arrival ?? defaultRestrictions.closed_to_arrival,

        closed_to_departure:
          override?.closed_to_departure ??
          defaultRestrictions.closed_to_departure,

        stop_sell: override?.stop_sell ?? defaultRestrictions.stop_sell,

        is_override: !!override,
      },
      options,
    });
  }

  return {
    rate_plan: {
      id: ratePlan.id,
      title: ratePlan.title,
      defaults: {
        restrictions: defaultRestrictions,
        options: defaultOptionsResult.recordset,
      },
    },
    date_from,
    date_to,
    days,
  };
}

//==================================================================================
// RATE PLAN DAILY DIRECT
//==================================================================================
async function getRatePlanDailyContext(rate_plan_id, currentUser) {
  const pool = getPool();

  const result = await pool
    .request()
    .input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id).query(`
      SELECT
        id,
        property_id,
        room_type_id,
        user_id
      FROM rate_plans
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

//========================================
//UPDATE RATE PLAN DAILY DIRECT
//========================================
async function getRatePlanDailyDirect(rate_plan_id, filters, currentUser) {
  const ratePlan = await getRatePlanDailyContext(rate_plan_id, currentUser);

  return await getRatePlanDaily(
    ratePlan.property_id,
    ratePlan.room_type_id,
    ratePlan.id,
    filters,
    currentUser,
  );
}

//========================================
//GET RATE PLAN DAILY DIRECT
//========================================
async function updateRatePlanDailyDirect(rate_plan_id, body, currentUser) {
  const ratePlan = await getRatePlanDailyContext(rate_plan_id, currentUser);

  return await updateRatePlanDaily(
    ratePlan.property_id,
    ratePlan.room_type_id,
    ratePlan.id,
    body,
    currentUser,
  );
}

module.exports = {
  updateRatePlanDaily,
  getRatePlanDaily,
  updateRatePlanDailyDirect,
  getRatePlanDailyDirect,
};

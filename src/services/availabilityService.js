const { getPool, sql } = require("../config/db");
const AppError = require("../utils/AppError");
const ERROR_CODES = require("../constants/errorCodes");
const { canAccessAll } = require("../utils/access");
const channexAvailabilityService = require("./channex/channexAvailabilityService");
const syncLogService = require("./sync/syncLogService");
const roomTypeService = require("./roomTypeService");

const {
  getChannexPropertyId,
  getChannexRoomTypeId
} = require("./channex/channexHelpers");


// ======================================
// INITIALIZE ROOM TYPE AVAILABILITY
// ======================================
async function initializeRoomTypeAvailability(
  property_id,
  room_type_id,
  body,
  currentUser
) {
  const { date_from, date_to } = body || {};

  if (!date_from || !date_to) {
    throw new AppError(
      "date_from and date_to are required",
      ERROR_CODES.INVALID_AVAILABILITY_VALUES,
      400
    );
  }

  const roomType = await roomTypeService.getRoomTypeByID(
    property_id,
    room_type_id,
    currentUser
  );

  return updateRoomTypeAvailability(
    property_id,
    room_type_id,
    {
      date_from,
      date_to,
      availability: roomType.room_count
    },
    currentUser
  );
}

// ======================================
// GET AVAILABILITY CALENDAR
// ======================================
async function getAvailabilityCalendar(property_id, filters, currentUser) {
  const { date_from, date_to, room_type_ids } = filters;

  if (!date_from || !date_to) {
    throw new AppError(
      "date_from and date_to are required",
      ERROR_CODES.INVALID_AVAILABILITY_VALUES,
      400,
    );
  }

  const startDate = new Date(date_from);
  const endDate = new Date(date_to);

  if (isNaN(startDate) || isNaN(endDate)) {
    throw new AppError(
      "Invalid date format",
      ERROR_CODES.INVALID_AVAILABILITY_VALUES,
      400,
    );
  }

  if (startDate > endDate) {
    throw new AppError(
      "date_from cannot be after date_to",
      ERROR_CODES.INVALID_AVAILABILITY_VALUES,
      400,
    );
  }

  const days = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

  if (days > 730) {
    throw new AppError(
      "Date range cannot exceed 730 days",
      ERROR_CODES.INVALID_AVAILABILITY_VALUES,
      400,
    );
  }

  const pool = getPool();

  const propertyResult = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id).query(`
      SELECT id, user_id
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

  const request = pool.request();

  request.input("property_id", sql.UniqueIdentifier, property_id);
  request.input("date_from", sql.Date, startDate);
  request.input("date_to", sql.Date, endDate);

  let roomTypeFilter = "";

  if (room_type_ids) {
    const ids = room_type_ids
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (ids.length > 0) {
      const placeholders = [];

      ids.forEach((id, index) => {
        const paramName = `room_type_id_${index}`;

        placeholders.push(`@${paramName}`);

        request.input(paramName, sql.UniqueIdentifier, id);
      });

      roomTypeFilter = `
        AND rt.id IN (${placeholders.join(", ")})
      `;
    }
  }

  const result = await request.query(`
    SELECT
      rt.id AS room_type_id,
      rt.name,
      rt.room_count,
      rta.date,
      rta.availability
    FROM room_types rt
    LEFT JOIN room_type_availability rta
      ON rt.id = rta.room_type_id
      AND rta.date >= @date_from
      AND rta.date <= @date_to
    WHERE rt.property_id = @property_id
      ${roomTypeFilter}
    ORDER BY rt.name ASC, rta.date ASC
  `);

  const roomTypesMap = {};

  for (const row of result.recordset) {
    const roomTypeId = row.room_type_id;

    if (!roomTypesMap[roomTypeId]) {
      roomTypesMap[roomTypeId] = {
        room_type_id: roomTypeId,
        name: row.name,
        room_count: row.room_count,
        availability: [],
      };
    }

    if (row.date) {
      roomTypesMap[roomTypeId].availability.push({
        date: row.date,
        availability: row.availability,
      });
    }
  }

  return {
    property_id,
    date_from,
    date_to,
    room_types: Object.values(roomTypesMap),
  };
}

// ======================================
// UPDATE ROOM TYPE AVAILABILITY
// ======================================
async function updateRoomTypeAvailability(
  property_id,
  room_type_id,
  body,
  currentUser,
) {
  const { date, date_from, date_to, availability } = body || {};

  if (availability === undefined) {
    throw new AppError(
      "availability is required",
      ERROR_CODES.INVALID_AVAILABILITY_VALUES,
      400,
    );
  }

  if (availability < 0) {
    throw new AppError(
      "Availability cannot be negative",
      ERROR_CODES.INVALID_AVAILABILITY_VALUES,
      400,
    );
  }

  let startDate;
  let endDate;

  if (date) {
    startDate = new Date(date);
    endDate = new Date(date);
  } else {
    if (!date_from || !date_to) {
      throw new AppError(
        "date or date_from/date_to is required",
        ERROR_CODES.INVALID_AVAILABILITY_VALUES,
        400,
      );
    }

    startDate = new Date(date_from);
    endDate = new Date(date_to);
  }

  if (isNaN(startDate) || isNaN(endDate)) {
    throw new AppError(
      "Invalid date format",
      ERROR_CODES.INVALID_AVAILABILITY_VALUES,
      400,
    );
  }

  if (startDate > endDate) {
    throw new AppError(
      "date_from cannot be after date_to",
      ERROR_CODES.INVALID_AVAILABILITY_VALUES,
      400,
    );
  }

  const days = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

  if (days > 730) {
    throw new AppError(
      "Date range cannot exceed 730 days",
      ERROR_CODES.INVALID_AVAILABILITY_VALUES,
      400,
    );
  }

  const pool = getPool();

  const roomTypeResult = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id).query(`
      SELECT
        id,
        property_id,
        user_id,
        room_count
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
    throw new AppError
    ("Access denied",
    ERROR_CODES.USER_UNAUTHORIZED,
    403);
  }

  if (availability > roomType.room_count) {
    throw new AppError(
      "Availability cannot exceed room count",
      ERROR_CODES.INVALID_AVAILABILITY_VALUES,
      400,
    );
  }
  const finalDateFrom = startDate.toISOString().slice(0, 10);
  const finalDateTo = endDate.toISOString().slice(0, 10);

  const channexPropertyId = await getChannexPropertyId(property_id);
  const channexRoomTypeId = await getChannexRoomTypeId(room_type_id);

  const channexPayload = {
    values: [
      date
        ? {
            property_id: channexPropertyId,
            room_type_id: channexRoomTypeId,
            date: finalDateFrom,
            availability
          }
        : {
            property_id: channexPropertyId,
            room_type_id: channexRoomTypeId,
            date_from: finalDateFrom,
            date_to: finalDateTo,
            availability
          }
    ]
  };

  let syncLog;
  let channexResult;

  try {
    syncLog = await syncLogService.createSyncLog({
      entity_type: "room_type_availability",
      entity_id: room_type_id,
      action: "update",
      request_payload: {
        property_id,
        room_type_id,
        date: date || null,
        date_from: date ? null : finalDateFrom,
        date_to: date ? null : finalDateTo,
        availability
      }
    });

    channexResult =
      await channexAvailabilityService.updateRoomTypeAvailability(
        channexPayload
      );

  } catch (err) {
    if (syncLog) {
      await syncLogService.markFailedChannex(syncLog.id, err);
    }

    throw err;
  }
  

  // ===============================
  // LOCAL INSERT
  // ===============================
  let updated = 0;
  let inserted = 0;
  try{


    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate.getTime() + i * 86400000);

      const result = await pool
        .request()
        .input("property_id", sql.UniqueIdentifier, property_id)
        .input("room_type_id", sql.UniqueIdentifier, room_type_id)
        .input("user_id", sql.UniqueIdentifier, roomType.user_id)
        .input("date", sql.Date, currentDate)
        .input("availability", sql.Int, availability).query(`
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
              availability
            )
            VALUES (
              @property_id,
              @room_type_id,
              @user_id,
              @date,
              @availability
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
  } catch (err) {
    await syncLogService.markFailedLocalSave(
      syncLog.id,
      err,
      channexResult || null
    );

    throw new AppError(
      "Availability was updated externally but local save failed. Recovery is required.",
      ERROR_CODES.AVAILABILITY_LOCAL_SAVE_FAILED,
      500
    );
  }

  await syncLogService.markSyncSuccess(
    syncLog.id,
    channexResult || null
  );
  return {
    room_type_id,
    date_from: startDate.toISOString().slice(0, 10),
    date_to: endDate.toISOString().slice(0, 10),
    availability,
    days,
    updated,
    inserted,
  };
}

// ======================================
// GET AVAILABILITY CALENDAR
// ======================================
async function getRoomTypeCalendar(
  property_id,
  room_type_id,
  filters,
  currentUser,
) {
  const { date_from, date_to } = filters;

  if (!date_from || !date_to) {
    throw new AppError(
      "date_from and date_to are required",
      ERROR_CODES.INVALID_AVAILABILITY_VALUES,
      400,
    );
  }

  const startDate = new Date(date_from);
  const endDate = new Date(date_to);

  if (isNaN(startDate) || isNaN(endDate)) {
    throw new AppError(
      "Invalid date format",
      ERROR_CODES.INVALID_AVAILABILITY_VALUES,
      400,
    );
  }

  if (startDate > endDate) {
    throw new AppError(
      "date_from cannot be after date_to",
      ERROR_CODES.INVALID_AVAILABILITY_VALUES,
      400,
    );
  }

  const pool = getPool();

  const roomTypeResult = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id).query(`
      SELECT
        id,
        property_id,
        user_id,
        name,
        room_count,
        adults,
        children,
        infants,
        default_occupancy,
        is_active
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

  const availabilityResult = await pool
    .request()
    .input("room_type_id", sql.UniqueIdentifier, room_type_id)
    .input("date_from", sql.Date, startDate)
    .input("date_to", sql.Date, endDate).query(`
      SELECT
        date,
        availability
      FROM room_type_availability
      WHERE room_type_id = @room_type_id
        AND date >= @date_from
        AND date <= @date_to
      ORDER BY date ASC
    `);

  const ratePlansResult = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("room_type_id", sql.UniqueIdentifier, room_type_id).query(`
      SELECT
        rp.id,
        rp.title,
        rp.currency,
        rp.sell_mode,
        rp.rate_mode,
        rp.meal_type_code,
        mt.name_el AS meal_type_name_el,
        rp.children_fee,
        rp.infant_fee,
        rp.min_stay_arrival,
        rp.min_stay_through,
        rp.max_stay,
        rp.closed_to_arrival,
        rp.closed_to_departure,
        rp.stop_sell,
        rp.is_active
      FROM rate_plans rp
      LEFT JOIN meal_types mt
        ON rp.meal_type_code = mt.code
      WHERE rp.property_id = @property_id
        AND rp.room_type_id = @room_type_id
      ORDER BY rp.created_at DESC
    `);

  const ratePlans = ratePlansResult.recordset;

  for (const ratePlan of ratePlans) {
    const optionsResult = await pool
      .request()
      .input("rate_plan_id", sql.UniqueIdentifier, ratePlan.id).query(`
        SELECT
          occupancy,
          is_primary,
          rate
        FROM rate_plan_options
        WHERE rate_plan_id = @rate_plan_id
        ORDER BY occupancy ASC
      `);

    ratePlan.options = optionsResult.recordset;
  }

  return {
    room_type: roomType,
    date_from,
    date_to,
    availability: availabilityResult.recordset,
    rate_plans: ratePlans,
  };
}

// ======================================
// CHECK AVAILABILITY
// ======================================
async function checkAvailabilityDiagnostics(filters, currentUser) {
  const { property_id, date_from, date_to, room_type_id } = filters;

  if (!property_id || !date_from || !date_to) {
    throw new AppError(
      "property_id, date_from and date_to are required",
      ERROR_CODES.INVALID_AVAILABILITY_VALUES,
      400,
    );
  }

  const startDate = new Date(date_from);
  const endDate = new Date(date_to);

  if (isNaN(startDate) || isNaN(endDate)) {
    throw new AppError(
      "Invalid date format",
      ERROR_CODES.INVALID_AVAILABILITY_VALUES,
      400,
    );
  }

  if (startDate > endDate) {
    throw new AppError(
      "date_from cannot be after date_to",
      ERROR_CODES.INVALID_AVAILABILITY_VALUES,
      400,
    );
  }

  const pool = getPool();

  const propertyResult = await pool
    .request()
    .input("property_id", sql.UniqueIdentifier, property_id).query(`
      SELECT id, user_id, name
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

  const request = pool.request();

  request.input("property_id", sql.UniqueIdentifier, property_id);
  request.input("date_from", sql.Date, startDate);
  request.input("date_to", sql.Date, endDate);

  let roomTypeFilter = "";

  if (room_type_id) {
    roomTypeFilter = ` AND rt.id = @room_type_id`;
    request.input("room_type_id", sql.UniqueIdentifier, room_type_id);
  }

  const result = await request.query(`
    SELECT
      rt.id AS room_type_id,
      rt.name AS room_type_name,
      rta.date,
      rt.room_count,
      rta.availability,
      rta.manual_override,

      ISNULL(booked.booked_rooms, 0) AS booked_rooms,

      CASE
        WHEN rta.availability < 0
          THEN 'AVAILABILITY_NEGATIVE'

        WHEN rta.availability > rt.room_count
          THEN 'AVAILABILITY_EXCEEDS_ROOM_COUNT'

        WHEN rta.availability = 0
          AND ISNULL(booked.booked_rooms, 0) = 0
          AND rta.manual_override = 0
          THEN 'ZERO_AVAILABILITY_WITHOUT_BOOKINGS_OR_MANUAL_OVERRIDE'

        WHEN rta.manual_override = 1
          THEN 'MANUAL_AVAILABILITY_OVERRIDE'

        ELSE NULL
      END AS issue_type,

      CASE
        WHEN rta.availability < 0
          THEN 'error'

        WHEN rta.availability > rt.room_count
          THEN 'error'

        WHEN rta.availability = 0
          AND ISNULL(booked.booked_rooms, 0) = 0
          AND rta.manual_override = 0
          THEN 'warning'

        WHEN rta.manual_override = 1
          THEN 'info'

        ELSE NULL
      END AS severity

    FROM room_type_availability rta
    INNER JOIN room_types rt
      ON rta.room_type_id = rt.id

    OUTER APPLY (
      SELECT SUM(rr.rooms_count) AS booked_rooms
      FROM reservation_rooms rr
      INNER JOIN reservations r
        ON rr.reservation_id = r.id
      WHERE rr.room_type_id = rt.id
        AND r.status IN (1, 2)
        AND r.check_in <= rta.date
        AND r.check_out > rta.date
    ) booked

    WHERE rt.property_id = @property_id
      AND rta.date >= @date_from
      AND rta.date <= @date_to
      ${roomTypeFilter}
    ORDER BY
      CASE
        WHEN rta.availability < 0 THEN 1
        WHEN rta.availability > rt.room_count THEN 2
        WHEN rta.availability = 0
          AND ISNULL(booked.booked_rooms, 0) = 0
          AND rta.manual_override = 0 THEN 3
        WHEN rta.manual_override = 1 THEN 4
        ELSE 5
      END,
      rta.date ASC,
      rt.name ASC
  `);

  return {
    property: {
      id: property.id,
      name: property.name,
    },
    date_from,
    date_to,
    room_type_id: room_type_id || null,
    has_issues: result.recordset.length > 0,
    diagnostics: result.recordset,
  };
}

module.exports = {
  initializeRoomTypeAvailability,
  getAvailabilityCalendar,
  updateRoomTypeAvailability,
  getRoomTypeCalendar,
  checkAvailabilityDiagnostics,
};

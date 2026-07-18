const { getPool, sql } = require("../config/db");
const AppError = require("../utils/AppError");
const ERROR_CODES = require("../constants/errorCodes");
const { canAccessAll } = require("../utils/access");
const buildReservationFilters = require("../utils/buildReservationsFilters");
const getPagination = require("../utils/pagination");
const RESERVATION_SOURCES = require("../constants/reservationSources");
const channexBookingService = require("./channex/channexBookingService");

//===================================================
// CREATE RESERVATION
//===================================================
async function createReservation(body, currentUser) {
  const {
    property_id,
    source = RESERVATION_SOURCES.MANUAL,

    channex_reservation_id = null,
    channex_revision_id = null,
    ota_reservation_code = null,
    ota_name = null,
    channel_id = null,

    guest_type = 1,
    guest_name,
    guest_email = null,
    guest_phone = null,

    guest_vat_number = null,
    guest_company_name = null,
    guest_company_activity = null,
    guest_address = null,
    guest_city = null,
    guest_postal_code = null,
    guest_country = null,
    guest_tax_office = null,

    check_in,
    check_out,
    total_price = null,
    notes = null,
    rooms
  } = body || {};

  if (!property_id || !check_in || !check_out) {
    throw new AppError("property_id, check_in and check_out are required", ERROR_CODES.RESERVATION_REQUIRED_FIELDS, 400);
  }

  if (!Array.isArray(rooms) || rooms.length === 0) {
    throw new AppError("At least one room is required", ERROR_CODES.RESERVATION_REQUIRED_FIELDS, 400);
  }

  if (![1, 2].includes(Number(guest_type))) {
    throw new AppError("Invalid guest_type", ERROR_CODES.INVALID_RESERVATION_VALUES, 400);
  }

  if (Number(guest_type) === 1 && !guest_name) {
    throw new AppError("guest_name is required for individual guest", ERROR_CODES.RESERVATION_REQUIRED_FIELDS, 400);
  }

  if (Number(guest_type) === 2 && (!guest_company_name || !guest_vat_number)) {
    throw new AppError("guest_company_name and guest_vat_number are required for company guest", ERROR_CODES.RESERVATION_REQUIRED_FIELDS, 400);
  }

  const checkInDate = new Date(check_in);
  const checkOutDate = new Date(check_out);

  if (isNaN(checkInDate) || isNaN(checkOutDate)) {
    throw new AppError("Invalid date format", ERROR_CODES.INVALID_RESERVATION_VALUES, 400);
  }

  if (checkOutDate <= checkInDate) {
    throw new AppError("check_out must be after check_in", ERROR_CODES.INVALID_RESERVATION_VALUES, 400);
  }

  const pool = getPool();

  if (channex_reservation_id) {
    const duplicateResult = await pool.request()
      .input("channex_reservation_id", sql.NVarChar, channex_reservation_id)
      .query(`
        SELECT id
        FROM reservations
        WHERE channex_reservation_id = @channex_reservation_id
      `);

    if (duplicateResult.recordset.length > 0) {
      return await getReservationByID(
        duplicateResult.recordset[0].id,
        currentUser
      );
    }
  }

  const propertyResult = await pool.request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .query(`
      SELECT id, user_id
      FROM properties
      WHERE id = @property_id
    `);

  const property = propertyResult.recordset[0];

  if (!property) {
    throw new AppError("Property not found", ERROR_CODES.PROPERTY_NOT_FOUND, 404);
  }

  if (!canAccessAll(currentUser.role) && currentUser.id !== property.user_id) {
    throw new AppError("Access denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  for (const room of rooms) {
    if (!room.room_type_id || !room.rooms_count || room.adults === undefined) {
      throw new AppError("room_type_id, rooms_count and adults are required for each room", ERROR_CODES.RESERVATION_REQUIRED_FIELDS, 400);
    }

    if (room.rooms_count <= 0) {
      throw new AppError("rooms_count must be positive", ERROR_CODES.INVALID_RESERVATION_VALUES, 400);
    }

    const roomTypeResult = await pool.request()
      .input("property_id", sql.UniqueIdentifier, property_id)
      .input("room_type_id", sql.UniqueIdentifier, room.room_type_id)
      .query(`
        SELECT id, property_id, user_id, room_count, adults, children, infants
        FROM room_types
        WHERE id = @room_type_id
          AND property_id = @property_id
          AND is_active = 1
      `);

    const roomType = roomTypeResult.recordset[0];

    if (!roomType) {
      throw new AppError("Room type not found", ERROR_CODES.ROOM_TYPE_NOT_FOUND, 404);
    }

    if (room.rate_plan_id) {
      const ratePlanResult = await pool.request()
        .input("property_id", sql.UniqueIdentifier, property_id)
        .input("room_type_id", sql.UniqueIdentifier, room.room_type_id)
        .input("rate_plan_id", sql.UniqueIdentifier, room.rate_plan_id)
        .query(`
          SELECT id
          FROM rate_plans
          WHERE id = @rate_plan_id
            AND property_id = @property_id
            AND room_type_id = @room_type_id
            AND is_active = 1
        `);

      if (ratePlanResult.recordset.length === 0) {
        throw new AppError("Rate plan not found", ERROR_CODES.RATE_PLAN_NOT_FOUND, 404);
      }
    }

    const totalGuests =
      Number(room.adults || 0) +
      Number(room.children || 0) +
      Number(room.infants || 0);

    const maxGuests =
      Number(roomType.adults || 0) +
      Number(roomType.children || 0) +
      Number(roomType.infants || 0);

    if (totalGuests > maxGuests) {
      throw new AppError("Guests exceed room type capacity", ERROR_CODES.INVALID_RESERVATION_VALUES, 400);
    }

    const availabilityResult = await pool.request()
      .input("room_type_id", sql.UniqueIdentifier, room.room_type_id)
      .input("check_in", sql.Date, checkInDate)
      .input("check_out", sql.Date, checkOutDate)
      .input("rooms_count", sql.Int, room.rooms_count)
      .query(`
        SELECT date, availability
        FROM room_type_availability
        WHERE room_type_id = @room_type_id
          AND date >= @check_in
          AND date < @check_out
          AND availability < @rooms_count
        ORDER BY date ASC
      `);

    if (availabilityResult.recordset.length > 0) {
      throw new AppError("Insufficient availability", ERROR_CODES.INSUFFICIENT_AVAILABILITY, 400);
    }
  }

  const reservationResult = await pool.request()
    .input("property_id", sql.UniqueIdentifier, property_id)
    .input("user_id", sql.UniqueIdentifier, property.user_id)
    .input("source", sql.TinyInt, source)
    .input("guest_type", sql.TinyInt, Number(guest_type))
    .input("guest_name", sql.NVarChar, guest_name || null)
    .input("guest_email", sql.NVarChar, guest_email)
    .input("guest_phone", sql.NVarChar, guest_phone)
    .input("guest_vat_number", sql.NVarChar, guest_vat_number)
    .input("guest_company_name", sql.NVarChar, guest_company_name)
    .input("guest_company_activity", sql.NVarChar, guest_company_activity)
    .input("guest_address", sql.NVarChar, guest_address)
    .input("guest_city", sql.NVarChar, guest_city)
    .input("guest_postal_code", sql.NVarChar, guest_postal_code)
    .input("guest_country", sql.NVarChar, guest_country)
    .input("guest_tax_office", sql.NVarChar, guest_tax_office)
    .input("check_in", sql.Date, checkInDate)
    .input("check_out", sql.Date, checkOutDate)
    .input("total_price", sql.Decimal(10, 2), total_price)
    .input("notes", sql.NVarChar, notes)
    .input("channex_reservation_id", sql.NVarChar, channex_reservation_id)
    .input("channex_revision_id", sql.NVarChar, channex_revision_id)
    .input("ota_reservation_code", sql.NVarChar, ota_reservation_code)
    .input("ota_name", sql.NVarChar, ota_name)
    .input("channel_id", sql.NVarChar, channel_id)
    .query(`
      INSERT INTO reservations (
        property_id,
        user_id,
        source,
        guest_type,
        guest_name,
        guest_email,
        guest_phone,
        guest_vat_number,
        guest_company_name,
        guest_company_activity,
        guest_address,
        guest_city,
        guest_postal_code,
        guest_country,
        guest_tax_office,
        check_in,
        check_out,
        total_price,
        notes,
        channex_reservation_id,
        channex_revision_id,
        ota_reservation_code,
        ota_name,
        channel_id
      )
      OUTPUT inserted.*
      VALUES (
        @property_id,
        @user_id,
        @source,
        @guest_type,
        @guest_name,
        @guest_email,
        @guest_phone,
        @guest_vat_number,
        @guest_company_name,
        @guest_company_activity,
        @guest_address,
        @guest_city,
        @guest_postal_code,
        @guest_country,
        @guest_tax_office,
        @check_in,
        @check_out,
        @total_price,
        @notes,
        @channex_reservation_id,
        @channex_revision_id,
        @ota_reservation_code,
        @ota_name,
        @channel_id
      )
    `);

  const reservation = reservationResult.recordset[0];

  const guest = await findOrCreateGuest(pool, property.user_id, {
    guest_type: Number(guest_type),
    guest_name,
    guest_email,
    guest_phone,
    guest_vat_number,
    guest_company_name,
    guest_company_activity,
    guest_address,
    guest_city,
    guest_postal_code,
    guest_country,
    guest_tax_office
  });

  await pool.request()
    .input("reservation_id", sql.UniqueIdentifier, reservation.id)
    .input("guest_id", sql.UniqueIdentifier, guest.id)
    .input("is_primary", sql.Bit, 1)
    .input("role", sql.NVarChar, "booker")
    .query(`
      INSERT INTO reservation_guests (
        reservation_id,
        guest_id,
        is_primary,
        role
      )
      VALUES (
        @reservation_id,
        @guest_id,
        @is_primary,
        @role
      )
    `);

  await pool.request()
    .input("guest_id", sql.UniqueIdentifier, guest.id)
    .query(`
      UPDATE guests
      SET
        reservations_count = reservations_count + 1,
        last_reservation_at = GETDATE(),
        updated_at = GETDATE()
      WHERE id = @guest_id
    `);

  for (const room of rooms) {
    await pool.request()
      .input("reservation_id", sql.UniqueIdentifier, reservation.id)
      .input("property_id", sql.UniqueIdentifier, property_id)
      .input("room_type_id", sql.UniqueIdentifier, room.room_type_id)
      .input("rate_plan_id", sql.UniqueIdentifier, room.rate_plan_id || null)
      .input("rooms_count", sql.Int, room.rooms_count)
      .input("adults", sql.Int, room.adults || 0)
      .input("children", sql.Int, room.children || 0)
      .input("infants", sql.Int, room.infants || 0)
      .input("price", sql.Decimal(10, 2), room.price || null)
      .query(`
        INSERT INTO reservation_rooms (
          reservation_id,
          property_id,
          room_type_id,
          rate_plan_id,
          rooms_count,
          adults,
          children,
          infants,
          price
        )
        VALUES (
          @reservation_id,
          @property_id,
          @room_type_id,
          @rate_plan_id,
          @rooms_count,
          @adults,
          @children,
          @infants,
          @price
        )
      `);

    await pool.request()
      .input("room_type_id", sql.UniqueIdentifier, room.room_type_id)
      .input("check_in", sql.Date, checkInDate)
      .input("check_out", sql.Date, checkOutDate)
      .input("rooms_count", sql.Int, room.rooms_count)
      .query(`
        UPDATE room_type_availability
        SET
          availability = availability - @rooms_count,
          updated_at = GETDATE()
        WHERE room_type_id = @room_type_id
          AND date >= @check_in
          AND date < @check_out
      `);
  }

  return await getReservationByID(reservation.id, currentUser);
}

//===================================================
// GET RESERVATIONS
//===================================================
async function getReservations(filters, currentUser) {
  const pool = getPool();

  const request = pool.request();

  let whereClause = buildReservationFilters(filters, request);

  if (!canAccessAll(currentUser.role)) {
    whereClause += `
        AND r.user_id = @user_id
        `;

    request.input("user_id", sql.UniqueIdentifier, currentUser.id);
  }

  const { page, pageSize, offset } = getPagination(filters);

  request.input("offset", sql.Int, offset);
  request.input("pageSize", sql.Int, pageSize);

  const query = `
        SELECT
        r.*,
        p.name AS property_name
        FROM reservations r
        INNER JOIN properties p
        ON r.property_id = p.id
        ${whereClause}
        ORDER BY r.created_at DESC
        OFFSET @offset ROWS
        FETCH NEXT @pageSize ROWS ONLY
    `;

  const countRequest = pool.request();

  let countWhereClause = buildReservationFilters(filters, countRequest);

  if (!canAccessAll(currentUser.role)) {
    countWhereClause += `
        AND r.user_id = @user_id
        `;

    countRequest.input("user_id", sql.UniqueIdentifier, currentUser.id);
  }

  const countQuery = `
        SELECT COUNT(*) AS total
        FROM reservations r
        ${countWhereClause}
    `;

  const totalResult = await countRequest.query(countQuery);
  const total = totalResult.recordset[0].total;

  const result = await request.query(query);

  return {
    reservations: result.recordset,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

//===================================================
// GET RESERVATION BY ID
//===================================================
async function getReservationByID(reservation_id, currentUser, options = {}) {
  const pool = getPool();

  const reservationResult = await pool
    .request()
    .input("reservation_id", sql.UniqueIdentifier, reservation_id).query(`
        SELECT
            r.*,
            p.name AS property_name,
            rs.name AS source_name
        FROM reservations r
        LEFT JOIN reservation_sources rs
            ON r.source = rs.code
        INNER JOIN properties p
            ON r.property_id = p.id
        WHERE r.id = @reservation_id
        `);

  const reservation = reservationResult.recordset[0];

  reservation.source = {
    code: reservation.source,
    name: reservation.source_name,
  };

  delete reservation.source_name;

  if (!reservation) {
    throw new AppError(
      "Reservation not found",
      ERROR_CODES.RESERVATION_NOT_FOUND,
      404,
    );
  }

  if (
    !canAccessAll(currentUser.role) &&
    currentUser.id !== reservation.user_id
  ) {
    throw new AppError("Access denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  const roomsResult = await pool
    .request()
    .input("reservation_id", sql.UniqueIdentifier, reservation_id).query(`
        SELECT
            rr.*,
            rt.name AS room_type_name,
            rp.title AS rate_plan_title
        FROM reservation_rooms rr
        INNER JOIN room_types rt
            ON rr.room_type_id = rt.id
        LEFT JOIN rate_plans rp
            ON rr.rate_plan_id = rp.id
        WHERE rr.reservation_id = @reservation_id
        ORDER BY rr.created_at ASC
        `);
  const guestsResult = await pool.request()
  .input("reservation_id", sql.UniqueIdentifier, reservation_id)
  .query(`
    SELECT
      g.*,
      gt.name AS guest_type_name,
      rg.is_primary,
      rg.role
    FROM reservation_guests rg
    INNER JOIN guests g
      ON rg.guest_id = g.id
    LEFT JOIN guest_types gt
      ON g.guest_type = gt.code
    WHERE rg.reservation_id = @reservation_id
    ORDER BY rg.is_primary DESC, g.created_at ASC
  `);
  const reservationData = {
    ...reservation,
    rooms: roomsResult.recordset,
    guests: guestsResult.recordset
  };

  if (
    options.include_external === "true" &&
    canAccessAll(currentUser.role) &&
    reservation.channex_reservation_id
  ) {
    const external = await channexBookingService.getBooking(
      reservation.channex_reservation_id
    );

    return {
      reservation: reservationData,
      external
    };
  }

  return reservationData;

  return {
    ...reservation,
    rooms: roomsResult.recordset,
    guests: guestsResult.recordset,
  };
}

//===================================================
// UPDATE RESERVATION
//===================================================
async function updateReservation(reservation_id, body, currentUser) {
  const pool = getPool();
  const hasFullAccess = canAccessAll(currentUser.role);

  const existingResult = await pool
    .request()
    .input("reservation_id", sql.UniqueIdentifier, reservation_id).query(`
      SELECT *
      FROM reservations
      WHERE id = @reservation_id
    `);

  const reservation = existingResult.recordset[0];

  if (!reservation) {
    throw new AppError(
      "Reservation not found",
      ERROR_CODES.RESERVATION_NOT_FOUND,
      404,
    );
  }

  if (!hasFullAccess && currentUser.id !== reservation.user_id) {
    throw new AppError("Access denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  if (!hasFullAccess && reservation.status === 4) {
    throw new AppError(
      "Cancelled reservations cannot be updated",
      ERROR_CODES.INVALID_RESERVATION_VALUES,
      400,
    );
  }

  const allowedFields = [
    "guest_type",
    "guest_name",
    "guest_email",
    "guest_phone",

    "guest_vat_number",
    "guest_company_name",
    "guest_company_activity",
    "guest_address",
    "guest_city",
    "guest_postal_code",
    "guest_country",
    "guest_tax_office",

    "total_price",
    "notes",
  ];

  if (hasFullAccess) {
    allowedFields.push("status");
  }

  if (
    body.guest_type !== undefined &&
    ![1, 2].includes(Number(body.guest_type))
  ) {
    throw new AppError(
      "Invalid guest_type",
      ERROR_CODES.INVALID_RESERVATION_VALUES,
      400,
    );
  }

  if (
    body.status !== undefined &&
    ![1, 2, 3, 4].includes(Number(body.status))
  ) {
    throw new AppError(
      "Invalid reservation status",
      ERROR_CODES.INVALID_RESERVATION_VALUES,
      400,
    );
  }

  const updates = [];
  const request = pool.request();

  request.input("reservation_id", sql.UniqueIdentifier, reservation_id);

  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updates.push(`${key} = @${key}`);

      if (key === "guest_type") {
        request.input(key, sql.TinyInt, Number(body[key]));
      } else if (key === "total_price") {
        request.input(key, sql.Decimal(10, 2), body[key]);
      } else {
        request.input(key, sql.NVarChar, body[key]);
      }
    }
  }

  if (updates.length === 0) {
    throw new AppError(
      "No valid fields to update",
      ERROR_CODES.INVALID_RESERVATION_VALUES,
      400,
    );
  }

  if (
    body.guest_type !== undefined &&
    ![1, 2].includes(Number(body.guest_type))
  ) {
    throw new AppError(
      "Invalid guest_type",
      ERROR_CODES.INVALID_RESERVATION_VALUES,
      400,
    );
  }

  updates.push("updated_at = GETDATE()");

  const result = await request.query(`
    UPDATE reservations
    SET ${updates.join(", ")}
    OUTPUT inserted.*
    WHERE id = @reservation_id
  `);

  return result.recordset[0];
}

//===================================================
// CANCEL RESERVATION
//===================================================
async function cancelReservation(reservation_id, currentUser) {
  const pool = getPool();
  const hasFullAccess = canAccessAll(currentUser.role);

  const reservationResult = await pool
    .request()
    .input("reservation_id", sql.UniqueIdentifier, reservation_id).query(`
      SELECT *
      FROM reservations
      WHERE id = @reservation_id
    `);

  const reservation = reservationResult.recordset[0];

  if (!reservation) {
    throw new AppError(
      "Reservation not found",
      ERROR_CODES.RESERVATION_NOT_FOUND,
      400,
    );
  }

  if (
    !canAccessAll(currentUser.role) &&
    currentUser.id !== reservation.user_id
  ) {
    throw new AppError("Access Denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  if (!hasFullAccess && reservation.status === 4) {
    throw new AppError(
      "Reservation is already cancelled!",
      ERROR_CODES.RESERVATION_INVALID_STATUS_UPDATE,
      400,
    );
  }

  const roomsResult = await pool
    .request()
    .input("reservation_id", sql.UniqueIdentifier, reservation_id).query(`
        SELECT * 
        FROM reservation_rooms
        WHERE reservation_id = @reservation_id
    `);

  for (const room of roomsResult.recordset) {
    await pool
      .request()
      .input("room_type_id", sql.UniqueIdentifier, room.room_type_id)
      .input("check_in", sql.Date, reservation.check_in)
      .input("check_out", sql.Date, reservation.check_out)
      .input("rooms_count", sql.Int, room.rooms_count).query(`
            UPDATE room_type_availability
            SET
            availability = availability + @rooms_count,
            updated_at = GETDATE()
            WHERE room_type_id = @room_type_id
            AND date >= @check_in
            AND date < @check_out
        `);
  }

  const result = await pool
    .request()
    .input("reservation_id", sql.UniqueIdentifier, reservation_id).query(`
        UPDATE reservations
        SET
            status = 4,
            updated_at = GETDATE()
        OUTPUT inserted.*
        WHERE id = @reservation_id
        `);

  return result.recordset[0];
}

//===================================================
// CHECK-IN
//===================================================
async function checkInReservation(reservation_id, currentUser) {
  return await changeReservationStatus(reservation_id, currentUser, 2);
}

//===================================================
// CHECK-OUT
//===================================================
async function checkOutReservation(reservation_id, currentUser) {
  return await changeReservationStatus(reservation_id, currentUser, 3);
}

//===================================================
// RESERVATIONS CALENDAR
//===================================================
async function getReservationsCalendar(filters, currentUser) {
  const { property_id, date_from, date_to, room_type_id } = filters;

  if (!property_id || !date_from || !date_to) {
    throw new AppError(
      "property_id, date_from and date_to are required",
      ERROR_CODES.RESERVATION_REQUIRED_FIELDS,
      400,
    );
  }

  const startDate = new Date(date_from);
  const endDate = new Date(date_to);

  if (isNaN(startDate) || isNaN(endDate)) {
    throw new AppError(
      "Invalid date format",
      ERROR_CODES.INVALID_RESERVATION_VALUES,
      400,
    );
  }

  if (startDate > endDate) {
    throw new AppError(
      "date_from cannot be after date_to",
      ERROR_CODES.INVALID_RESERVATION_VALUES,
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
    roomTypeFilter = ` AND rr.room_type_id = @room_type_id`;
    request.input("room_type_id", sql.UniqueIdentifier, room_type_id);
  }

  const result = await request.query(`
        SELECT
        r.id AS reservation_id,
        r.guest_type,
        r.guest_name,
        r.guest_company_name,
        r.guest_email,
        r.guest_phone,
        r.check_in,
        r.check_out,
        r.status,
        r.source,
        r.total_price,
        DATEDIFF(day, r.check_in, r.check_out) AS nights,

        rr.id AS reservation_room_id,
        rr.room_type_id,
        rt.name AS room_type_name,
        rr.rate_plan_id,
        rp.title AS rate_plan_title,
        rr.rooms_count,
        rr.adults,
        rr.children,
        rr.infants,
        rr.price
        FROM reservations r
        INNER JOIN reservation_rooms rr
        ON r.id = rr.reservation_id
        INNER JOIN room_types rt
        ON rr.room_type_id = rt.id
        LEFT JOIN rate_plans rp
        ON rr.rate_plan_id = rp.id
        WHERE r.property_id = @property_id
        AND r.status <> 4
        AND r.check_in < @date_to
        AND r.check_out > @date_from
        ${roomTypeFilter}
        ORDER BY r.check_in ASC, rt.name ASC
    `);

  return {
    property: {
      id: property.id,
      name: property.name,
    },
    date_from,
    date_to,
    reservations: result.recordset,
  };
}

//===================================================
// RESERVATIONS STATISTICS
//===================================================
async function getReservationStatistics(filters, currentUser) {
  const { property_id, date_from, date_to, room_type_id, rate_plan_id } =
    filters;

  if (!property_id || !date_from || !date_to) {
    throw new AppError(
      "property_id, date_from and date_to are required",
      ERROR_CODES.RESERVATION_REQUIRED_FIELDS,
      400,
    );
  }

  const startDate = new Date(date_from);
  const endDate = new Date(date_to);

  if (isNaN(startDate) || isNaN(endDate)) {
    throw new AppError(
      "Invalid date format",
      ERROR_CODES.INVALID_RESERVATION_VALUES,
      400,
    );
  }

  if (startDate > endDate) {
    throw new AppError(
      "date_from cannot be after date_to",
      ERROR_CODES.INVALID_RESERVATION_VALUES,
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

  const statsRequest = pool.request();

  statsRequest.input("property_id", sql.UniqueIdentifier, property_id);
  statsRequest.input("date_from", sql.Date, startDate);
  statsRequest.input("date_to", sql.Date, endDate);

  let roomRateFilter = "";

  if (room_type_id) {
    roomRateFilter += `
      AND EXISTS (
        SELECT 1
        FROM reservation_rooms rr_filter
        WHERE rr_filter.reservation_id = r.id
          AND rr_filter.room_type_id = @room_type_id
      )
    `;

    statsRequest.input("room_type_id", sql.UniqueIdentifier, room_type_id);
  }

  if (rate_plan_id) {
    roomRateFilter += `
      AND EXISTS (
        SELECT 1
        FROM reservation_rooms rr_filter
        WHERE rr_filter.reservation_id = r.id
          AND rr_filter.rate_plan_id = @rate_plan_id
      )
    `;

    statsRequest.input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id);
  }

  const result = await statsRequest.query(`
    SELECT
      COUNT(*) AS total_reservations,

      SUM(CASE WHEN r.status = 1 THEN 1 ELSE 0 END) AS confirmed,
      SUM(CASE WHEN r.status = 2 THEN 1 ELSE 0 END) AS checked_in,
      SUM(CASE WHEN r.status = 3 THEN 1 ELSE 0 END) AS checked_out,
      SUM(CASE WHEN r.status = 4 THEN 1 ELSE 0 END) AS cancelled,

      SUM(CASE WHEN r.status <> 4 THEN ISNULL(r.total_price, 0) ELSE 0 END) AS revenue,

      SUM(
        CASE
          WHEN r.status <> 4
          THEN DATEDIFF(day, r.check_in, r.check_out)
          ELSE 0
        END
      ) AS total_nights
    FROM reservations r
    WHERE r.property_id = @property_id
      AND r.check_in < @date_to
      AND r.check_out > @date_from
      ${roomRateFilter}
  `);

  const roomStatsRequest = pool.request();

  roomStatsRequest.input("property_id", sql.UniqueIdentifier, property_id);
  roomStatsRequest.input("date_from", sql.Date, startDate);
  roomStatsRequest.input("date_to", sql.Date, endDate);

  let roomStatsFilter = "";

  if (room_type_id) {
    roomStatsFilter += `
      AND rr.room_type_id = @room_type_id
    `;

    roomStatsRequest.input("room_type_id", sql.UniqueIdentifier, room_type_id);
  }

  if (rate_plan_id) {
    roomStatsFilter += `
      AND rr.rate_plan_id = @rate_plan_id
    `;

    roomStatsRequest.input("rate_plan_id", sql.UniqueIdentifier, rate_plan_id);
  }

  const roomStatsResult = await roomStatsRequest.query(`
    SELECT
      rt.id AS room_type_id,
      rt.name AS room_type_name,

      COUNT(DISTINCT r.id) AS reservations_count,

      SUM(
        CASE
          WHEN r.status <> 4
          THEN rr.rooms_count
          ELSE 0
        END
      ) AS rooms_booked,

      SUM(
        CASE
          WHEN r.status <> 4
          THEN ISNULL(rr.price, 0)
          ELSE 0
        END
      ) AS revenue
    FROM reservation_rooms rr
    INNER JOIN reservations r
      ON rr.reservation_id = r.id
    INNER JOIN room_types rt
      ON rr.room_type_id = rt.id
    WHERE r.property_id = @property_id
      AND r.check_in < @date_to
      AND r.check_out > @date_from
      ${roomStatsFilter}
    GROUP BY rt.id, rt.name
    ORDER BY rt.name ASC
  `);

  const statistics = result.recordset[0];

  return {
    property: {
      id: property.id,
      name: property.name,
    },
    date_from,
    date_to,
    filters: {
      room_type_id: room_type_id || null,
      rate_plan_id: rate_plan_id || null,
    },
    totals: {
      total_reservations: statistics.total_reservations || 0,
      confirmed: statistics.confirmed || 0,
      checked_in: statistics.checked_in || 0,
      checked_out: statistics.checked_out || 0,
      cancelled: statistics.cancelled || 0,
      revenue: statistics.revenue || 0,
      total_nights: statistics.total_nights || 0,
    },
    by_room_type: roomStatsResult.recordset,
  };
}

//===================================================================================
//HELPER FOR CHECK-IN & CHECK-OUT
//===================================================================================
async function changeReservationStatus(reservation_id, currentUser, newStatus) {
  const pool = getPool();
  const hasFullAccess = canAccessAll(currentUser.role);

  const existingResult = await pool
    .request()
    .input("reservation_id", sql.UniqueIdentifier, reservation_id).query(`
      SELECT *
      FROM reservations
      WHERE id = @reservation_id
    `);

  const reservation = existingResult.recordset[0];

  if (!reservation) {
    throw new AppError(
      "Reservation not found",
      ERROR_CODES.RESERVATION_NOT_FOUND,
      404,
    );
  }

  if (!hasFullAccess && currentUser.id !== reservation.user_id) {
    throw new AppError("Access denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  if (!hasFullAccess && reservation.status === 4) {
    throw new AppError(
      "Cancelled reservation cannot be changed",
      ERROR_CODES.INVALID_RESERVATION_VALUES,
      400,
    );
  }

  if (!hasFullAccess && newStatus === 2 && reservation.status !== 1) {
    throw new AppError(
      "Only confirmed reservations can be checked in",
      ERROR_CODES.INVALID_RESERVATION_VALUES,
      400,
    );
  }

  if (!hasFullAccess && newStatus === 3 && reservation.status !== 2) {
    throw new AppError(
      "Only checked-in reservations can be checked out",
      ERROR_CODES.INVALID_RESERVATION_VALUES,
      400,
    );
  }

  const result = await pool
    .request()
    .input("reservation_id", sql.UniqueIdentifier, reservation_id)
    .input("status", sql.TinyInt, newStatus).query(`
      UPDATE reservations
      SET
        status = @status,
        updated_at = GETDATE()
      OUTPUT inserted.*
      WHERE id = @reservation_id
    `);

  return result.recordset[0];
}


//===================================================================================
//HELPER FOR CHECK-IN & CHECK-OUT
//===================================================================================
async function findOrCreateGuest(pool, userId, data) {
  let existingResult = null;

  if (Number(data.guest_type) === 2 && data.guest_vat_number) {
    existingResult = await pool.request()
      .input("user_id", sql.UniqueIdentifier, userId)
      .input("vat_number", sql.NVarChar, data.guest_vat_number)
      .query(`
        SELECT TOP 1 *
        FROM guests
        WHERE user_id = @user_id
          AND vat_number = @vat_number
      `);
  } else if (data.guest_email) {
    existingResult = await pool.request()
      .input("user_id", sql.UniqueIdentifier, userId)
      .input("email", sql.NVarChar, data.guest_email)
      .query(`
        SELECT TOP 1 *
        FROM guests
        WHERE user_id = @user_id
          AND email = @email
      `);
  }

  if (existingResult && existingResult.recordset.length > 0) {
    return existingResult.recordset[0];
  }

  const insertResult = await pool.request()
    .input("user_id", sql.UniqueIdentifier, userId)
    .input("guest_type", sql.TinyInt, Number(data.guest_type))
    .input("name", sql.NVarChar, data.guest_name || null)
    .input("email", sql.NVarChar, data.guest_email || null)
    .input("phone", sql.NVarChar, data.guest_phone || null)
    .input("vat_number", sql.NVarChar, data.guest_vat_number || null)
    .input("company_name", sql.NVarChar, data.guest_company_name || null)
    .input("company_activity", sql.NVarChar, data.guest_company_activity || null)
    .input("address", sql.NVarChar, data.guest_address || null)
    .input("city", sql.NVarChar, data.guest_city || null)
    .input("postal_code", sql.NVarChar, data.guest_postal_code || null)
    .input("country", sql.NVarChar, data.guest_country || null)
    .input("tax_office", sql.NVarChar, data.guest_tax_office || null)
    .query(`
      INSERT INTO guests (
        user_id,
        guest_type,
        name,
        email,
        phone,
        vat_number,
        company_name,
        company_activity,
        address,
        city,
        postal_code,
        country,
        tax_office
      )
      OUTPUT inserted.*
      VALUES (
        @user_id,
        @guest_type,
        @name,
        @email,
        @phone,
        @vat_number,
        @company_name,
        @company_activity,
        @address,
        @city,
        @postal_code,
        @country,
        @tax_office
      )
    `);

  return insertResult.recordset[0];
}

module.exports = {
  createReservation,
  getReservations,
  getReservationByID,
  updateReservation,
  cancelReservation,
  checkInReservation,
  checkOutReservation,
  getReservationsCalendar,
  getReservationStatistics,
};

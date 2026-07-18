const { getPool, sql } = require("../../config/db");
const AppError = require("../../utils/AppError");
const ERROR_CODES = require("../../constants/errorCodes");
const reservationService = require("../reservationService");
const RESERVATION_SOURCES = require("../../constants/reservationSources");

async function processChannexBooking(channexBooking) {
  const pool = getPool();

  const booking = channexBooking?.data?.attributes;

  if (!booking) {
    throw new AppError(
      "Invalid Channex booking payload",
      ERROR_CODES.INVALID_RESERVATION_VALUES,
      400
    );
  }

  // ======================================
  // AVOID DUPLICATE RESERVATION
  // ======================================

  const existingResult = await pool.request()
    .input("channex_reservation_id", sql.NVarChar, booking.booking_id)
    .query(`
      SELECT id
      FROM reservations
      WHERE channex_reservation_id = @channex_reservation_id
    `);

  if (existingResult.recordset.length > 0) {
    return {
      message: "Reservation already exists locally",
      reservation_id: existingResult.recordset[0].id,
      channex_reservation_id: booking.booking_id
    };
  }

  // ======================================
  // MAP PROPERTY
  // ======================================

  const propertyResult = await pool.request()
    .input("channex_property_id", sql.NVarChar, booking.property_id)
    .query(`
      SELECT id, user_id
      FROM properties
      WHERE channex_property_id = @channex_property_id
    `);

  const property = propertyResult.recordset[0];

  if (!property) {
    throw new AppError(
      "Local property not found for Channex booking",
      ERROR_CODES.PROPERTY_NOT_FOUND,
      404
    );
  }

  // ======================================
  // MAP ROOMS
  // ======================================

  const rooms = [];

  for (const channexRoom of booking.rooms || []) {
    const roomTypeResult = await pool.request()
      .input("channex_room_type_id", sql.NVarChar, channexRoom.room_type_id)
      .query(`
        SELECT id
        FROM room_types
        WHERE channex_room_type_id = @channex_room_type_id
      `);

    const roomType = roomTypeResult.recordset[0];

    if (!roomType) {
      throw new AppError(
        "Local room type not found for Channex booking",
        ERROR_CODES.ROOM_TYPE_NOT_FOUND,
        404
      );
    }

    const ratePlanResult = await pool.request()
      .input("channex_rate_plan_id", sql.NVarChar, channexRoom.rate_plan_id)
      .query(`
        SELECT id
        FROM rate_plans
        WHERE channex_rate_plan_id = @channex_rate_plan_id
      `);

    const ratePlan = ratePlanResult.recordset[0];

    rooms.push({
      room_type_id: roomType.id,
      rate_plan_id: ratePlan?.id || null,
      rooms_count: 1,
      adults: channexRoom.occupancy?.adults || 0,
      children: channexRoom.occupancy?.children || 0,
      infants: channexRoom.occupancy?.infants || 0,
      price: channexRoom.amount || null
    });
  }

  if (rooms.length === 0) {
    throw new AppError(
      "Booking has no rooms",
      ERROR_CODES.INVALID_RESERVATION_VALUES,
      400
    );
  }

  // ======================================
  // MAP GUEST
  // ======================================

  const customer = booking.customer || {};

  const guestName = `${customer.name || ""} ${customer.surname || ""}`.trim();

  // ======================================
  // CREATE LOCAL RESERVATION USING EXISTING SERVICE
  // ======================================

  const reservationBody = {
    property_id: property.id,

    source: RESERVATION_SOURCES.CHANNEX || 2,

    guest_type: 1,
    guest_name: guestName || null,
    guest_email: customer.mail || null,
    guest_phone: customer.phone || null,
    guest_country: customer.country || null,
    guest_city: customer.city || null,
    guest_address: customer.address || null,
    guest_postal_code: customer.zip || null,

    check_in: booking.arrival_date,
    check_out: booking.departure_date,
    total_price: booking.amount || null,
    notes: booking.notes || null,

    channex_reservation_id: booking.booking_id,
    channex_revision_id: booking.revision_id,
    ota_reservation_code: booking.ota_reservation_code,
    ota_name: booking.ota_name,
    channel_id: booking.channel_id,

    rooms
  };

  const systemUser = {
    id: property.user_id,
    role: "customer"
  };

  const reservation = await reservationService.createReservation(
    reservationBody,
    systemUser
  );

  return {
    reservation_id: reservation.id,
    channex_reservation_id: booking.booking_id,
    ota_reservation_code: booking.ota_reservation_code
  };
}

module.exports = {
  processChannexBooking
};
const reservationsService = require("../services/reservationService");
const { success } = require("../utils/response");
const handleError = require("../utils/handleError");

//===================================================
// CREATE RESERVATION
//===================================================
async function createReservation(req, res) {
  try {
    const reservation = await reservationsService.createReservation(
      req.body,
      req.user,
    );

    return success(
      res,
      { reservation },
      "Reservation created successfully",
      201,
    );
  } catch (err) {
    return handleError(res, err);
  }
}

//===================================================
// GET RESERVATIONS
//===================================================
async function getReservations(req, res) {
  try {
    const result = await reservationsService.getReservations(
      req.query,
      req.user,
    );

    return success(
      res,
      result,
      result.reservations.length
        ? "Reservations fetched successfully"
        : "No reservations found",
    );
  } catch (err) {
    return handleError(res, err);
  }
}

//===================================================
// GET RESERVATION BY ID
//===================================================
async function getReservationByID(req, res) {
  try {
    const reservation = await reservationsService.getReservationByID(
      req.params.reservation_id,
      req.user,
      req.query,
    );

    return success(res, { reservation }, "Reservation fetched successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

//===================================================
// UPDATE RESERVATION
//===================================================
async function updateReservation(req, res) {
  try {
    const reservation = await reservationsService.updateReservation(
      req.params.reservation_id,
      req.body,
      req.user,
    );

    return success(res, { reservation }, "Reservation updated successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

//===================================================
// CANCEL RESERVATION
//===================================================
async function cancelReservation(req, res) {
  try {
    const result = await reservationsService.cancelReservation(
      req.params.reservation_id,
      req.user,
    );

    return success(res, { result }, "Reservation Cancelled");
  } catch (err) {
    return handleError(res, err);
  }
}

//===================================================
// CHECK-IN
//===================================================
async function checkInReservation(req, res) {
  try {
    const reservation = await reservationsService.checkInReservation(
      req.params.reservation_id,
      req.user,
    );

    return success(res, { reservation }, "Reservation checked in successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

//===================================================
// CHECK-OUT
//===================================================
async function checkOutReservation(req, res) {
  try {
    const reservation = await reservationsService.checkOutReservation(
      req.params.reservation_id,
      req.user,
    );

    return success(
      res,
      { reservation },
      "Reservation checked out successfully",
    );
  } catch (err) {
    return handleError(res, err);
  }
}

//===================================================
// RESERVATIONS CALENDAR
//===================================================
async function getReservationsCalendar(req, res) {
  try {
    const result = await reservationsService.getReservationsCalendar(
      req.query,
      req.user,
    );

    return success(res, result, "Reservations calendar fetched successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

//===================================================
// RESERVATIONS STATISTICS
//===================================================
async function getReservationStatistics(req, res) {
  try {
    const result = await reservationsService.getReservationStatistics(
      req.query,
      req.user,
    );

    return success(res, result, "Reservation statistics fetched successfully");
  } catch (err) {
    return handleError(res, err);
  }
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

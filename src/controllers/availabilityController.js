const availabilityService = require("../services/availabilityService");
const { success } = require("../utils/response");
const handleError = require("../utils/handleError");

// ======================================
// INITIALIZE ROOM TYPE AVAILABILITY
// ======================================
async function initializeRoomTypeAvailability(req, res) {
  try {
    const result = await availabilityService.initializeRoomTypeAvailability(
      req.params.property_id,
      req.params.room_type_id,
      req.body,
      req.user,
    );

    return success(res, result, "Availability initialized successfully", 201);
  } catch (err) {
    return handleError(res, err);
  }
}

// ======================================
// GET AVAILABILITY CALENDAR
// ======================================
async function getAvailabilityCalendar(req, res) {
  try {
    const result = await availabilityService.getAvailabilityCalendar(
      req.params.property_id,
      req.query,
      req.user,
    );

    return success(res, result, "Availability calendar fetched successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

// ======================================
// UPDATE ROOM TYPE AVAILABILITY
// ======================================
async function updateRoomTypeAvailability(req, res) {
  try {
    const result = await availabilityService.updateRoomTypeAvailability(
      req.params.property_id,
      req.params.room_type_id,
      req.body,
      req.user,
    );

    return success(res, result, "Availability updated successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

// ======================================
// GET ROOM TYPE CALENDAR
// ======================================
async function getRoomTypeCalendar(req, res) {
  try {
    const result = await availabilityService.getRoomTypeCalendar(
      req.params.property_id,
      req.params.room_type_id,
      req.query,
      req.user,
    );

    return success(res, result, "Room type calendar fetched successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

// ======================================
// AVAILABILITY CHECK
// ======================================
async function checkAvailabilityDiagnostics(req, res) {
  try {
    const result = await availabilityService.checkAvailabilityDiagnostics(
      req.query,
      req.user,
    );

    return success(
      res,
      result,
      "Availability diagnostics checked successfully",
    );
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  initializeRoomTypeAvailability,
  getAvailabilityCalendar,
  updateRoomTypeAvailability,
  getRoomTypeCalendar,
  checkAvailabilityDiagnostics,
};

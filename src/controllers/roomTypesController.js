const roomTypeService = require("../services/roomTypeService");
const { success } = require("../utils/response");
const handleError = require("../utils/handleError");

//=========================
//CREATE ROOM TYPE
//=========================
async function createRoomType(req, res) {
  try {
    const roomType = await roomTypeService.createRoomType(
      req.params.property_id,
      req.body,
      req.user,
    );

    return success(res, { roomType }, "Room type created successfully", 201);
  } catch (err) {
    return handleError(res, err);
  }
}

//=========================
//GET ROOM TYPES
//=========================
async function getRoomTypes(req, res) {
  try {
    const result = await roomTypeService.getRoomTypes(
      req.params.property_id,
      req.query,
      req.user,
    );

    return success(
      res,
      result,
      result.room_types.length
        ? "Room types fetched successfully"
        : "No room types found",
    );
  } catch (err) {
    return handleError(res, err);
  }
}

//=========================
//GET ROOM TYPE BY ID
//=========================
async function getRoomTypeByID(req, res) {
  try {
    const room_type = await roomTypeService.getRoomTypeByID(
      req.params.property_id,
      req.params.room_type_id,
      req.user,
      req.query,
    );

    return success(res, { room_type }, "Room type fetched successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

//=========================
//UPDATE ROOM TYPE
//=========================
async function updateRoomType(req, res) {
  try {
    const room_type = await roomTypeService.updateRoomType(
      req.params.property_id,
      req.params.room_type_id,
      req.body,
      req.user,
    );

    return success(res, { room_type }, "Room type updated successfully");
  } catch (err) {
    return handleError(res, err);
  }
}
//=========================
//ACTIVATE ROOM TYPE
//=========================
async function activateRoomType(req, res) {
  try {
    const room_type = await roomTypeService.activateRoomType(
      req.params.property_id,
      req.params.room_type_id,
      req.user,
    );

    return success(res, { room_type }, "Room type activated successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

//=========================
//DELETE ROOM TYPE(DE-ACTIVATE)
//=========================
async function deactivateRoomType(req, res) {
  try {
    const room_type = await roomTypeService.deactivateRoomType(
      req.params.property_id,
      req.params.room_type_id,
      req.user,
    );

    return success(res, { room_type }, "Room type deactivated successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  createRoomType,
  getRoomTypes,
  getRoomTypeByID,
  updateRoomType,
  activateRoomType,
  deactivateRoomType,
};

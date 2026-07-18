const { channexRequest } = require("./channexClient");
const channexHelpers = require("./channexHelpers");

// =============================
// BUILD ROOM TYPE CREATE PAYLOAD FOR CHANNEX ROOM TYPE
// =============================
function buildCreateRoomTypePayload(body) {
  return {
    room_type: {
      property_id: body.channex_property_id,
      title: body.name,
      count_of_rooms: body.room_count,
      occ_adults: body.adults,
      occ_children: body.children || 0,
      occ_infants: body.infants || 0,
      default_occupancy: body.default_occupancy,
    },
  };
}

// =============================
// BUILD ROOM TYPE UPDATE PAYLOAD FOR CHANNEX ROOM TYPE
// =============================
function buildUpdateRoomTypePayload(body) {
  const room_type = {};

  if (body.name !== undefined) room_type.title = body.name;
  if (body.room_count !== undefined) room_type.count_of_rooms = body.room_count;
  if (body.adults !== undefined) room_type.occ_adults = body.adults;
  if (body.children !== undefined) room_type.occ_children = body.children;
  if (body.infants !== undefined) room_type.occ_infants = body.infants;
  if (body.default_occupancy !== undefined)
    room_type.default_occupancy = body.default_occupancy;

  return { room_type };
}

// =============================
// CREATE CHANNEX ROOM TYPE
// =============================
async function createRoomType(roomType) {
  const payload = buildCreateRoomTypePayload(roomType);

  const response = await channexRequest({
    method: "POST",
    url: "/room_types",
    data: payload,
  });

  return {
    payload,
    response,
  };
}

// =============================
// GET CHANNEX ROOM TYPE
// =============================
async function getRoomType(channex_room_type_id) {
  const response = await channexRequest({
    method: "GET",
    url: `/room_types/${channex_room_type_id}`,
  });

  return response;
}

// =============================
// UPDATE CHANNEX ROOM TYPE
// =============================
async function updateRoomType(channex_room_type_id, body) {
  const payload = buildUpdateRoomTypePayload(body);

  const response = await channexRequest({
    method: "PUT",
    url: `/room_types/${channex_room_type_id}`,
    data: payload,
  });

  return {
    payload,
    response,
  };
}

// =============================
// GET CHANNEX ROOM TYPES
// =============================
module.exports = {
  buildCreateRoomTypePayload,
  buildUpdateRoomTypePayload,
  createRoomType,
  getRoomType,
  updateRoomType,
};

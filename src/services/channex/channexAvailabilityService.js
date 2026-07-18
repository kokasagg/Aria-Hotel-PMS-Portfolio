const { channexRequest } = require("./channexClient");

// =============================================
// INITIALIZE/UPDATE ROOM TYPE AVAILABILITY
// =============================================
async function updateRoomTypeAvailability(payload) {
  const response = await channexRequest({
    method: "POST",
    url: "/availability",
    data: payload
  });

  return response;
}

module.exports = {
  updateRoomTypeAvailability
};
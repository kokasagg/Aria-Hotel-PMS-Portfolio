const { channexRequest } = require("./channexClient");

async function getBooking(bookingId) {
  const response = await channexRequest({
    method: "GET",
    url: `/bookings/${bookingId}`
  });

  return response;
}

module.exports = {
  getBooking
};
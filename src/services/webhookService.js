const { getPool, sql } = require("../config/db");
const channexBookingService = require("./channex/channexBookingService");
const channexBookingProcessorService = require("./channex/channexBookingProcessorService");

async function saveChannexWebhook(payload) {
  const pool = getPool();

  const eventType =
    payload?.event ||
    payload?.event_type ||
    payload?.type ||
    null;

  const bookingId = payload?.payload?.booking_id || null;
  const revisionId = payload?.payload?.revision_id || null;
  const propertyId =
    payload?.payload?.property_id ||
    payload?.property_id ||
    null;

  await pool.request()
    .input("event_type", sql.NVarChar, eventType)
    .input("entity_type", sql.NVarChar, "booking")
    .input("channex_id", sql.NVarChar, bookingId)
    .input("payload", sql.NVarChar(sql.MAX), JSON.stringify(payload))
    .query(`
      INSERT INTO channex_webhook_logs (
        event_type,
        entity_type,
        channex_id,
        payload
      )
      VALUES (
        @event_type,
        @entity_type,
        @channex_id,
        @payload
      )
    `);

  if (eventType !== "booking" || !bookingId) {
    console.log("Webhook saved only. Not a booking event.");
    return;
  }

  console.log("BOOKING WEBHOOK:");
  console.log("bookingId:", bookingId);
  console.log("revisionId:", revisionId);
  console.log("propertyId:", propertyId);

  const channexBooking = await channexBookingService.getBooking(bookingId);
  await channexBookingProcessorService.processChannexBooking(channexBooking);

  console.log(
    "FULL CHANNEX BOOKING:",
    JSON.stringify(channexBooking, null, 2)
  );
}

module.exports = {
  saveChannexWebhook
};
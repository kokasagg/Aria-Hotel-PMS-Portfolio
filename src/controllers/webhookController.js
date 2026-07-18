const webhookService = require("../services/webhookService");


// ===============================
// WEBHOOK RECEIVE
// ===============================
async function receiveChannexWebhook(req, res) {
  const apiKey = req.header("apiKey");

  if (apiKey !== process.env.CHANNEX_WEBHOOK_API_KEY) {
  return res.status(401).json({
      success: false,
      message: "Unauthorized"
  });
  }
  try {
    await webhookService.saveChannexWebhook(req.body);

    return res.status(200).json({
      success: true,
      message: "Webhook received"
    });
  } catch (err) {
    console.error("WEBHOOK ERROR:", err);

    return res.status(200).json({
      success: false,
      message: "Webhook received but failed internally"
    });
  }
}

module.exports = {
  receiveChannexWebhook
};
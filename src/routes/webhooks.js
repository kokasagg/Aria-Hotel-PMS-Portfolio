const express = require("express");
const router = express.Router();

const {
  receiveChannexWebhook
} = require("../controllers/webhookController");

router.post("/channex", receiveChannexWebhook);

module.exports = router;
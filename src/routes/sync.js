const express = require("express");
const router = express.Router();

const authenticate = require("../middleware/authenticate");

const {
  recoverSyncLog,
  getSyncLogs,
} = require("../controllers/syncController");

// POST SYNC/ RETRY
router.post("/recover/:sync_log_id", authenticate, recoverSyncLog);
// GET LOGS
router.get("/logs", authenticate, getSyncLogs);

module.exports = router;

// controllers/syncController.js

const syncRecoveryService = require("../services/sync/syncRecoveryService");
const { success } = require("../utils/response");
const handleError = require("../utils/handleError");

async function recoverSyncLog(req, res) {
  try {
    const result = await syncRecoveryService.recoverSyncLog(
      req.params.sync_log_id,
      req.user,
    );

    return success(res, result, "Sync recovered successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

async function getSyncLogs(req, res) {
  try {
    const result = await syncRecoveryService.getSyncLogs(req.query, req.user);

    return success(res, result, "Sync logs fetched successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  recoverSyncLog,
  getSyncLogs,
};

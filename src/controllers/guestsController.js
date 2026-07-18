const guestService = require("../services/guestService");
const { getPool, sql } = require("../config/db");
const { success, error } = require("../utils/response");
const ERROR_CODES = require("../constants/errorCodes");
const handleError = require("../utils/handleError");


// ======================================
// GET GUESTS
// ======================================
const guestService = require("../services/guestService");
const { success, error } = require("../utils/response");

async function getGuests(req, res) {
  try {
    const result = await guestService.getGuests(
      req.query,
      req.user
    );

    return success(
      res,
      result,
      "Guests fetched successfully"
    );
  } catch (err) {
    return error(res, err);
  }
}

module.exports = {
  getGuests
};
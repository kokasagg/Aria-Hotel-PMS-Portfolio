const AppError = require("./AppError");
const ERROR_CODES = require("../constants/errorCodes");
const { getPool, sql } = require("../config/db");
const { Bit } = require("msnodesqlv8");

function validateActiveUser(user) {
  const isActive =
    user.is_active === 1 || user.is_active === true || user.is_active === "1";

  if (!isActive) {
    throw new AppError(
      "User account is inactive",
      ERROR_CODES.USER_INACTIVE,
      403,
    );
  }
}

function syncUserSubscription(user) {
  const pool = getPool();

  if (
    new Date(user.active_until) < new Date() &&
    Number(user.is_active) === 1
  ) {
    pool.request().input("userId", sql.UniqueIdentifier, user.id).query(`
        UPDATE users
        SET is_active = 0
        WHERE id = @userId
      `);

    user.is_active = 0;
  }

  return user;
}

module.exports = {
  validateActiveUser,
  syncUserSubscription,
};

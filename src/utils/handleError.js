const { error } = require("./response");
const ERROR_CODES = require("../constants/errorCodes");

function handleError(res, err) {
  console.error(err);

  if (err.statusCode && err.code) {
    return error(res, err.message, err.code, err.statusCode);
  }

  return error(
    res,
    "Internal server error",
    ERROR_CODES.INTERNAL_SERVER_ERROR,
    500,
  );
}

module.exports = handleError;

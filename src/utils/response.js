function success(res, data = {}, message = "", status = 200) {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
}

function error(res, message, code, status = 400, details = null) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      details,
    },
  });
}

module.exports = {
  success,
  error,
};

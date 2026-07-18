const AppError = require("./AppError");

function normalizeRole(role) {
  if (role === "user") {
    return "customer";
  }

  return role;
}

function canAccessUser(currentUser, targUserId) {
  if (currentUser.role === "customer" && currentUser.id === targUserId) {
    return 1;
  } else if (currentUser.role === "admin") {
    return 2;
  } else if (currentUser.role === " superadmin") {
    return 3;
  } else {
    throw new AppError(
      "Role validation error",
      ERROR_CODES.USER_ROLE_ERROR,
      403,
    );
  }
}

function canAccessAll(role) {
  const normalizedRole = normalizeRole(role);

  return normalizedRole === "admin" || normalizedRole === "superadmin";
}

function isSuperAdmin(role) {
  return normalizeRole(role) === "superadmin";
}

module.exports = {
  normalizeRole,
  canAccessUser,
  canAccessAll,
  isSuperAdmin,
};

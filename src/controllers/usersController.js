const userService = require("../services/userService");

const { success } = require("../utils/response");

const handleError = require("../utils/handleError");

// REGISTER USER

async function registerUser(req, res) {
  try {
    const user = await userService.registerUser(req.body);

    return success(res, { user }, "User created successfully", 201);
  } catch (err) {
    return handleError(res, err);
  }
}

//LOGIN
async function loginUser(req, res) {
  try {
    const data = await userService.loginUser(req.body);

    return success(res, data, "Login Successfull", 201);
  } catch (err) {
    return handleError(res, err);
  }
}

// ======================================
// GET USERS
// ======================================

async function getUsers(req, res) {
  try {
    const result = await userService.getUsers(req.query, {
      ...req.user,
    });

    return success(
      res,
      result,
      result.users.length ? "Users fetched successfully" : "No users found",
    );
  } catch (err) {
    return handleError(res, err);
  }
}

// ======================================
// GET USER BY ID
// ======================================

async function getUserById(req, res) {
  try {
    const user = await userService.getUserById(req.params.id, req.user);

    return success(res, { user }, "User fetched successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

// ======================================
// GET SAME USER AS LOGGED IN
// ======================================

async function getMe(req, res) {
  try {
    const user = await userService.getMe(req.user);

    return success(res, { user }, "User fetched successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

// ======================================
// UPDATE USER
// ======================================

async function updateUser(req, res) {
  try {
    const user = await userService.updateUser(req.params.id, req.body, {
      ...req.user,
    });

    return success(res, { user }, "User updated successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

// ======================================
// DELETE USER
// ======================================
async function deleteUser(req, res) {
  try {
    await userService.deleteUser(req.params.id, {
      ...req.user,
    });

    return success(res, null, "User deleted successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

// ======================================
// EXPORTS
// ======================================

module.exports = {
  registerUser,
  loginUser,
  getUsers,
  getUserById,
  getMe,
  updateUser,
  deleteUser,
};

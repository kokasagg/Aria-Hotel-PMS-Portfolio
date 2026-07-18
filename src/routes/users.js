const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");

const {
  registerUser,
  loginUser,
  getUsers,
  getUserById,
  getMe,
  updateUser,
  deleteUser,
} = require("../controllers/usersController");

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);

router.get("/", authenticate, getUsers);
router.get("/me", authenticate, getMe);
router.get("/:id", authenticate, getUserById);

router.put("/:id", authenticate, updateUser);

router.delete("/:id", authenticate, deleteUser);

module.exports = router;

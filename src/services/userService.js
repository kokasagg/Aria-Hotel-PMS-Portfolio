const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { getPool, sql } = require("../config/db");
const { normalizeRole, canAccessUser } = require("../utils/access");
const buildUserFilters = require("../utils/buildUserFilters");
const getPagination = require("../utils/pagination");
const {
  validateActiveUser,
  syncUserSubscription,
} = require("../utils/userStatus");

const ERROR_CODES = require("../constants/errorCodes");

const AppError = require("../utils/AppError");

async function registerUser(body) {
  try {
    let {
      vat_number,
      email,
      password,
      name,
      is_from_partner,
      partner_vat,
      partner_name,
    } = body;

    // ======================================
    // REQUIRED FIELDS
    // ======================================

    if (!is_from_partner) {
      is_from_partner = 0;
    }

    if (!partner_vat) {
      partner_vat = null;
    }

    if (!partner_name) {
      partner_name = null;
    }

    if (!name) {
      throw new AppError(
        "name is required",
        ERROR_CODES.USER_NAME_REQUIRED,
        400,
      );
    }

    if (!vat_number || !email || !password) {
      throw new AppError(
        "vat_number, email and password are required",
        ERROR_CODES.USER_REQUIRED_FIELDS,
        400,
      );
    }

    // ======================================
    // NORMALIZE VAT
    // ======================================

    vat_number = vat_number.replace(/\D/g, "");

    // ======================================
    // VAT VALIDATION
    // ======================================

    if (vat_number.length !== 9) {
      throw new AppError(
        "VAT number must be 9 digits",
        ERROR_CODES.INVALID_VAT,
        400,
      );
    }

    // ======================================
    // EMAIL VALIDATION
    // ======================================

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      throw new AppError(
        "Invalid email format",
        ERROR_CODES.INVALID_EMAIL,
        400,
      );
    }

    // ======================================
    // PASSWORD VALIDATION
    // ======================================

    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

    if (!passwordRegex.test(password)) {
      throw new AppError(
        "Password must contain uppercase, lowercase, number and special character",
        ERROR_CODES.INVALID_PASSWORD,
        400,
      );
    }

    const pool = getPool();

    // ======================================
    // CHECK EXISTING USER
    // ======================================

    const existingUser = await pool
      .request()
      .input("vat_number", sql.NVarChar, vat_number)
      .input("email", sql.NVarChar, email).query(`
        SELECT id
        FROM users
        WHERE vat_number = @vat_number
           OR email = @email
      `);

    if (existingUser.recordset.length > 0) {
      throw new AppError(
        "User already exists",
        ERROR_CODES.USER_ALREADY_EXISTS,
        409,
      );
    }

    // ======================================
    // HASH PASSWORD
    // ======================================

    const password_hash = await bcrypt.hash(password, 10);

    // ======================================
    // INSERT USER
    // ======================================

    const result = await pool
      .request()
      .input("vat_number", sql.NVarChar, vat_number)
      .input("email", sql.NVarChar, email)
      .input("password_hash", sql.NVarChar, password_hash)
      .input("name", sql.NVarChar, name)
      .input("is_from_partner", sql.Bit, is_from_partner)
      .input("partner_vat", sql.NVarChar, partner_vat)
      .input("partner_name", sql.NVarChar, partner_name).query(`
        INSERT INTO users (
          vat_number,
          email,
          password_hash,
          role,
          name,
          is_from_partner,
          partner_vat,
          partner_name
        )
        OUTPUT
          inserted.id,
          inserted.vat_number,
          inserted.email,
          inserted.role,
          inserted.name,
          inserted.is_from_partner,
          inserted.partner_vat,
          inserted.partner_name,
          inserted.created_at
        VALUES (
          @vat_number,
          @email,
          @password_hash,
          'customer',
          @name,
          @is_from_partner,
          @partner_vat,
          @partner_name
        );
      `);

    return result.recordset[0];
  } catch (err) {
    console.error("REGISTER USER ERROR:", err);

    if (err instanceof AppError) {
      throw err;
    }

    throw new AppError(
      "Internal server error",
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      500,
    );
  }
}

// ======================================
// LOGIN USER
// ======================================

async function loginUser(body) {
  try {
    let { vat_number, password } = body;

    // ======================================
    // REQUIRED FIELDS
    // ======================================

    if (!vat_number || !password) {
      throw new AppError(
        "vat_number and password are required",
        ERROR_CODES.INVALID_CREDENTIALS,
        400,
      );
    }

    // ======================================
    // NORMALIZE VAT
    // ======================================

    vat_number = vat_number.replace(/\D/g, "");

    const pool = getPool();

    // ======================================
    // FIND USER
    // ======================================

    const result = await pool.request().input("vat", sql.NVarChar, vat_number)
      .query(`
        SELECT
          id,
          vat_number,
          email,
          password_hash,
          is_active,
          active_until,
          CASE
            WHEN role = 'user' THEN 'customer'
            ELSE role
          END AS role,
          name
        FROM users
        WHERE vat_number = @vat
      `);

    const user = result.recordset[0];

    // ======================================
    // USER NOT FOUND
    // ======================================

    if (!user) {
      throw new AppError(
        "Invalid credentials",
        ERROR_CODES.INVALID_CREDENTIALS,
        401,
      );
    }

    // ======================================
    // PASSWORD CHECK
    // ======================================

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      throw new AppError(
        "Invalid credentials",
        ERROR_CODES.INVALID_CREDENTIALS,
        401,
      );
    }

    // ======================================
    // SUBCRIPTION CHECK
    // ======================================

    syncUserSubscription(user);
    validateActiveUser(user);

    // ======================================
    // GENERATE TOKEN
    // ======================================

    const token = jwt.sign(
      {
        userId: user.id,
        role: normalizeRole(user.role),
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );

    // ======================================
    // SUCCESS RESPONSE
    // ======================================

    return {
      token,
      user: {
        id: user.id,
        vat_number: user.vat_number,
        email: user.email,
        role: normalizeRole(user.role),
        name: user.name,
      },
    };
  } catch (err) {
    console.error("LOGIN USER ERROR:", err);

    if (err instanceof AppError) {
      throw err;
    }

    throw new AppError(
      "Internal server error",
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      500,
    );
  }
}

// ======================================
// GET USERS
// ======================================

async function getUsers(filters, currentUser) {
  const pool = getPool();

  const request = pool.request();

  if (currentUser.role === "customer") {
    throw new AppError("Access denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  const whereClause = buildUserFilters(filters, request);

  const query = `
    SELECT DISTINCT
        u.id,
        u.vat_number,
        u.email,
        u.role,
        u.name,
        u.is_from_partner,
        u.partner_vat,
        u.partner_name,
        u.created_at
    FROM users u
    LEFT JOIN properties p
        ON p.user_id = u.id

    ${whereClause}
    `;

  const countQuery = `
    SELECT COUNT(DISTINCT u.id) AS total
    FROM users u
    LEFT JOIN properties p
        ON p.user_id = u.id

    ${whereClause}
    `;

  const { page, pageSize, offset } = getPagination(filters);

  const finalQuery = `
        ${query}

        ORDER BY u.created_at DESC

        OFFSET @offset ROWS
        FETCH NEXT @pageSize ROWS ONLY
        `;

  request.input("offset", sql.Int, offset);

  request.input("pageSize", sql.Int, pageSize);

  const countRequest = pool.request();

  buildUserFilters(filters, countRequest);

  const totalResult = await countRequest.query(countQuery);

  const total = totalResult.recordset[0].total;

  const result = await request.query(finalQuery);

  return {
    users: result.recordset,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// ======================================
// GET USER BY ID
// ======================================
async function getUserById(id, currentUser) {
  const pool = getPool();

  const result = await pool.request().input("id", sql.UniqueIdentifier, id)
    .query(`
      SELECT
        u.id,
        u.vat_number,
        u.email,
        CASE
          WHEN u.role = 'user' THEN 'customer'
          ELSE u.role
        END AS role,
        u.name,
        u.is_from_partner,
        u.partner_vat,
        u.partner_name,
        u.created_at
      FROM users u
      WHERE u.id = @id
        AND u.role NOT IN (
          'admin',
          'superadmin'
        )
    `);

  const user = result.recordset[0];

  if (!user) {
    throw new AppError("User not found", ERROR_CODES.USER_NOT_FOUND, 404);
  }

  if (currentUser.role === "customer" && currentUser.id !== user.id) {
    throw new AppError("Access denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  return user;
}

// ======================================
// GET CURRENT LOGGED-IN USER
// ======================================

// ======================================
// GET CURRENT LOGGED-IN USER
// ======================================

async function getMe(currentUser) {
  const pool = getPool();

  console.log("current user", currentUser);
  console.log("cureent user id ", currentUser.id);
  console.log("type", typeof currentUser.id);
  const result = await pool
    .request()
    .input("userId", sql.UniqueIdentifier, currentUser.id).query(`
      SELECT
        id,
        vat_number,
        email,
        role,
        name,
        is_from_partner,
        partner_vat,
        partner_name,
        is_active,
        active_until,
        created_at
      FROM users
      WHERE id = @userId
    `);

  const user = result.recordset[0];

  if (!user) {
    throw new AppError("User not found", ERROR_CODES.USER_NOT_FOUND, 404);
  }

  return user;
}

// ======================================
// UPDATE USER
// ======================================
// SUPERADMIN CAN CHANGE ANYTHING
// ADMIN CAN CHANGE NAME,EMAIL,PASSWORD,IS_FROM_PARTNER,PARTNER_VAT,PARTNER_NAME
// USER CAN  CHANGE NAME,EMAIL,PASSWORD

async function updateUser(targetUserId, body, currentUser) {
  body = body || {};

  const pool = getPool();

  const existingUser = await pool
    .request()
    .input("userId", sql.UniqueIdentifier, targetUserId)
    .query(` SELECT * FROM users WHERE id = @userId `);

  const user = existingUser.recordset[0];

  if (!user) {
    throw new AppError("User not found", ERROR_CODES.USER_NOT_FOUND, 404);
  }

  await syncUserSubscription(currentUser);
  validateActiveUser(currentUser);

  //USER
  if (currentUser.role === "customer" && currentUser.id !== targetUserId) {
    throw new AppError("Access denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  const updates = {};
  if (currentUser.role === "customer") {
    validateActiveUser(user);
  }
  if (body.name !== undefined) {
    updates.name = body.name;
  }

  if (body.email !== undefined) {
    updates.email = body.email;
  }

  if (body.password) {
    updates.password_hash = await bcrypt.hash(body.password, 10);
  }

  //ADMIN
  if (currentUser.role === "admin" || currentUser.role === "superadmin") {
    if (body.is_from_partner !== undefined) {
      updates.is_from_partner = body.is_from_partner;
    }

    if (body.partner_vat !== undefined) {
      updates.partner_vat = body.partner_vat;
    }

    if (body.partner_name !== undefined) {
      updates.partner_name = body.partner_name;
    }
    if (body.is_active !== undefined) {
      updates.is_active = body.is_active;
    }

    if (body.active_until !== undefined) {
      updates.active_until = body.active_until;
    }
  }

  //SUPERADMIN
  if (currentUser.role === "superadmin") {
    if (body.role !== undefined) {
      updates.role = body.role;
    }

    if (body.vat_number !== undefined) {
      updates.vat_number = body.vat_number;
    }
  }

  if (Object.keys(updates).length === 0) {
    if (
      currentUser.role === "customer" &&
      (body.vat_number !== undefined ||
        body.role !== undefined ||
        body.active_until !== undefined ||
        body.is_active !== undefined ||
        body.partner_name !== undefined ||
        body.partner_vat !== undefined ||
        body.is_from_partner !== undefined)
    ) {
      throw new AppError("Access Denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
    } else {
      throw new AppError(
        "No fields provided",
        ERROR_CODES.NO_FIELDS_TO_UPDATE,
        400,
      );
    }
  }

  const request = pool.request();

  request.input("userId", sql.UniqueIdentifier, targetUserId);

  const setClauses = [];

  for (const [key, value] of Object.entries(updates)) {
    setClauses.push(`${key} = @${key}`);

    addUpdateInput(request, key, value);
  }

  const query = `
    UPDATE users
    SET ${setClauses.join(", ")}

    WHERE id = @userId;

    SELECT *
    FROM users
    WHERE id = @userId;
  `;

  const result = await request.query(query);

  return result.recordset[0];
}

// ======================================
// DELETE USER ****SUPERADMIN**** ONLY
// ======================================
async function deleteUser(userId, currentUser) {
  // Only superadmin
  if (currentUser.role !== "superadmin") {
    throw new AppError("Access Denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  const pool = getPool();

  const result = await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId).query(`
      DELETE FROM users
      OUTPUT deleted.id
      WHERE id = @userId
        AND role NOT IN (
          'admin',
          'superadmin'
        )
    `);

  const deletedUser = result.recordset[0];

  if (!deletedUser) {
    throw new AppError("User not found", ERROR_CODES.USER_NOT_FOUND, 404);
  }

  return deletedUser;
}

module.exports = {
  registerUser,
  loginUser,
  getUsers,
  getUserById,
  getMe,
  updateUser,
  deleteUser,
};

function addUpdateInput(request, key, value) {
  const stringFields = [
    "name",
    "email",
    "vat_number",
    "partner_vat",
    "partner_name",
    "role",
    "password_hash",
  ];

  if (stringFields.includes(key)) {
    request.input(key, sql.NVarChar, value);
    return;
  }

  if (key === "is_from_partner" || key === "is_active") {
    request.input(key, sql.Bit, value);
    return;
  }

  if (key === "active_until") {
    request.input(key, sql.DateTime, value);
    return;
  }
}

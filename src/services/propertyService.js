const { getPool, sql } = require("../config/db");
const AppError = require("../utils/AppError");
const ERROR_CODES = require("../constants/errorCodes");
const { canAccessAll } = require("../utils/access");
const buildPropertiesFilters = require("../utils/buildPropertiesFilters");
const getPagination = require("../utils/pagination");
const {
  validateActiveUser,
  syncUserSubscription,
} = require("../utils/userStatus");
const { getUserById } = require("../services/userService");
const SYNC_STATUS = require("../constants/syncStatus");
const channexPropertyService = require("./channex/channexPropertyService");
const syncLogService = require("./sync/syncLogService");
const { sanitizeProperty } = require("../utils/sanitizeExternalFields");

async function resolveCustomerIdByVat(vat_number) {
  const pool = getPool();

  const result = await pool.request().input("vat", sql.NVarChar, vat_number)
    .query(`
      SELECT
        id,
        name,
        vat_number,
        CASE
          WHEN role = 'user' THEN 'customer'
          ELSE role
        END AS role
      FROM users
      WHERE vat_number = @vat
    `);

  return result.recordset[0];
}

//========================================
//CREATE PROPERTY
//========================================
async function createProperty(data) {
  const { body, currentUser } = data;

  const {
    vat_number,
    name,
    email,
    phone,
    city,
    postal_code,
    address,
    property_type_code,
    max_allowed_rooms,
  } = body;

  // ======================================
  // VALIDATION
  // ======================================

  if (!name) {
    throw new AppError(
      "Property name is required",
      ERROR_CODES.PROPERTY_NAME_REQUIRED,
      400,
    );
  }

  // ======================================
  // EMAIL VALIDATION
  // ======================================
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    throw new AppError("Invalid email format", ERROR_CODES.INVALID_EMAIL, 400);
  }

  console.log(currentUser);
  let currentUserId = currentUser.id;

  // ======================================
  // ADMIN / SUPERADMIN
  // ======================================

  if (canAccessAll(currentUser.role)) {
    if (!vat_number) {
      throw new AppError(
        "vat_number is required",
        ERROR_CODES.INVALID_VAT,
        400,
      );
    }

    const customer = await resolveCustomerIdByVat(vat_number);

    if (!customer) {
      throw new AppError("Customer not found", ERROR_CODES.USER_NOT_FOUND, 404);
    }

    currentUserId = customer.id;
  }

  if (!canAccessAll(currentUser.role) && vat_number) {
    throw new AppError("Access Denied", ERROR_CODES.USER_UNAUTHORIZED, 404);
  }

  // ======================================
  // SUB AND ACTIVE CHECK
  // ======================================
  syncUserSubscription(currentUser);
  validateActiveUser(currentUser);

  let syncLog;
  let channexResult;
  let channexPropertyId;
  let channexProperty;

  try {
    // CREATE PENDING LOG
    syncLog = await syncLogService.createSyncLog({
      entity_type: "property",
      entity_id: null,
      action: "create",
      request_payload: body,
    });

    // SEND TO CHANNEX
    channexResult = await channexPropertyService.createProperty(body);

    channexPropertyId =
      channexResult.response?.data?.id || channexResult.response?.id;

    channexProperty = channexResult.response?.data;

    if (!channexPropertyId) {
      throw new AppError(
        "Channex did not return property id",
        ERROR_CODES.INVALID_PROPERTY_VALUES,
        500,
      );
    }
  } catch (err) {
    if (syncLog) {
      await syncLogService.markFailedChannex(syncLog.id, err);
    }

    throw err;
  }

  try {
    // ======================================
    // INSERT PROPERTY LOCALLY
    // ======================================

    const pool = getPool();

    const result = await pool
      .request()
      .input("userId", sql.UniqueIdentifier, currentUserId)
      .input("name", sql.NVarChar, channexProperty.attributes.title)
      .input("email", sql.NVarChar, channexProperty.attributes.email)
      .input("phone", sql.NVarChar, channexProperty.attributes.phone)
      .input("city", sql.NVarChar, channexProperty.attributes.city || null)
      .input(
        "postal_code",
        sql.NVarChar,
        channexProperty.attributes.zip_code || null,
      )
      .input(
        "address",
        sql.NVarChar,
        channexProperty.attributes.address || null,
      )
      .input("max_allowed_rooms", sql.Int, max_allowed_rooms || 0)
      .input(
        "property_type_code",
        sql.NVarChar,
        channexProperty.attributes.property_type || "hotel",
      )
      .input("channex_property_id", sql.NVarChar, channexPropertyId)
      .input("sync_status", sql.TinyInt, SYNC_STATUS.SYNCED).query(`
        INSERT INTO properties (
          user_id,
          name,
          email,
          phone,
          city,
          postal_code,
          address,
          max_allowed_rooms,
          property_type_code,
          channex_property_id,
          sync_status
        )
        OUTPUT inserted.*
        VALUES (
          @userId,
          @name,
          @email,
          @phone,
          @city,
          @postal_code,
          @address,
          @max_allowed_rooms,
          @property_type_code,
          @channex_property_id,
          @sync_status
        )
      `);

    const property = sanitizeProperty(result.recordset[0], currentUser);

    await syncLogService.markSyncSuccess(syncLog.id, channexResult.response);

    return {
      property,
    };
  } catch (err) {
    await syncLogService.markFailedLocalSave(
      syncLog.id,
      err,
      channexResult.response,
    );

    console.log("LOCAL SAVE ERROR:", err);
    console.log(
      "CHANNEX RESPONSE:",
      JSON.stringify(channexResult.response, null, 2),
    );

    throw new AppError(
      "Property was created externally but local save failed. Recovery is required.",
      ERROR_CODES.PROPERTY_LOCAL_SAVE_FAILED,
      500,
    );
  }
}
//========================================
//GET PROPERTIES
//========================================
async function getProperties(filters, currentUser) {
  const pool = getPool();

  const request = pool.request();

  const whereClause = buildPropertiesFilters(filters, request,currentUser);

  let query = `
  SELECT
      p.id,
      p.name AS property_name,
      p.email,
      p.phone,
      p.city,
      p.postal_code,
      p.address,
      p.max_allowed_rooms,
      p.created_at,
      p.channex_property_id,
      p.sync_status,
      p.property_type_code,

      
      pt.name_en AS property_type_name_en,
      pt.name_el AS property_type_name_el,

      ss.name AS sync_status_name,
      ss.description AS sync_status_description,

      u.id AS user_id,
      u.name AS user_name,
      u.vat_number,
      u.role,
      u.is_from_partner,
      u.partner_vat,
      u.partner_name

    FROM properties p

    INNER JOIN users u
      ON p.user_id = u.id
    INNER JOIN sync_statuses ss
      ON p.sync_status = ss.code
    INNER JOIN property_types pt
      ON p.property_type_code = pt.code

    ${whereClause}
  `;

  let countWhereClause = whereClause;

  if (!canAccessAll(currentUser.role)) {
    countWhereClause += ` AND p.user_id = @userId `;

    request.input("userId", sql.UniqueIdentifier, currentUser.id);

    query += ` AND p.user_id = @userId `;
  }

  const countQuery = `
    SELECT COUNT(*) AS total

    FROM properties p

    INNER JOIN users u
      ON p.user_id = u.id

    ${countWhereClause}
  `;

  const { page, pageSize, offset } = getPagination(filters);

  request.input("offset", sql.Int, offset);

  request.input("pageSize", sql.Int, pageSize);

  const finalQuery = `
    ${query}

    ORDER BY p.created_at DESC

    OFFSET @offset ROWS
    FETCH NEXT @pageSize ROWS ONLY
  `;

  const countRequest = pool.request();

  buildPropertiesFilters(filters, countRequest,currentUser);

  if (!canAccessAll(currentUser.role)) {
    countRequest.input("userId", sql.UniqueIdentifier, currentUser.id);
  }

  const totalResult = await countRequest.query(countQuery);

  const total = totalResult.recordset[0].total;

  const result = await request.query(finalQuery);

  const properties = result.recordset;

  const sanitizedProperties = properties.map((property) =>
    sanitizeProperty(property, currentUser),
  );

  //GET CHANNEX PROPERTIES
  if (filters.include_external === "true" && canAccessAll(currentUser.role)) {
    for (const property of properties) {
      if (!property.channex_property_id) {
        continue;
      }

      property.external = await channexPropertyService.getProperty(
        property.channex_property_id,
      );
    }
  }

  return {
    properties: sanitizedProperties,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}


//========================================
//GET PROPERTY BY ID
//========================================
async function getPropertyById(propertyId, currentUser, options = {}) {
  const pool = getPool();

  let result;

  // ======================================
  // USER
  // ======================================

  if (!canAccessAll(currentUser.role)) {
    result = await pool
      .request()
      .input("propertyId", sql.UniqueIdentifier, propertyId)
      .input("userId", sql.UniqueIdentifier, currentUser.id).query(`
        SELECT p.*,
        ss.name AS sync_status_name,
        ss.description AS sync_status_description,
        pt.name_en AS property_type_name_en,
        pt.name_el AS property_type_name_el
        FROM properties p
        LEFT JOIN sync_statuses ss
          ON p.sync_status = ss.code
        LEFT JOIN property_types pt
          ON p.property_type_code = pt.code
        WHERE p.id = @propertyId
          AND p.user_id = @userId
      `);

    const property = result.recordset[0];

    if (!property) {
      throw new AppError(
        "Property not found",
        ERROR_CODES.PROPERTY_NOT_FOUND,
        404,
      );
    }

    return sanitizeProperty(property, currentUser);
  } else {
    // ======================================
    // ADMIN / SUPERADMIN
    // ======================================

    result = await pool
      .request()
      .input("propertyId", sql.UniqueIdentifier, propertyId).query(`
    SELECT
        p.*,
        c.name AS user_name,
        c.vat_number,
        ss.name AS sync_status_name,
        ss.description AS sync_status_description,
        pt.name_en AS property_type_name_en,
        pt.name_el AS property_type_name_el,
        CASE
          WHEN c.role = 'user' THEN 'customer'
          ELSE c.role
        END AS user_role
      FROM properties p
      LEFT JOIN property_types pt
          ON p.property_type_code = pt.code
      LEFT JOIN sync_statuses ss
        ON p.sync_status = ss.code
      JOIN users c
        ON p.user_id = c.id
      WHERE p.id = @propertyId
    `);
    const property = result.recordset[0];

    if (!property) {
      throw new AppError(
        "Property not found",
        ERROR_CODES.PROPERTY_NOT_FOUND,
        404,
      );
    }

    if (options.include_external === "true" && property.channex_property_id) {
      const channexProperty = await channexPropertyService.getProperty(
        property.channex_property_id,
      );

      return {
        property,
        external: channexProperty,
      };
    }

    return sanitizeProperty(property, currentUser);
  }
}

//========================================
//UPDATE PROPERTY
//========================================
async function updateProperty(propertyId, body, currentUser) {
  const pool = getPool();
  await syncUserSubscription(currentUser);
  validateActiveUser(currentUser);

  // ======================================
  // FIND EXISTING PROPERTY + ACCESS
  // ======================================

  const existingResult = await pool
    .request()
    .input("propertyId", sql.UniqueIdentifier, propertyId).query(`
      SELECT *
      FROM properties
      WHERE id = @propertyId
    `);

  const existingProperty = existingResult.recordset[0];

  if (!existingProperty) {
    throw new AppError(
      "Property not found",
      ERROR_CODES.PROPERTY_NOT_FOUND,
      404,
    );
  }

  if (
    !canAccessAll(currentUser.role) &&
    existingProperty.user_id !== currentUser.id
  ) {
    throw new AppError("Access denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  const fields = [];
  const request = pool.request();

  request.input("propertyId", sql.UniqueIdentifier, propertyId);

  // ======================================
  // OPTIONAL FIELDS
  // ======================================

  if (body.name !== undefined) {
    fields.push("name = @name");

    request.input("name", sql.NVarChar, body.name);
  }

  if (body.email !== undefined) {
    fields.push("email = @email");

    // ======================================
    // EMAIL VALIDATION
    // ======================================
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(body.email)) {
      throw new AppError(
        "Invalid email format",
        ERROR_CODES.INVALID_EMAIL,
        400,
      );
    }

    request.input("email", sql.NVarChar, body.email);
  }

  if (body.phone !== undefined) {
    fields.push("phone = @phone");
    request.input("phone", sql.NVarChar, body.phone);
  }

  if (body.city !== undefined) {
    fields.push("city = @city");
    request.input("city", sql.NVarChar, body.city);
  }

  if (body.property_type_code !== undefined) {
    fields.push("property_type_code = @property_type_code");
    request.input("property_type_code", sql.NVarChar, body.property_type_code);
  }

  if (body.postal_code !== undefined) {
    fields.push("postal_code = @postal_code");
    request.input("postal_code", sql.NVarChar, body.postal_code);
  }

  if (body.address !== undefined) {
    fields.push("address = @address");
    request.input("address", sql.NVarChar, body.address);
  }

  if (body.max_allowed_rooms !== undefined) {
    fields.push("max_allowed_rooms = @max_allowed_rooms");
    request.input("max_allowed_rooms", sql.Int, body.max_allowed_rooms);
  }

  // ======================================
  // NOTHING TO UPDATE
  // ======================================

  if (fields.length === 0) {
    throw new AppError(
      "No fields provided for update",
      ERROR_CODES.INVALID_PROPERTY_UPDATE,
      400,
    );
  }

  // ======================================
  // UPDATE CHANNEX FIRST
  // ======================================

  let syncLog;
  let channexResult = null;

  // ======================================
  // SYNC VALIDATION
  // ======================================
  validateSyncedProperty(existingProperty);

  syncLog = await syncLogService.createSyncLog({
    entity_type: "property",
    entity_id: propertyId,
    action: "update",
    request_payload: body,
  });

  try {
    channexResult = await channexPropertyService.updateProperty(
      existingProperty.channex_property_id,
      body,
    );
  } catch (err) {
    await syncLogService.markFailedChannex(syncLog.id, err);
    throw err;
  }

  let whereClause = ` WHERE id = @propertyId `;

  if (!canAccessAll(currentUser.role)) {
    whereClause += ` AND user_id = @userId`;

    request.input("userId", sql.UniqueIdentifier, currentUser.id);
  }

  // ======================================
  // FINAL QUERY
  // ======================================

  const query = `
    UPDATE properties
    SET
      ${fields.join(", ")}
    OUTPUT inserted.*
    ${whereClause};
  `;

  let result;

  try {
    result = await request.query(query);
  } catch (err) {
    await syncLogService.markFailedLocalSave(
      syncLog.id,
      err,
      channexResult?.response || null,
    );

    throw new AppError(
      "Property was updated externally but local update failed. Recovery is required.",
      ERROR_CODES.PROPERTY_LOCAL_SAVE_FAILED,
      500,
    );
  }

  const updatedProperty = result.recordset[0];

  await syncLogService.markSyncSuccess(
    syncLog.id,
    channexResult?.response || null,
  );

  if (!updatedProperty) {
    throw new AppError(
      "Property not found",
      ERROR_CODES.PROPERTY_NOT_FOUND,
      404,
    );
  }

  return sanitizeProperty(updatedProperty, currentUser);
}

async function deleteProperty(propertyId, currentUser) {
  const pool = getPool();

  let result;

  // ======================================
  // USER
  // ======================================

  await syncUserSubscription(currentUser);
  validateActiveUser(currentUser);

  if (canAccessAll(currentUser.role)) {
    result = await pool
      .request()
      .input("propertyId", sql.UniqueIdentifier, propertyId).query(`
        DELETE FROM properties
        WHERE id = @propertyId;

        SELECT @@ROWCOUNT AS affected;
      `);
  } else {
    throw new AppError("Access Denied", ERROR_CODES.USER_UNAUTHORIZED, 403);
  }

  const affected = result.recordset[0]?.affected || 0;

  if (!affected) {
    throw new AppError(
      "Property not found",
      ERROR_CODES.PROPERTY_NOT_FOUND,
      404,
    );
  }

  return true;
}

module.exports = {
  resolveCustomerIdByVat,
  createProperty,
  getProperties,
  getPropertyById,
  updateProperty,
  deleteProperty,
};

//===================================================================================================================================================
//  H E L P E R S
//===================================================================================================================================================
function validateSyncedProperty(property) {
  if (!property.channex_property_id) {
    throw new AppError(
      "Property is not synced with Channex",
      ERROR_CODES.PROPERTY_NOT_SYNCED,
      409,
    );
  }
}

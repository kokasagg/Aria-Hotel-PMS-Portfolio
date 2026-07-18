const propertyService = require("../services/propertyService");
const { getPool, sql } = require("../config/db");
const { canAccessAll } = require("../utils/access");
const { success, error } = require("../utils/response");
const ERROR_CODES = require("../constants/errorCodes");
const handleError = require("../utils/handleError");

// ======================================
// CREATE PROPERTY
// ======================================

async function createProperty(req, res) {
  try {
    const property = await propertyService.createProperty({
      body: req.body,
      currentUser: req.user,
    });

    return success(res, { property }, "Property created successfully", 201);
  } catch (err) {
    return handleError(res, err);
  }
}

// ======================================
// GET ALL PROPERTIES
// ======================================

async function getProperties(req, res) {
  try {
    const result = await propertyService.getProperties(req.query, {
      ...req.user,
    });

    return success(
      res,
      result,
      result.properties.length
        ? "Properties fetched successfully"
        : "No properties found",
    );
  } catch (err) {
    return handleError(res, err);
  }
}

// ======================================
// GET PROPERTY BY ID
// ======================================

async function getPropertyById(req, res) {
  try {
    const property = await propertyService.getPropertyById(
      req.params.id,
      {
        ...req.user,
      },
      req.query,
    );

    return success(res, { property }, "Property fetched successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

// ======================================
// UPDATE PROPERTY
// ======================================

async function updateProperty(req, res) {
  try {
    const property = await propertyService.updateProperty(
      req.params.id,
      req.body,
      {
        ...req.user,
      },
    );

    return success(res, { property }, "Property updated successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

// ======================================
// DELETE PROPERTY
// ======================================

async function deleteProperty(req, res) {
  try {
    await propertyService.deleteProperty(req.params.id, {
      ...req.user,
    });

    return success(res, {}, "Property deleted successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

// ======================================
// PUBLISH PROPERTY(SEND TO CHANNEX)
// ======================================
async function publishProperty(req, res) {
  try {
    const result = await propertyService.publishProperty(
      req.params.property_id,
      req.user,
    );

    return success(res, result, "Property published successfully");
  } catch (err) {
    return handleError(res, err);
  }
}

// ======================================
// EXPORTS
// ======================================

module.exports = {
  createProperty,
  getProperties,
  getPropertyById,
  updateProperty,
  deleteProperty,
  publishProperty,
};

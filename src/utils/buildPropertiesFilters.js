const { sql } = require("../config/db");
const { canAccessAll } = require("../utils/access");
const AppError = require("../utils/AppError");
const ERROR_CODES = require("../constants/errorCodes");

function buildPropertiesFilters(filters, request,currentUser) {
  let whereClause = ` WHERE u.role NOT IN ('admin','superadmin')`;

  //ID
  if(filters.id){
     if (!canAccessAll(currentUser.role)) {
      throw new AppError(
        "Access denied",
        ERROR_CODES.USER_UNAUTHORIZED,
        403);
    }

    whereClause += ` AND p.id = @id OR p.channex_property_id = @id `

    request.input("id",sql.UniqueIdentifier,`${filters.id}%`);
  }

  //PROPERTY NAME
  if (filters.property_name) {
    whereClause += ` AND p.name LIKE @property_name `;

    request.input("property_name", sql.NVarChar, `${filters.property_name}%`);
  }

  //PROPERTY EMAIL
  if (filters.property_email) {
    whereClause += ` AND p.email LIKE @property_email `;

    request.input("property_email", sql.NVarChar, `${filters.property_email}%`);
  }

  //PROPERTY PHONE
  if (filters.property_phone) {
    whereClause += ` AND p.phone LIKE @property_phone `;

    request.input("property_phone", sql.NVarChar, `${filters.property_phone}%`);
  }

  //CITY
  if (filters.city) {
    whereClause += ` AND p.city LIKE @city `;

    request.input("city", sql.NVarChar, `${filters.city}%`);
  }

  //POSTAL CODE
  if (filters.postal_code) {
    whereClause += ` AND p.postal_code LIKE @postal_code `;

    request.input("postal_code", sql.NVarChar, `${filters.postal_code}%`);
  }

  //MIN ROOMS
  if (filters.min_rooms !== undefined) {
    whereClause += ` AND p.max_allowed_rooms >= @min_rooms `;

    request.input("min_rooms", sql.Int, filters.min_rooms);
  }

  //MAX ROOMS
  if (filters.max_rooms !== undefined) {
    whereClause += ` AND p.max_allowed_rooms <= @max_rooms `;

    request.input("max_rooms", sql.Int, filters.max_rooms);
  }

  //VAT NUMBER
  if (filters.vat_number) {
    whereClause += ` AND u.vat_number LIKE '%'+@vat_number+'%' `;

    request.input("vat_number", sql.NVarChar, filters.vat_number);
  }

  //CUSTOMER NAME
  if (filters.user_name) {
    whereClause += ` AND u.name LIKE @user_name `;

    request.input("user_name", sql.NVarChar, `${filters.user_name}%`);
  }

  //IS FROM PARTNER
  if (filters.is_from_partner !== undefined) {
    whereClause += ` AND u.is_from_partner = @is_from_partner `;

    request.input("is_from_partner", sql.Bit, Number(filters.is_from_partner));
  }

  //PARTNER VAT
  if (filters.partner_vat) {
    whereClause += ` AND u.partner_vat LIKE '%'+@partner_vat+'%' `;

    request.input("partner_vat", sql.NVarChar, filters.partner_vat);
  }

  //PARTNER NAME
  if (filters.partner_name) {
    whereClause += ` AND u.partner_name LIKE @partner_name `;

    request.input("partner_name", sql.NVarChar, `${filters.partner_name}%`);
  }

  //SYNC STATUS
  if (filters.sync_status) {
    whereClause += ` AND p.sync_status = @sync_status `;

    request.input("sync_status", sql.TinyInt, `${filters.sync_status}%`);
  }

  //PROPERTY TYPE
  if (filters.property_type_code) {
    whereClause += ` AND p.property_type_code = @property_type_code  `;

    request.input(
      "property_type_code",
      sql.NVarChar,
      filters.property_type_code,
    );
  }

  //GENERAL SEARCH
  if (filters.search) {
    whereClause += ` AND 
        (p.name LIKE @search
        OR p.city LIKE @search
        OR p.address LIKE @search
        OR u.name LIKE @search
        OR u.vat_number LIKE @search
        OR u.email LIKE @search )`;

    request.input("search", sql.NVarChar, `%${filters.search}%`);
  }

  //CREATED AFTER
  if (filters.created_after) {
    whereClause += ` AND p.created_at >= @created_after `;

    request.input("created_after", sql.DateTime, filters.created_after);
  }

  //CREATED BEFORE
  if (filters.created_before) {
    whereClause += ` AND p.created_at <= @created_before `;

    request.input("created_before", sql.DateTime, filters.created_before);
  }

  return whereClause;
}

module.exports = buildPropertiesFilters;

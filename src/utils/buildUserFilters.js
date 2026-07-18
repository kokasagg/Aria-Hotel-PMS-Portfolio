const { sql } = require("../config/db");

function buildUserFilters(filters, request) {
  let whereClause = `
        WHERE u.role NOT IN ('admin', 'superadmin')
    `;

  // VAT
  if (filters.vat_number) {
    whereClause += ` AND u.vat_number LIKE '%'+@vat_number+'%'`;

    request.input("vat_number", sql.NVarChar, filters.vat_number);
  }

  //NAME
  if (filters.name) {
    whereClause += ` AND u.name LIKE @name `;

    request.input("name", sql.NVarChar, `${filters.name}%`);
  }

  //GET USERS BY ROLE
  if (filters.role) {
    whereClause += ` AND u.role = @role`;

    request.input("role", sql.NVarChar, filters.role);
  }

  //GET USERS WHO ARE FROM PARTNER
  if (filters.is_from_partner !== undefined) {
    whereClause += ` AND u.is_from_partner = @is_from_partner`;

    request.input("is_from_partner", sql.Bit, Number(filters.is_from_partner));
  }

  //GET USERS FROM SPECIFIC PARTNER WITH VAT
  if (filters.partner_vat) {
    //whereClause += ` AND u.partner_vat = @partner_vat`;
    whereClause += ` AND u.partner_vat LIKE '%'+@partner_vat+'%'`;

    request.input("partner_vat", sql.NVarChar, filters.partner_vat);
  }

  //GET USERS FROM SPECIFIC PARTNER WITH NAME
  if (filters.partner_name) {
    whereClause += ` AND u.partner_name LIKE @partner_name`;

    request.input("partner_name", sql.NVarChar, `${filters.partner_name}%`);
  }

  //GET USERS FROM CITY PROPERTY
  if (filters.city) {
    whereClause += ` AND p.city LIKE @city `;

    request.input("city", sql.NVarChar, filters.city);
  }

  //GET USERS WHOSE EMAIL STARTS WITH
  if (filters.email) {
    whereClause += ` AND u.email LIKE @email`;

    request.input("email", sql.NVarChar, `${filters.email}%`);
  }

  if (filters.search) {
    whereClause += ` 
        AND (
        u.name LIKE @search
        OR u.email LIKE @search
        OR u.vat_number LIKE @search
        )
    `;

    request.input("search", sql.NVarChar, `%${filters.search}%`);
  }

  //GET USERS WITH POSTAL CODE
  if (filters.postal_code) {
    whereClause += ` AND p.postal_code = @postal_code`;

    request.input("postal_code", sql.NVarChar, filters.postal_code);
  }

  //GET USERS WITH MINIMUM ROOMS
  if (filters.min_rooms !== undefined) {
    whereClause += ` AND p.max_allowed_rooms >= @min_rooms`;

    request.input("min_rooms", sql.Int, filters.min_rooms);
  }

  //GET USERS WITH MAXIMUM ROOMS
  if (filters.max_rooms !== undefined) {
    whereClause += ` AND p.max_allowed_rooms <= @max_rooms`;

    request.input("max_rooms", sql.Int, filters.max_rooms);
  }

  //GET USERS WITHOUT PROPERTIES
  if (filters.without_properties === "true") {
    whereClause += ` AND p.id IS NULL`;
  }

  //GET USERS CREATED AFTER
  if (filters.created_after) {
    whereClause += ` AND u.created_at >= @created_after`;

    request.input("created_after", sql.DateTime, filters.created_after);
  }

  //GET USERS CREATED BEFORE
  if (filters.created_before) {
    whereClause += ` AND u.created_at <= @created_before`;

    request.input("created_before", sql.DateTime, filters.created_before);
  }

  return whereClause;
}

module.exports = buildUserFilters;

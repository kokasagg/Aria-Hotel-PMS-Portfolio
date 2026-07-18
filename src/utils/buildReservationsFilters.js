const { sql } = require("../config/db");

function buildReservationsFilters(filters, request) {
  let whereClause = `
        WHERE 1 = 1
    `;

  //PROPERTY ID
  if (filters.property_id) {
    whereClause += ` AND r.property_id = @property_id`;
    request.input("property_id", sql.UniqueIdentifier, filters.property_id);
  }

  //ROOM TYPE ID
  if (filters.room_type_id) {
    whereClause += `
            AND EXISTS (
            SELECT 1
            FROM reservation_rooms rr_filter
            WHERE rr_filter.reservation_id = r.id
                AND rr_filter.room_type_id = @room_type_id
            )
        `;

    request.input("room_type_id", sql.UniqueIdentifier, filters.room_type_id);
  }

  //RATE PLAN ID
  if (filters.rate_plan_id) {
    whereClause += `
            AND EXISTS (
            SELECT 1
            FROM reservation_rooms rr_filter
            WHERE rr_filter.reservation_id = r.id
                AND rr_filter.rate_plan_id = @rate_plan_id
            )
        `;

    request.input("rate_plan_id", sql.UniqueIdentifier, filters.rate_plan_id);
  }

  //STATUS
  if (filters.status) {
    whereClause += ` AND r.status = @status`;
    request.input("status", sql.NVarChar, filters.status);
  }

  //GUEST NAME
  if (filters.guest_name) {
    whereClause += ` AND r.guest_name LIKE @guest_name`;
    request.input("guest_name", sql.NVarChar, `${filters.guest_name}%`);
  }

  //GUEST EMAIL
  if (filters.guest_email) {
    whereClause += ` AND r.guest_email LIKE @guest_email`;
    request.input("guest_email", sql.NVarChar, `${filters.guest_email}%`);
  }

  //GUEST PHONE
  if (filters.guest_phone) {
    whereClause += ` AND r.guest_phone LIKE @guest_phone`;
    request.input("guest_phone", sql.NVarChar, `${filters.guest_phone}%`);
  }

  //GUEST VAT NUMBER
  if (filters.guest_vat_number) {
    whereClause += ` AND r.guest_vat_number LIKE @guest_vat_number`;
    request.input(
      "guest_vat_number",
      sql.NVarChar,
      `${filters.guest_vat_number}%`,
    );
  }

  //GUEST COMPANY NAME
  if (filters.guest_company_name) {
    whereClause += ` AND r.guest_company_name LIKE @guest_company_name`;
    request.input(
      "guest_company_name",
      sql.NVarChar,
      `${filters.guest_company_name}%`,
    );
  }

  //SOURCE
  if (filters.source) {
    whereClause += ` AND r.source = @source`;
    request.input("source", sql.NVarChar, filters.source);
  }

  //GUEST TYPE
  if (filters.guest_type !== undefined) {
    whereClause += ` AND r.guest_type = @guest_type`;
    request.input("guest_type", sql.TinyInt, Number(filters.guest_type));
  }

  //GENERAL SEARCH
  if (filters.search) {
    whereClause += `
        AND (
            r.guest_name LIKE @search
            OR r.guest_email LIKE @search
            OR r.guest_phone LIKE @search
            OR r.guest_company_name LIKE @search
            OR r.guest_vat_number LIKE @search
        )
        `;
    request.input("search", sql.NVarChar, `%${filters.search}%`);
  }

  //CHECK IN FROM
  if (filters.check_in_from) {
    whereClause += ` AND r.check_in >= @check_in_from`;
    request.input("check_in_from", sql.Date, new Date(filters.check_in_from));
  }

  //CHECK IN TO
  if (filters.check_in_to) {
    whereClause += ` AND r.check_in <= @check_in_to`;
    request.input("check_in_to", sql.Date, new Date(filters.check_in_to));
  }

  //CHECK OUT FROM
  if (filters.check_out_from) {
    whereClause += ` AND r.check_out >= @check_out_from`;
    request.input("check_out_from", sql.Date, new Date(filters.check_out_from));
  }

  //CHECK OUT TO
  if (filters.check_out_to) {
    whereClause += ` AND r.check_out <= @check_out_to`;
    request.input("check_out_to", sql.Date, new Date(filters.check_out_to));
  }

  return whereClause;
}

module.exports = buildReservationsFilters;

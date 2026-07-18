const sql = require("mssql");
const { canAccessAll } = require("./access");

function buildGuestFilters(filters, request, currentUser) {
  let whereClause = "";

  //===================================================
  // USER RESTRICTION
  //===================================================
  if (!canAccessAll(currentUser.role)) {
    whereClause += `
      AND g.user_id = @user_id
    `;

    request.input("user_id",sql.UniqueIdentifier,currentUser.id);
  }

  //===================================================
  // SEARCH
  //===================================================
  if (filters.search) {
    whereClause += `
      AND (
        g.name LIKE @search
        OR g.email LIKE @search
        OR g.phone LIKE @search
        OR g.vat_number LIKE @search
        OR g.company_name LIKE @search
    `;

    if (canAccessAll(currentUser.role)) {
      whereClause += `
        OR CAST(g.id AS NVARCHAR(36)) = @search_exact
      `;
    }

    whereClause += `
      )
    `;

    request.input("search",sql.NVarChar,`%${filters.search}%`);

    if (canAccessAll(currentUser.role)) {request.input("search_exact",sql.NVarChar,filters.search);
    }
  }

  //===================================================
  // GUEST TYPE
  //===================================================
  if (filters.guest_type) {
    whereClause += `
      AND g.guest_type = @guest_type
    `;

    request.input("guest_type",sql.TinyInt,filters.guest_type);
  }

  //===================================================
  // PROPERTY
  //===================================================
  if (filters.property_id) {
    whereClause += `
      AND EXISTS (
        SELECT 1
        FROM reservation_guests rg
        INNER JOIN reservations r
          ON rg.reservation_id = r.id
        WHERE rg.guest_id = g.id
          AND r.property_id = @property_id
      )
    `;

    request.input("property_id",sql.UniqueIdentifier,filters.property_id);
  }

  //===================================================
  // ROOM TYPE
  //===================================================
  if (filters.room_type_id) {
    whereClause += `
      AND EXISTS (
        SELECT 1
        FROM reservation_guests rg
        INNER JOIN reservation_rooms rr
          ON rg.reservation_id = rr.reservation_id
        WHERE rg.guest_id = g.id
          AND rr.room_type_id = @room_type_id
      )
    `;

    request.input("room_type_id",sql.UniqueIdentifier,filters.room_type_id);
  }

  //===================================================
  // DATE RANGE
  //===================================================
  if (filters.date_from && filters.date_to) {
    whereClause += `
      AND EXISTS (
        SELECT 1
        FROM reservation_guests rg
        INNER JOIN reservations r
          ON rg.reservation_id = r.id
        WHERE rg.guest_id = g.id
          AND r.check_in < @date_to
          AND r.check_out > @date_from
      )
    `;

    request.input("date_from",sql.Date,filters.date_from);

    request.input("date_to",sql.Date,filters.date_to);
  }

  //===================================================
  // HAS VAT
  //===================================================
  if (filters.has_vat === "true") {
    whereClause += `
      AND g.vat_number IS NOT NULL
      AND g.vat_number <> ''
    `;
  }

  //===================================================
  // RESERVATION NUMBER
  //===================================================
  if (filters.reservation_number) {
    whereClause += `
      AND EXISTS (
        SELECT 1
        FROM reservation_guests rg
        INNER JOIN reservations r
          ON rg.reservation_id = r.id
        WHERE rg.guest_id = g.id
          AND r.reservation_number LIKE @reservation_number
      )
    `;

    request.input("reservation_number",sql.NVarChar,`%${filters.reservation_number}%`);
  }

  return whereClause;
}

module.exports = buildGuestFilters;
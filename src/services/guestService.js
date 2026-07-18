const { getPool, sql } = require("../config/db");
const AppError = require("../utils/AppError");
const ERROR_CODES = require("../constants/errorCodes");
const { canAccessAll } = require("../utils/access");
const getPagination = require("../utils/pagination");


// ======================================
// GET GUESTS
// ======================================
async function getGuests(filters, currentUser) {
  const pool = getPool();
  const request = pool.request();

  let whereClause = "WHERE 1 = 1";

  if (!canAccessAll(currentUser.role)) {
    whereClause += " AND g.user_id = @user_id";
    request.input("user_id", sql.UniqueIdentifier, currentUser.id);
  }

  if (filters.search) {
    whereClause += `
      AND (
        g.name LIKE @search
        OR g.email LIKE @search
        OR g.phone LIKE @search
        OR g.vat_number LIKE @search
        OR g.company_name LIKE @search
      )
    `;
    request.input("search", sql.NVarChar, `%${filters.search}%`);
  }

  const { page, pageSize, offset } = getPagination(filters);

  request.input("offset", sql.Int, offset);
  request.input("pageSize", sql.Int, pageSize);

  const result = await request.query(`
    SELECT
      g.*,
      gt.name AS guest_type_name
    FROM guests g
    LEFT JOIN guest_types gt
      ON g.guest_type = gt.code
    ${whereClause}
    ORDER BY g.updated_at DESC
    OFFSET @offset ROWS
    FETCH NEXT @pageSize ROWS ONLY
  `);

  return {
    guests: result.recordset,
    pagination: {
      page,
      pageSize
    }
  };
}

module.exports = {
  getGuests
};
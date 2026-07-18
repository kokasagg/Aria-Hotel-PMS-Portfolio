const jwt = require("jsonwebtoken");
const { getPool, sql } = require("../config/db");
const { normalizeRole } = require("../utils/access");

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header) {
      return res.status(401).json({ error: "No token provided" });
    }

    const parts = header.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({ error: "Invalid token format" });
    }

    const token = parts[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const pool = getPool();

    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, decoded.userId).query(`
        SELECT
          id,
          CASE
            WHEN role = 'user' THEN 'customer'
            ELSE role
          END AS role,
          email,
          is_active,
          name,
          vat_number,
          partner_vat,
          partner_name,
          is_from_partner,
          active_until,
          created_at
        FROM users
        WHERE id = @id
      `);

    const user = result.recordset[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    req.user = {
      ...user,
      role: normalizeRole(user.role),
    };

    next();
  } catch (err) {
    console.error("AUTH ERROR:", err.message);

    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = authenticate;

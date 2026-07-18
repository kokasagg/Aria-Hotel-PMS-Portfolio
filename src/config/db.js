const sql = require("mssql/msnodesqlv8");
require("dotenv").config();

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,

  driver: "msnodesqlv8",

  options: {
    trustedConnection: true,
    trustServerCertificate: true,
  },

  connectionString:
    `Driver={SQL Server Native Client 11.0};` +
    `Server=${process.env.DB_SERVER}\\${process.env.DB_INSTANCE};` +
    `Database=${process.env.DB_NAME};` +
    `Trusted_Connection=yes;`,
};

let pool;

async function connectDB() {
  try {
    pool = await sql.connect(config);

    console.log("Connected to MSSQL");
  } catch (err) {
    console.error("Database connection failed");
    console.error(err);
    throw err;
  }
}

function getPool() {
  return pool;
}

module.exports = {
  connectDB,
  getPool,
  sql,
};

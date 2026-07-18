const { getPool, sql } = require("../../config/db");

async function createSyncLog({
  entity_type,
  entity_id = null,
  action,
  direction = "outbound",
  status = "pending",
  request_payload = null,
}) {
  const pool = getPool();

  const result = await pool
    .request()
    .input("entity_type", sql.NVarChar, entity_type)
    .input("entity_id", sql.UniqueIdentifier, entity_id)
    .input("action", sql.NVarChar, action)
    .input("direction", sql.NVarChar, direction)
    .input("status", sql.NVarChar, status)
    .input(
      "request_payload",
      sql.NVarChar,
      request_payload ? JSON.stringify(request_payload) : null,
    ).query(`
      INSERT INTO sync_logs (
        entity_type,
        entity_id,
        action,
        direction,
        status,
        request_payload
      )
      OUTPUT inserted.*
      VALUES (
        @entity_type,
        @entity_id,
        @action,
        @direction,
        @status,
        @request_payload
      )
    `);

  return result.recordset[0];
}

async function markSyncSuccess(id, response_payload = null) {
  const pool = getPool();

  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input(
      "response_payload",
      sql.NVarChar,
      response_payload ? JSON.stringify(response_payload) : null,
    ).query(`
      UPDATE sync_logs
      SET
        status = 'success',
        response_payload = @response_payload,
        updated_at = GETDATE()
      WHERE id = @id
    `);
}

async function markSyncFailed(id, error) {
  const pool = getPool();

  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input("error_message", sql.NVarChar, error.message || String(error))
    .query(`
      UPDATE sync_logs
      SET
        status = 'failed',
        error_message = @error_message,
        updated_at = GETDATE()
      WHERE id = @id
    `);
}

async function markSyncCompensated(id, response_payload = null) {
  const pool = getPool();

  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input(
      "response_payload",
      sql.NVarChar,
      response_payload ? JSON.stringify(response_payload) : null,
    ).query(`
      UPDATE sync_logs
      SET
        status = 'compensated',
        response_payload = @response_payload,
        updated_at = GETDATE()
      WHERE id = @id
    `);
}

async function markFailedChannex(id, error) {
  const pool = getPool();

  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input("error_message", sql.NVarChar, error.message || String(error))
    .query(`
      UPDATE sync_logs
      SET
        status = 'failed_channex',
        error_message = @error_message,
        updated_at = GETDATE()
      WHERE id = @id
    `);
}

async function markFailedLocalSave(id, error, response_payload = null) {
  const pool = getPool();

  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input("error_message", sql.NVarChar, error.message || String(error))
    .input(
      "response_payload",
      sql.NVarChar,
      response_payload ? JSON.stringify(response_payload) : null,
    ).query(`
      UPDATE sync_logs
      SET
        status = 'failed_local_save',
        error_message = @error_message,
        response_payload = @response_payload,
        updated_at = GETDATE()
      WHERE id = @id
    `);
}

async function markRecovered(id) {
  const pool = getPool();

  await pool.request().input("id", sql.UniqueIdentifier, id).query(`
      UPDATE sync_logs
      SET
        status = 'recovered',
        updated_at = GETDATE()
      WHERE id = @id
    `);
}

module.exports = {
  createSyncLog,
  markSyncSuccess,
  markSyncFailed,
  markSyncCompensated,
  markFailedChannex,
  markFailedLocalSave,
  markRecovered,
};

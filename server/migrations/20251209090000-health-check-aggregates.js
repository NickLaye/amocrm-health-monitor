const { createLogger } = require('../utils/logger');
const { DEFAULT_CLIENT_ID } = require('../config/constants');

const migrationLogger = createLogger('Migration:HealthAggregates');

async function columnExists(db, table, column) {
  const rows = await db.all(`PRAGMA table_info(${table})`);
  return Array.isArray(rows) && rows.some(row => row.name === column);
}

async function ensureColumn(db, table, column, definition) {
  const exists = await columnExists(db, table, column);
  if (!exists) {
    migrationLogger.info(`Adding column ${column} to ${table}`);
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  } else {
    migrationLogger.info(`Column ${column} already exists on ${table}, skipping`);
  }
}

module.exports = {
  async up({ context: db }) {
    migrationLogger.info('Applying health check aggregate migration...');

    await ensureColumn(db, 'health_checks', 'client_id', `TEXT NOT NULL DEFAULT '${DEFAULT_CLIENT_ID}'`);
    await ensureColumn(db, 'health_checks', 'http_status', 'INTEGER');
    await ensureColumn(db, 'health_checks', 'error_code', 'TEXT');
    await ensureColumn(db, 'health_checks', 'error_payload', 'TEXT');

    await db.exec(`
      CREATE TABLE IF NOT EXISTS health_check_aggregates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_start INTEGER NOT NULL,
        resolution TEXT NOT NULL,
        client_id TEXT NOT NULL DEFAULT '${DEFAULT_CLIENT_ID}',
        check_type TEXT NOT NULL,
        avg_response_time REAL,
        p50_response_time REAL,
        p95_response_time REAL,
        p99_response_time REAL,
        min_response_time REAL,
        max_response_time REAL,
        success_count INTEGER DEFAULT 0,
        warning_count INTEGER DEFAULT 0,
        down_count INTEGER DEFAULT 0,
        total_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await ensureColumn(db, 'health_check_aggregates', 'min_response_time', 'REAL');
    await ensureColumn(db, 'health_check_aggregates', 'max_response_time', 'REAL');

    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_health_checks_client
      ON health_checks(client_id, check_type, timestamp)
    `);

    await db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_health_check_aggregates_unique
      ON health_check_aggregates(resolution, client_id, check_type, period_start)
    `);

    migrationLogger.info('Health check aggregate migration applied');
  },

  async down({ context: db }) {
    migrationLogger.warn('Rolling back health check aggregate migration...');

    await db.exec('DROP INDEX IF EXISTS idx_health_check_aggregates_unique');
    await db.exec('DROP INDEX IF EXISTS idx_health_checks_client');
    await db.exec('DROP TABLE IF EXISTS health_check_aggregates');

    migrationLogger.warn('Columns client_id/http_status/error_code/error_payload will remain on health_checks (SQLite does not support drop column)');
  }
};

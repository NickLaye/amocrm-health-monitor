const { createLogger } = require('../utils/logger');
const migrationLogger = createLogger('Migration:InitialSchema');

/**
 * Migration: Initial Schema
 *
 * Creates the initial database schema with health_checks and incidents tables
 * Created: 2025-11-21
 */

module.exports = {
    async up({ context: db }) {
        migrationLogger.info('Creating initial schema...');

        // Health checks table - stores individual check results
        await db.exec(`
      CREATE TABLE IF NOT EXISTS health_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        check_type TEXT NOT NULL,
        status TEXT NOT NULL,
        response_time INTEGER,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // Incidents table - stores downtime incidents
        await db.exec(`
      CREATE TABLE IF NOT EXISTS incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        check_type TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        duration INTEGER,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // Create indices for better query performance
        migrationLogger.info('Creating indices...');

        // Basic indices
        await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_health_checks_timestamp 
      ON health_checks(timestamp)
    `);

        await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_health_checks_type 
      ON health_checks(check_type, timestamp)
    `);

        await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_incidents_type 
      ON incidents(check_type, start_time)
    `);

        // Composite indices for complex queries
        await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_health_checks_type_timestamp_status 
      ON health_checks(check_type, timestamp, status)
    `);

        await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_incidents_open 
      ON incidents(check_type, end_time, start_time)
    `);

        await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_health_checks_response_time 
      ON health_checks(check_type, timestamp, response_time)
    `);

        migrationLogger.info('Initial schema created successfully');
    },

    async down({ context: db }) {
        migrationLogger.info('Dropping initial schema...');

        // Drop indices first
        await db.exec('DROP INDEX IF EXISTS idx_health_checks_response_time');
        await db.exec('DROP INDEX IF EXISTS idx_incidents_open');
        await db.exec('DROP INDEX IF EXISTS idx_health_checks_type_timestamp_status');
        await db.exec('DROP INDEX IF EXISTS idx_incidents_type');
        await db.exec('DROP INDEX IF EXISTS idx_health_checks_type');
        await db.exec('DROP INDEX IF EXISTS idx_health_checks_timestamp');

        // Drop tables
        await db.exec('DROP TABLE IF EXISTS incidents');
        await db.exec('DROP TABLE IF EXISTS health_checks');

        migrationLogger.info('Initial schema dropped');
    }
};

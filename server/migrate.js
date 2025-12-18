/**
 * Database Migration CLI Tool
 * 
 * Usage:
 *   npm run migrate           - Apply pending migrations
 *   npm run migrate:status    - Show migration status  
 *   npm run migrate:rollback  - Rollback last migration
 *   npm run migrate:create <name> - Create new migration
 */

if (!process.env.CONSOLE_LOGS) {
    process.env.CONSOLE_LOGS = 'true';
}

const { Umzug, SequelizeStorage } = require('umzug');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { createLogger } = require('./utils/logger');

const cliLogger = createLogger('MigrationCLI');

const DB_PATH = path.join(__dirname, '..', 'health_checks.db');
const MIGRATIONS_PATH = path.join(__dirname, 'migrations');

// Wrapper to promisify sqlite3 database
class Database {
    constructor(dbPath) {
        this.db = new sqlite3.Database(dbPath);
    }

    exec(sql) {
        return new Promise((resolve, reject) => {
            this.db.exec(sql, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}

// Custom storage using SQLite
class SQLiteStorage {
    constructor(db) {
        this.db = db;
        this._tableName = 'migrations';
    }

    async _ensureTable() {
        await this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this._tableName} (
        name TEXT PRIMARY KEY,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    }

    async logMigration({ name }) {
        await this._ensureTable();
        await this.db.run(
            `INSERT INTO ${this._tableName} (name) VALUES (?)`,
            [name]
        );
    }

    async unlogMigration({ name }) {
        await this._ensureTable();
        await this.db.run(
            `DELETE FROM ${this._tableName} WHERE name = ?`,
            [name]
        );
    }

    async executed() {
        await this._ensureTable();
        const rows = await this.db.all(
            `SELECT name FROM ${this._tableName} ORDER BY executed_at ASC`
        );
        return rows.map(row => row.name);
    }
}

// Initialize database and umzug
const db = new Database(DB_PATH);
const storage = new SQLiteStorage(db);

const umzugLogger = {
    info: (...args) => cliLogger.info(args.join(' ')),
    warn: (...args) => cliLogger.warn(args.join(' ')),
    error: (...args) => cliLogger.error(args.join(' ')),
    debug: (...args) => cliLogger.debug(args.join(' '))
};

const umzug = new Umzug({
    migrations: {
        glob: path.join(MIGRATIONS_PATH, '*.js'),
        resolve: ({ name, path: filepath }) => {
            const migration = require(filepath);
            return {
                name,
                up: async () => migration.up({ context: db }),
                down: async () => migration.down({ context: db })
            };
        }
    },
    context: db,
    storage,
    logger: umzugLogger
});

// CLI Commands
async function runMigrations() {
    cliLogger.info('Running pending migrations...');
    const migrations = await umzug.up();
    if (migrations.length === 0) {
        cliLogger.info('No pending migrations');
    } else {
        cliLogger.info('Migrations applied:');
        migrations.forEach(m => cliLogger.info(`  ✅ ${m.name}`));
    }
}

async function rollbackMigration() {
    cliLogger.info('Rolling back last migration...');
    const migrations = await umzug.down();
    if (migrations.length === 0) {
        cliLogger.info('No migrations to rollback');
    } else {
        migrations.forEach(m => cliLogger.info(`  ↩️  ${m.name}`));
    }
}

async function showStatus() {
    const pending = await umzug.pending();
    const executed = await umzug.executed();

    cliLogger.info('\n📊 Migration Status:\n');

    if (executed.length > 0) {
        cliLogger.info('✅ Executed:');
        executed.forEach(m => cliLogger.info(`   ${m.name}`));
    }

    if (pending.length > 0) {
        cliLogger.info('\n⏳ Pending:');
        pending.forEach(m => cliLogger.info(`   ${m.name}`));
    }

    if (executed.length === 0 && pending.length === 0) {
        cliLogger.info('No migrations found');
    }

    cliLogger.info('');
}

function createMigration(name) {
    if (!name) {
        cliLogger.error('❌ Error: Migration name is required');
        cliLogger.info('Usage: npm run migrate:create <migration-name>');
        process.exit(1);
    }

    const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
    const filename = `${timestamp}-${name}.js`;
    const filepath = path.join(MIGRATIONS_PATH, filename);

    const template = `/**
 * Migration: ${name}
 * 
 * Created: ${new Date().toISOString()}
 */

module.exports = {
  async up({ context: db }) {
    // TODO: Implement migration
    await db.exec(\`
      -- Add your SQL here
    \`);
  },

  async down({ context: db }) {
    // TODO: Implement rollback
    await db.exec(\`
      -- Add rollback SQL here
    \`);
  }
};
`;

    fs.writeFileSync(filepath, template);
    cliLogger.info(`✅ Created migration: ${filename}`);
}

// Main CLI logic
async function main() {
    const command = process.argv[2] || 'up';
    const arg = process.argv[3];

    try {
        switch (command) {
            case 'up':
                await runMigrations();
                break;
            case 'down':
                await rollbackMigration();
                break;
            case 'status':
                await showStatus();
                break;
            case 'create':
                createMigration(arg);
                break;
            default:
                cliLogger.error(`Unknown command: ${command}`);
                cliLogger.info('Available commands: up, down, status, create');
                process.exit(1);
        }
    } catch (error) {
        cliLogger.error('❌ Migration error', error);
        process.exit(1);
    } finally {
        await db.close();
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { umzug, db };

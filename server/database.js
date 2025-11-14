const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { createLogger } = require('./utils/logger');

const DB_PATH = path.join(__dirname, '..', 'health_checks.db');
const logger = createLogger('Database');

class Database {
  constructor() {
    this.db = null;
  }

  initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
          logger.error('Error opening database', err);
          reject(err);
          return;
        }
        logger.info('Connected to SQLite database');
        this.createTables()
          .then(resolve)
          .catch(reject);
      });
    });
  }

  createTables() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Health checks table - stores individual check results
        this.db.run(`
          CREATE TABLE IF NOT EXISTS health_checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            check_type TEXT NOT NULL,
            status TEXT NOT NULL,
            response_time INTEGER,
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            logger.error('Error creating health_checks table', err);
            reject(err);
            return;
          }
        });

        // Incidents table - stores downtime incidents
        this.db.run(`
          CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            check_type TEXT NOT NULL,
            start_time INTEGER NOT NULL,
            end_time INTEGER,
            duration INTEGER,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            logger.error('Error creating incidents table', err);
            reject(err);
            return;
          }
        });

        // Create indices for better query performance
        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_health_checks_timestamp 
          ON health_checks(timestamp)
        `);

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_health_checks_type 
          ON health_checks(check_type, timestamp)
        `);

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_incidents_type 
          ON incidents(check_type, start_time)
        `, (err) => {
          if (err) {
            logger.error('Error creating indices', err);
            reject(err);
          } else {
            logger.info('Database tables created successfully');
            resolve();
          }
        });
      });
    });
  }

  // Insert a health check result
  insertHealthCheck(checkType, status, responseTime, errorMessage = null) {
    return new Promise((resolve, reject) => {
      const timestamp = Date.now();
      this.db.run(
        `INSERT INTO health_checks (timestamp, check_type, status, response_time, error_message) 
         VALUES (?, ?, ?, ?, ?)`,
        [timestamp, checkType, status, responseTime, errorMessage],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID, timestamp });
          }
        }
      );
    });
  }

  // Get health checks for a specific time range
  getHealthChecks(checkType = null, hoursBack = 24) {
    return new Promise((resolve, reject) => {
      const timeThreshold = Date.now() - (hoursBack * 60 * 60 * 1000);
      let query = `
        SELECT * FROM health_checks 
        WHERE timestamp > ?
      `;
      const params = [timeThreshold];

      if (checkType) {
        query += ' AND check_type = ?';
        params.push(checkType);
      }

      query += ' ORDER BY timestamp DESC';

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Get average response time for a check type
  getAverageResponseTime(checkType, hoursBack = 24) {
    return new Promise((resolve, reject) => {
      const timeThreshold = Date.now() - (hoursBack * 60 * 60 * 1000);
      this.db.get(
        `SELECT AVG(response_time) as avg_time, COUNT(*) as count
         FROM health_checks 
         WHERE check_type = ? AND timestamp > ? AND status = 'up'`,
        [checkType, timeThreshold],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            // Convert milliseconds to seconds
            const avgTimeMs = row.avg_time ? parseFloat(row.avg_time) : 0;
            const avgTimeSec = avgTimeMs / 1000;
            resolve({
              average: parseFloat(avgTimeSec.toFixed(3)),
              count: row.count
            });
          }
        }
      );
    });
  }

  // Calculate uptime percentage
  getUptimePercentage(checkType = null, hoursBack = 24) {
    return new Promise((resolve, reject) => {
      const timeThreshold = Date.now() - (hoursBack * 60 * 60 * 1000);
      let query = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) as up_count
        FROM health_checks 
        WHERE timestamp > ?
      `;
      const params = [timeThreshold];

      if (checkType) {
        query += ' AND check_type = ?';
        params.push(checkType);
      }

      this.db.get(query, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          const percentage = row.total > 0 ? (row.up_count / row.total) * 100 : 100;
          resolve({
            percentage: parseFloat(percentage.toFixed(2)),
            total: row.total,
            up: row.up_count,
            down: row.total - row.up_count
          });
        }
      });
    });
  }

  // Insert an incident
  insertIncident(checkType, startTime, details) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO incidents (check_type, start_time, details) 
         VALUES (?, ?, ?)`,
        [checkType, startTime, details],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  // Update incident end time
  updateIncidentEndTime(id, endTime) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE incidents 
         SET end_time = ?, duration = ? - start_time
         WHERE id = ?`,
        [endTime, endTime, id],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  // Get recent incidents
  getIncidents(limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM incidents 
         ORDER BY start_time DESC 
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  // Get open (ongoing) incident for a check type
  getOpenIncident(checkType) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM incidents 
         WHERE check_type = ? AND end_time IS NULL
         ORDER BY start_time DESC 
         LIMIT 1`,
        [checkType],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  // Clean old records (older than 30 days)
  cleanOldRecords() {
    return new Promise((resolve, reject) => {
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      this.db.serialize(() => {
        this.db.run(
          'DELETE FROM health_checks WHERE timestamp < ?',
          [thirtyDaysAgo]
        );
        this.db.run(
          'DELETE FROM incidents WHERE start_time < ?',
          [thirtyDaysAgo],
          (err) => {
            if (err) {
              logger.error('Error cleaning old records', err);
              reject(err);
            } else {
              logger.info('Cleaned old records (older than 30 days)');
              resolve();
            }
          }
        );
      });
    });
  }

  // Get percentile response time
  getPercentileResponseTime(checkType, hours, percentile = 95) {
    return new Promise((resolve, reject) => {
      const since = Date.now() - (hours * 60 * 60 * 1000);
      
      this.db.all(`
        SELECT response_time
        FROM health_checks
        WHERE check_type = ? AND timestamp >= ? AND response_time IS NOT NULL
        ORDER BY response_time ASC
      `, [checkType, since], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (rows.length === 0) {
          resolve({ percentile: percentile, value: null });
          return;
        }
        
        const index = Math.ceil((percentile / 100) * rows.length) - 1;
        resolve({ 
          percentile: percentile, 
          value: rows[index].response_time 
        });
      });
    });
  }

  // Get min/max/median response time
  getResponseTimeStats(checkType, hours) {
    return new Promise((resolve, reject) => {
      const since = Date.now() - (hours * 60 * 60 * 1000);
      
      this.db.all(`
        SELECT 
          MIN(response_time) as min,
          MAX(response_time) as max,
          AVG(response_time) as avg,
          COUNT(*) as count
        FROM health_checks
        WHERE check_type = ? AND timestamp >= ? AND response_time IS NOT NULL
      `, [checkType, since], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Get median separately
        this.db.get(`
          SELECT response_time as median
          FROM health_checks
          WHERE check_type = ? AND timestamp >= ? AND response_time IS NOT NULL
          ORDER BY response_time
          LIMIT 1 OFFSET (
            SELECT COUNT(*) / 2 FROM health_checks
            WHERE check_type = ? AND timestamp >= ? AND response_time IS NOT NULL
          )
        `, [checkType, since, checkType, since], (err2, medianRow) => {
          if (err2) {
            reject(err2);
            return;
          }
          resolve({
            min: rows[0]?.min || null,
            max: rows[0]?.max || null,
            avg: rows[0]?.avg || null,
            median: medianRow?.median || null,
            count: rows[0]?.count || 0
          });
        });
      });
    });
  }

  // Get MTTR (Mean Time To Recovery)
  getMTTR(checkType, hours) {
    return new Promise((resolve, reject) => {
      const since = Date.now() - (hours * 60 * 60 * 1000);
      
      this.db.get(`
        SELECT AVG(duration) as mttr, COUNT(*) as incidents
        FROM incidents
        WHERE check_type = ? AND start_time >= ? AND end_time IS NOT NULL
      `, [checkType, since], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          mttr: row?.mttr || null,
          incidents: row?.incidents || 0
        });
      });
    });
  }

  // Get MTBF (Mean Time Between Failures)
  getMTBF(checkType, hours) {
    return new Promise((resolve, reject) => {
      const since = Date.now() - (hours * 60 * 60 * 1000);
      
      this.db.all(`
        SELECT COUNT(*) as totalIncidents,
               MIN(start_time) as firstIncident,
               MAX(start_time) as lastIncident
        FROM incidents
        WHERE check_type = ? AND start_time >= ?
      `, [checkType, since], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        
        const totalIncidents = rows[0]?.totalIncidents || 0;
        if (totalIncidents < 2) {
          resolve({ mtbf: null, incidents: totalIncidents });
          return;
        }
        
        const timeSpan = rows[0].lastIncident - rows[0].firstIncident;
        const mtbf = timeSpan / (totalIncidents - 1);
        
        resolve({
          mtbf: mtbf,
          incidents: totalIncidents
        });
      });
    });
  }

  // Get checks under threshold
  getChecksUnderThreshold(checkType, hours, threshold) {
    return new Promise((resolve, reject) => {
      const since = Date.now() - (hours * 60 * 60 * 1000);
      
      this.db.get(`
        SELECT COUNT(*) as count
        FROM health_checks
        WHERE check_type = ? AND timestamp >= ? 
          AND response_time < ? AND status = 'up'
      `, [checkType, since, threshold], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row?.count || 0);
      });
    });
  }

  // Get checks in range
  getChecksInRange(checkType, hours, min, max) {
    return new Promise((resolve, reject) => {
      const since = Date.now() - (hours * 60 * 60 * 1000);
      
      this.db.get(`
        SELECT COUNT(*) as count
        FROM health_checks
        WHERE check_type = ? AND timestamp >= ? 
          AND response_time >= ? AND response_time < ? AND status = 'up'
      `, [checkType, since, min, max], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row?.count || 0);
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            logger.error('Error closing database', err);
            reject(err);
          } else {
            logger.info('Database connection closed');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = new Database();


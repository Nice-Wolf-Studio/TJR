/**
 * Simple Database Migration System
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const SimpleDatabaseConnection = require('./simple-connection');
const logger = require('../utils/logger');

class SimpleMigrator {
    constructor() {
        this.db = new SimpleDatabaseConnection();
        this.schemaPath = path.join(__dirname, 'schema.sql');
    }

    /**
     * Apply simple schema
     */
    async migrate() {
        try {
            logger.info('🚀 Starting database setup...');

            // Initialize connection
            await this.db.initialize();

            // Check if we need to create the schema
            const needsSchema = await this.needsSchema();

            if (needsSchema) {
                await this.createSchema();
            } else {
                logger.info('✅ Database schema already exists');
            }

            logger.info('🎉 Database setup completed!');
            return true;

        } catch (error) {
            logger.error('❌ Database setup failed:', error);
            throw error;
        } finally {
            await this.db.shutdown();
        }
    }

    /**
     * Check if we need to create the schema
     */
    async needsSchema() {
        try {
            // Try to query the markets table
            await this.db.query('SELECT COUNT(*) FROM markets LIMIT 1');
            return false; // Table exists
        } catch (error) {
            return true; // Table doesn't exist, need schema
        }
    }

    /**
     * Create database schema
     */
    async createSchema() {
        try {
            logger.info('📀 Creating database schema...');

            // Simple schema for quick setup
            const schema = `
-- Markets table
CREATE TABLE IF NOT EXISTS markets (
    id INTEGER PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    timeframe VARCHAR(10) NOT NULL,
    session VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, timeframe)
);

-- Price data table
CREATE TABLE IF NOT EXISTS price_data (
    id INTEGER PRIMARY KEY,
    market_id INTEGER,
    timestamp TIMESTAMP NOT NULL,
    open DECIMAL(20,8) NOT NULL,
    high DECIMAL(20,8) NOT NULL,
    low DECIMAL(20,8) NOT NULL,
    close DECIMAL(20,8) NOT NULL,
    volume DECIMAL(20,8) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (market_id) REFERENCES markets(id)
);

-- Liquidity levels table
CREATE TABLE IF NOT EXISTS liquidity_levels (
    id INTEGER PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    level DECIMAL(20,8) NOT NULL,
    strength DECIMAL(5,2) DEFAULT 0,
    level_type VARCHAR(50),
    session VARCHAR(20),
    timeframe VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User preferences
CREATE TABLE IF NOT EXISTS user_preferences (
    id INTEGER PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL UNIQUE,
    preferred_pairs TEXT,
    alert_thresholds TEXT,
    settings TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Simple setup tracking
CREATE TABLE IF NOT EXISTS setup_info (
    id INTEGER PRIMARY KEY,
    key_name VARCHAR(100) NOT NULL UNIQUE,
    value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert setup marker
INSERT OR IGNORE INTO setup_info (key_name, value) VALUES ('schema_version', '1.0');
INSERT OR IGNORE INTO setup_info (key_name, value) VALUES ('created_at', datetime('now'));
`;

            // Split schema into individual statements and execute
            const statements = schema.split(';').filter(stmt => stmt.trim().length > 0);

            for (const statement of statements) {
                await this.db.query(statement.trim());
            }

            logger.info('✅ Database schema created successfully');

        } catch (error) {
            logger.error('❌ Failed to create schema:', error);
            throw error;
        }
    }
}

// Command line interface
async function main() {
    const migrator = new SimpleMigrator();

    try {
        await migrator.migrate();
        process.exit(0);
    } catch (error) {
        logger.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = SimpleMigrator;
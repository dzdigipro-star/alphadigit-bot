const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Database file path
const dbPath = path.join(__dirname, 'data.db');
const schemaPath = path.join(__dirname, 'schema.sql');

let db = null;

// Initialize database
async function initDatabase() {
    const SQL = await initSqlJs();

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
        console.log('✅ Database loaded from file');

        // Run migrations for new columns
        runMigrations();
    } else {
        db = new SQL.Database();
        // Run schema
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        db.run(schema);
        saveDatabase();
        console.log('✅ Database created and initialized');
    }

    return db;
}

// Run database migrations for new columns
function runMigrations() {
    try {
        // Add expecting_binance_order_id column if missing
        try {
            db.run(`ALTER TABLE customers ADD COLUMN expecting_binance_order_id TEXT`);
            console.log('📦 Migration: Added expecting_binance_order_id column');
        } catch (e) { /* Column already exists */ }

        // Add expecting_binance_amount column if missing
        try {
            db.run(`ALTER TABLE customers ADD COLUMN expecting_binance_amount INTEGER DEFAULT 0`);
            console.log('📦 Migration: Added expecting_binance_amount column');
        } catch (e) { /* Column already exists */ }

        // Add coinpal_order_id column to payments if missing
        try {
            db.run(`ALTER TABLE payments ADD COLUMN coinpal_order_id TEXT`);
            console.log('📦 Migration: Added coinpal_order_id column to payments');
        } catch (e) { /* Column already exists */ }

        saveDatabase();
    } catch (error) {
        console.log('Migrations check completed');
    }
}

// Save database to file
function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }
}

// Auto-save every 30 seconds
setInterval(() => {
    saveDatabase();
}, 30000);

// Save on process exit
process.on('exit', saveDatabase);
process.on('SIGINT', () => {
    saveDatabase();
    process.exit();
});
process.on('SIGTERM', () => {
    saveDatabase();
    process.exit();
});

// Helper function to get settings
function getSetting(key) {
    if (!db) return null;
    const result = db.exec(`SELECT value FROM settings WHERE key = '${key}'`);
    return result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : null;
}

// Helper function to set settings
function setSetting(key, value) {
    if (!db) return;
    db.run(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('${key}', '${value}', datetime('now'))`);
    saveDatabase();
}

// Helper to run query and get results as objects
function query(sql, params = []) {
    if (!db) return [];
    try {
        const stmt = db.prepare(sql);
        if (params.length > 0) {
            stmt.bind(params);
        }
        const results = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            results.push(row);
        }
        stmt.free();
        return results;
    } catch (error) {
        console.error('Query error:', error);
        return [];
    }
}

// Helper to run insert/update and return last insert id
function run(sql, params = []) {
    if (!db) return { lastInsertRowid: 0, changes: 0 };
    try {
        if (params.length > 0) {
            const stmt = db.prepare(sql);
            stmt.bind(params);
            stmt.step();
            stmt.free();
        } else {
            db.run(sql);
        }
        saveDatabase();

        // Get last insert id
        const result = db.exec("SELECT last_insert_rowid() as id");
        const lastInsertRowid = result.length > 0 ? result[0].values[0][0] : 0;

        return { lastInsertRowid, changes: db.getRowsModified() };
    } catch (error) {
        console.error('Run error:', error);
        return { lastInsertRowid: 0, changes: 0 };
    }
}

// Helper to get single row
function get(sql, params = []) {
    const results = query(sql, params);
    return results.length > 0 ? results[0] : null;
}

// Export database and helpers
module.exports = {
    initDatabase,
    getDb: () => db,
    getSetting,
    setSetting,
    query,
    run,
    get,
    saveDatabase
};

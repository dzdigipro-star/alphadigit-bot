const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'schema.sql');

let client = null;

// Initialize database (connect to Turso)
async function initDatabase() {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url || !authToken) {
        console.error('❌ TURSO_DATABASE_URL and TURSO_AUTH_TOKEN required in .env!');
        process.exit(1);
    }

    client = createClient({ url, authToken });
    console.log('✅ Connected to Turso database');

    // Check if tables exist, if not run schema
    try {
        await client.execute("SELECT 1 FROM settings LIMIT 1");
        console.log('✅ Database tables exist');

        // Run migrations for new columns
        await runMigrations();
    } catch (e) {
        // Tables don't exist - run schema
        console.log('📦 Creating database tables...');
        const schema = fs.readFileSync(schemaPath, 'utf-8');

        // Split schema into individual statements and execute each
        const statements = schema
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const stmt of statements) {
            try {
                await client.execute(stmt);
            } catch (err) {
                console.log('Schema statement note:', err.message);
            }
        }
        console.log('✅ Database tables created');
    }

    return client;
}

// Run database migrations for new columns
async function runMigrations() {
    const migrations = [
        { sql: `ALTER TABLE customers ADD COLUMN expecting_binance_order_id TEXT`, name: 'expecting_binance_order_id' },
        { sql: `ALTER TABLE customers ADD COLUMN expecting_binance_amount INTEGER DEFAULT 0`, name: 'expecting_binance_amount' },
        { sql: `ALTER TABLE payments ADD COLUMN coinpal_order_id TEXT`, name: 'coinpal_order_id' },
    ];

    for (const m of migrations) {
        try {
            await client.execute(m.sql);
            console.log(`📦 Migration: Added ${m.name} column`);
        } catch (e) { /* Column already exists */ }
    }
}

// No-op: Turso auto-persists
function saveDatabase() {
    // No-op - Turso handles persistence automatically
}

// Helper function to get settings
async function getSetting(key) {
    if (!client) return null;
    try {
        const result = await client.execute({
            sql: 'SELECT value FROM settings WHERE key = ?',
            args: [key]
        });
        return result.rows.length > 0 ? result.rows[0].value : null;
    } catch (error) {
        console.error('getSetting error:', error);
        return null;
    }
}

// Helper function to set settings
async function setSetting(key, value) {
    if (!client) return;
    try {
        await client.execute({
            sql: `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
            args: [key, value]
        });
    } catch (error) {
        console.error('setSetting error:', error);
    }
}

// Helper to run query and get results as objects
async function query(sql, params = []) {
    if (!client) return [];
    try {
        const result = await client.execute({
            sql: sql,
            args: params
        });
        // Convert rows to plain objects
        return result.rows.map(row => {
            const obj = {};
            for (const key of Object.keys(row)) {
                // Skip numeric indices, only keep named columns
                if (isNaN(key)) {
                    obj[key] = row[key];
                }
            }
            return obj;
        });
    } catch (error) {
        console.error('Query error:', error);
        return [];
    }
}

// Helper to run insert/update and return last insert id
async function run(sql, params = []) {
    if (!client) return { lastInsertRowid: 0, changes: 0 };
    try {
        const result = await client.execute({
            sql: sql,
            args: params
        });
        return {
            lastInsertRowid: Number(result.lastInsertRowid || 0),
            changes: result.rowsAffected || 0
        };
    } catch (error) {
        console.error('Run error:', error);
        return { lastInsertRowid: 0, changes: 0 };
    }
}

// Helper to get single row
async function get(sql, params = []) {
    const results = await query(sql, params);
    return results.length > 0 ? results[0] : null;
}

// Export database and helpers
module.exports = {
    initDatabase,
    getDb: () => client,
    getSetting,
    setSetting,
    query,
    run,
    get,
    saveDatabase
};

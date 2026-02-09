require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase, getSetting } = require('./database');
const { createBot, startBroadcastSender } = require('./bot');
const apiRoutes = require('./api');

const app = express();
const PORT = process.env.PORT || 3000;

// Dashboard credentials - username from env, password from database or env
const ADMIN_USER = process.env.ADMIN_USER || 'admin';

// Basic Auth Middleware for Dashboard
function basicAuth(req, res, next) {
    // Skip auth for health check
    if (req.path === '/health') return next();

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.set('WWW-Authenticate', 'Basic realm="Dashboard"');
        return res.status(401).send('Authentication required');
    }

    const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
    const [username, password] = credentials.split(':');

    // Get password from database settings, fallback to env, then default
    const storedPassword = getSetting('admin_password') || process.env.ADMIN_PASS || 'changeme123';

    if (username === ADMIN_USER && password === storedPassword) {
        return next();
    }

    res.set('WWW-Authenticate', 'Basic realm="Dashboard"');
    return res.status(401).send('Invalid credentials');
}

// Middleware
app.use(cors());
app.use(express.json());

// Apply auth to dashboard and API routes
app.use(basicAuth);
app.use(express.static(path.join(__dirname, 'dashboard')));

// API Routes
app.use('/api', apiRoutes);

// Dashboard routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});

app.get('/products', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard', 'products.html'));
});

app.get('/categories', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard', 'categories.html'));
});

app.get('/orders', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard', 'orders.html'));
});

app.get('/customers', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard', 'customers.html'));
});

app.get('/payments', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard', 'payments.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard', 'settings.html'));
});

// Main startup function
async function main() {
    try {
        // Initialize database first
        await initDatabase();

        // Start server
        app.listen(PORT, () => {
            console.log(`\n🚀 AlphaDigit Dashboard running at http://localhost:${PORT}\n`);
        });

        // Start Telegram bot - use .env first (more reliable), then database
        const dbToken = getSetting('bot_token');
        const envToken = process.env.BOT_TOKEN;
        const BOT_TOKEN = envToken || dbToken; // .env takes priority now

        console.log('🔍 Token source:', envToken ? '.env file' : (dbToken ? 'database' : 'NOT FOUND'));
        console.log('🔑 Token prefix:', BOT_TOKEN?.substring(0, 15) || 'NONE');

        if (!BOT_TOKEN) {
            console.error('❌ BOT_TOKEN not found in .env or database!');
            console.log('👉 Add token to .env file or Dashboard Settings');
            return; // Don't exit, just skip bot
        }

        console.log('🔄 Starting Telegram bot...');
        const bot = createBot(BOT_TOKEN);

        try {
            // Add timeout to bot launch (30 seconds)
            const launchPromise = bot.launch({ dropPendingUpdates: true });
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Bot launch timed out after 30s')), 30000)
            );

            await Promise.race([launchPromise, timeoutPromise]);
            console.log('🤖 Telegram Bot is running!\n');
            console.log('📱 Open your bot: https://t.me/Alpha_Digit_bot\n');

            // Start broadcast sender
            startBroadcastSender(bot);
            console.log('📢 Broadcast sender active\n');

            // Graceful shutdown
            process.once('SIGINT', () => bot.stop('SIGINT'));
            process.once('SIGTERM', () => bot.stop('SIGTERM'));
        } catch (botError) {
            console.error('❌ Bot launch failed:', botError.message);
            console.error('Full error:', botError);
        }

    } catch (error) {
        console.error('❌ Failed to start:', error.message);
        console.error('Full error:', error);
    }
}

main();

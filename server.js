require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database');
const { createBot } = require('./bot');
const apiRoutes = require('./api');

const app = express();
const PORT = process.env.PORT || 3000;

// Dashboard credentials from environment variables
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme123';

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

    if (username === ADMIN_USER && password === ADMIN_PASS) {
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
            console.log(`\n🚀 TeleCart Dashboard running at http://localhost:${PORT}\n`);
        });

        // Start Telegram bot
        const BOT_TOKEN = process.env.BOT_TOKEN;

        if (!BOT_TOKEN) {
            console.error('❌ BOT_TOKEN not found in .env file!');
            process.exit(1);
        }

        const bot = createBot(BOT_TOKEN);

        await bot.launch();
        console.log('🤖 Telegram Bot is running!\n');
        console.log('📱 Open your bot: https://t.me/Alpha_Digit_bot\n');

        // Graceful shutdown
        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));

    } catch (error) {
        console.error('❌ Failed to start:', error);
        process.exit(1);
    }
}

main();

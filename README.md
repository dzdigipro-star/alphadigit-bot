# TeleCart - Telegram Bot Shop

A complete Telegram bot shop system with admin dashboard for selling digital products.

![Dashboard](https://img.shields.io/badge/Dashboard-localhost:3000-blue)
![Bot](https://img.shields.io/badge/Bot-@Alpha__Digit__bot-0088cc)

## Features

### 🤖 Telegram Bot
- Browse products by categories and subcategories
- Product details with stock, price, and validity
- Customer wallet/balance system
- Auto-delivery for digital keys
- Manual delivery support
- Stock alerts (low/out of stock)
- Payment via Binance Pay & BaridiMob

### 🖥️ Admin Dashboard
- **Dashboard** - Stats, revenue, recent orders, stock alerts
- **Products** - CRUD operations, key management for auto-delivery
- **Categories** - Hierarchical categories with emojis
- **Orders** - Filter, view details, manual delivery
- **Customers** - Balance management, order history, ban/unban
- **Settings** - Bot config, payment wallets, exchange rate

## Quick Start

### Prerequisites
- Node.js v18+ installed
- Telegram Bot Token from [@BotFather](https://t.me/BotFather)

### Installation

1. **Navigate to project folder:**
   ```bash
   cd C:\Users\aflah\Desktop\telecart-bot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   Edit `.env` file and add your settings:
   ```env
   BOT_TOKEN=your_bot_token_here
   BINANCE_WALLET=your_usdt_wallet
   BARIDIMOB_RIP=your_rip_number
   BARIDIMOB_NAME=your_name
   ```

4. **Start the application:**
   ```bash
   npm start
   ```

5. **Access:**
   - Dashboard: http://localhost:3000
   - Bot: https://t.me/Alpha_Digit_bot

## Project Structure

```
telecart-bot/
├── server.js           # Main entry point
├── .env               # Configuration (keep secret!)
├── package.json
├── bot/
│   └── index.js       # Telegram bot logic
├── database/
│   ├── index.js       # SQLite connection
│   └── schema.sql     # Database schema
├── api/
│   └── index.js       # REST API routes
└── dashboard/
    ├── index.html     # Dashboard
    ├── products.html  # Products management
    ├── categories.html
    ├── orders.html
    ├── customers.html
    ├── settings.html
    ├── css/
    │   └── style.css  # Premium dark theme
    └── js/
        └── app.js     # Dashboard utilities
```

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Start bot, show menu |
| `/browse` | Browse product categories |
| `/balance` | Check wallet balance |
| `/pay` | Payment options |
| `/orders` | View order history |
| `/help` | Help information |

## Payment Flow

### Binance Pay (Crypto)
1. Customer uses `/pay` command
2. Bot shows USDT wallet address
3. Customer sends payment
4. Admin verifies in dashboard
5. Balance credited to customer

### BaridiMob (Algeria)
1. Customer uses `/pay` command
2. Bot shows RIP number and name
3. Customer sends payment via BaridiMob
4. Admin verifies in dashboard
5. Balance credited to customer

## Adding Products

### Auto-Delivery Products
1. Create category in dashboard
2. Add product with delivery type "Auto"
3. Add keys/credentials (one per line)
4. When customer purchases, key is sent automatically

### Manual Delivery Products
1. Create product with delivery type "Manual"
2. Set stock count
3. When customer purchases, you'll see it in Orders
4. Manually deliver and mark as delivered

## Production Deployment

### On VPS (Linux)

1. Upload files to your VPS
2. Install Node.js:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install nodejs
   ```
3. Install PM2 for process management:
   ```bash
   npm install -g pm2
   ```
4. Start the bot:
   ```bash
   pm2 start server.js --name telecart
   pm2 save
   pm2 startup
   ```

### Security Notes
- Never share your `.env` file
- Use HTTPS for production dashboard
- Regularly backup `database/data.db`

## Support

For issues or feature requests, contact the developer.

---

Made with ❤️ for @Alpha_Digit_bot

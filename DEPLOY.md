# AlphaDigit Bot - Deployment Guide

## 🚀 Deploy to Render.com (Free)

### Step 1: Create GitHub Repository

1. Go to [github.com](https://github.com) → Sign in
2. Click **"+"** → **"New repository"**
3. Name: `alphadigit-bot`
4. Keep **Private** for security
5. Click **"Create repository"**

### Step 2: Push Your Code

Open terminal in your project folder and run:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/alphadigit-bot.git
git push -u origin main
```

### Step 3: Deploy on Render

1. Go to [render.com](https://render.com) → Sign up with GitHub
2. Click **"New +"** → **"Web Service"**
3. Connect your `alphadigit-bot` repository
4. Configure:
   - **Name**: `alphadigit-bot`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Click **"Advanced"** → **"Add Environment Variable"**:
   - `BOT_TOKEN` = your Telegram bot token
   - `CRYPTOPAY_TOKEN` = your CryptoPay API token
6. Click **"Create Web Service"**

### Step 4: Access Your Dashboard

Your dashboard URL will be:
```
https://alphadigit-bot.onrender.com
```

## ⚠️ Important Notes

### Free Tier Limitations:
- Service **spins down after 15 min** of inactivity
- **First request** after sleep takes ~30 seconds
- Bot will restart automatically when accessed

### Keep Bot Alive (Optional):
Use a free cron service like [cron-job.org](https://cron-job.org) to ping your URL every 14 minutes.

## 🔧 Environment Variables Needed

| Variable | Description |
|----------|-------------|
| `BOT_TOKEN` | Telegram Bot API Token from @BotFather |
| `CRYPTOPAY_TOKEN` | CryptoPay API Token (optional) |
| `PORT` | Auto-set by Render (don't set manually) |

## 📱 Your Bot Settings

After deployment, go to your dashboard and configure:
- Bot Name
- Binance Pay ID
- Binance API Key & Secret
- Exchange Rate

---

Need help? Contact the developer.

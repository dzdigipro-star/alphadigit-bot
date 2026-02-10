const { Telegraf, Markup } = require('telegraf');
const { getSetting, setSetting, query, run, get, saveDatabase } = require('../database');

// Create bot instance
function createBot(token) {
    const bot = new Telegraf(token);

    // Middleware to ensure user exists in database
    bot.use(async (ctx, next) => {
        if (ctx.from) {
            const telegramId = ctx.from.id.toString();
            let user = await get(`SELECT * FROM customers WHERE telegram_id = ?`, [telegramId]);

            if (!user) {
                await run(`
                    INSERT INTO customers (telegram_id, username, first_name, last_name)
                    VALUES (?, ?, ?, ?)
                `, [
                    telegramId,
                    ctx.from.username || null,
                    ctx.from.first_name || null,
                    ctx.from.last_name || null
                ]);
                user = await get(`SELECT * FROM customers WHERE telegram_id = ?`, [telegramId]);
            } else {
                // Update last active
                await run(`UPDATE customers SET last_active = datetime('now') WHERE telegram_id = ?`, [telegramId]);
            }

            ctx.customer = user;
        }
        return next();
    });

    // /start command
    bot.command('start', async (ctx) => {
        await showMainMenu(ctx);
    });

    // /browse command - Show main categories
    bot.command('browse', async (ctx) => {
        await showCategories(ctx);
    });

    bot.hears('🛍️ Browse Products', async (ctx) => {
        await showCategories(ctx);
    });

    // /balance command
    bot.command('balance', async (ctx) => {
        await showBalance(ctx);
    });

    bot.hears('💰 My Balance', async (ctx) => {
        await showBalance(ctx);
    });

    // /orders command
    bot.command('orders', async (ctx) => {
        await showOrders(ctx);
    });

    bot.hears('📦 My Orders', async (ctx) => {
        await showOrders(ctx);
    });

    // /pay command
    bot.command('pay', async (ctx) => {
        await showPaymentOptions(ctx);
    });

    bot.hears('💳 Add Funds', async (ctx) => {
        await showPaymentOptions(ctx);
    });

    // /help command
    bot.command('help', async (ctx) => {
        await ctx.reply(
            `❓ *Help & Commands*\n\n` +
            `/start - Start the bot\n` +
            `/browse - Browse all products\n` +
            `/balance - Check your balance\n` +
            `/pay - Add funds to your account\n` +
            `/orders - View your orders\n` +
            `/help - Show this help message\n\n` +
            `For support, contact the admin @seven_alfa .`,
            { parse_mode: 'Markdown' }
        );
    });

    bot.hears('❓ Help', async (ctx) => {
        await ctx.reply(
            `❓ *Help & Commands*\n\n` +
            `/start - Start the bot\n` +
            `/browse - Browse all products\n` +
            `/balance - Check your balance\n` +
            `/pay - Add funds to your account\n` +
            `/orders - View your orders\n` +
            `/help - Show this help message\n\n` +
            `For support, contact the admin: @seven_alfa .`,
            { parse_mode: 'Markdown' }
        );
    });

    // Handle text messages for custom amount and Binance Order ID
    bot.on('text', async (ctx) => {
        const text = ctx.message.text.trim();

        // Refresh customer data from database to get latest flags
        if (ctx.customer) {
            ctx.customer = await get(`SELECT * FROM customers WHERE id = ?`, [ctx.customer.id]);
        }

        // Check if user is expecting to enter Binance Order ID
        if (ctx.customer && ctx.customer.expecting_binance_order_id) {
            await verifyBinanceOrderId(ctx, text);
            return;
        }

        // Check if user is expecting to enter custom Binance amount
        if (ctx.customer && ctx.customer.expecting_binance_amount) {
            // Clear the flag
            await run(`UPDATE customers SET expecting_binance_amount = 0 WHERE id = ?`, [ctx.customer.id]);
            ctx.customer.expecting_binance_amount = 0;
            saveDatabase();

            if (/^\d+(\.\d{1,2})?$/.test(text)) {
                const amount = parseFloat(text);
                if (amount >= 1 && amount <= 10000) {
                    await handleBinancePayment(ctx, amount);
                } else {
                    await ctx.reply(`❌ Amount must be between $1 and $10,000`);
                }
            } else {
                await ctx.reply(`❌ Invalid amount. Please enter a number like 15 or 25.50`);
            }
            return;
        }

        // Check if user is entering a custom payment amount (just a number) for CryptoPay
        // Only process if no special flags are set
        if (/^\d+(\.\d{1,2})?$/.test(text)) {
            const amount = parseFloat(text);

            if (amount >= 1 && amount <= 10000) {
                // Valid amount - process crypto payment
                await handleCryptoPayment(ctx, amount);
            } else if (amount > 0 && amount < 1) {
                await ctx.reply(`❌ Minimum amount is $1.00`);
            } else if (amount > 10000) {
                await ctx.reply(`❌ Maximum amount is $10,000`);
            }
        }
    });

    // Callback query handlers
    bot.on('callback_query', async (ctx) => {
        const data = ctx.callbackQuery.data;

        try {
            if (data === 'main_menu') {
                await showMainMenu(ctx, true);
            } else if (data === 'browse') {
                await showCategories(ctx, true);
            } else if (data.startsWith('cat_')) {
                const categoryId = parseInt(data.split('_')[1]);
                await showSubcategoriesOrProducts(ctx, categoryId);
            } else if (data.startsWith('prod_')) {
                const productId = parseInt(data.split('_')[1]);
                await showProductDetails(ctx, productId);
            } else if (data.startsWith('buy_')) {
                const productId = parseInt(data.split('_')[1]);
                await handlePurchase(ctx, productId);
            } else if (data === 'back_categories') {
                await showCategories(ctx, true);
            } else if (data.startsWith('back_cat_')) {
                const parentId = parseInt(data.split('_')[2]);
                await showSubcategoriesOrProducts(ctx, parentId, true);
            } else if (data === 'add_funds') {
                await showPaymentOptions(ctx, true);
            } else if (data === 'pay_crypto') {
                await showCryptoPayment(ctx);
            } else if (data === 'pay_baridimob') {
                await showBaridimobPayment(ctx);
            } else if (data === 'my_balance') {
                await showBalance(ctx, true);
            } else if (data === 'my_orders') {
                await showOrders(ctx, true);
            } else if (data.startsWith('pay_amount_')) {
                const amount = parseInt(data.split('_')[2]);
                await handleCryptoPayment(ctx, amount);
            } else if (data === 'pay_custom') {
                await showCustomAmountPrompt(ctx);
            } else if (data.startsWith('check_crypto_')) {
                const invoiceId = data.split('_')[2];
                await checkCryptoPaymentStatus(ctx, invoiceId);
            } else if (data === 'pay_binance') {
                await showBinancePayAmounts(ctx);
            } else if (data.startsWith('binance_amount_')) {
                const amount = parseInt(data.split('_')[2]);
                await handleBinancePayment(ctx, amount);
            } else if (data === 'binance_custom') {
                await showBinanceCustomPrompt(ctx);
            } else if (data.startsWith('verify_binance_')) {
                const refId = data.replace('verify_binance_', '');
                await showBinanceVerifyPrompt(ctx, refId);
            }

            await ctx.answerCbQuery();
        } catch (error) {
            console.error('Callback error:', error);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    return bot;
}

// Get currency symbol and info
async function getCurrencyInfo() {
    const currency = (await getSetting('store_currency')) || 'USD';
    return {
        code: currency,
        symbol: currency === 'USD' ? '$' : 'DA',
        name: currency === 'USD' ? 'USD' : 'DZD'
    };
}

// Show main menu with keyboard
async function showMainMenu(ctx, isEdit = false) {
    const welcomeMessage = (await getSetting('welcome_message')) || 'Welcome to our store! 🛒';
    const botName = (await getSetting('bot_name')) || 'AlphaDigit';

    const message = `🛒 *${botName}*\n\n${welcomeMessage}`;
    const keyboard = Markup.keyboard([
        ['🛍️ Browse Products', '💰 My Balance'],
        ['📦 My Orders', '💳 Add Funds'],
        ['❓ Help']
    ]).resize();

    if (isEdit) {
        await ctx.editMessageText(message, { parse_mode: 'Markdown' });
    } else {
        await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard });
    }
}

// Show main categories
async function showCategories(ctx, isEdit = false) {
    const categories = await query(`
        SELECT c.*, 
            (SELECT COUNT(*) FROM categories WHERE parent_id = c.id) as subcategory_count,
            (SELECT COUNT(*) FROM products WHERE category_id = c.id AND is_active = 1) as product_count
        FROM categories c 
        WHERE c.parent_id IS NULL AND c.is_active = 1 
        ORDER BY c.sort_order, c.name
    `);

    if (categories.length === 0) {
        const buttons = [[Markup.button.callback('⬅️ Back to Menu', 'main_menu')]];
        const message = '📂 No categories available yet.\n\nCheck back later!';
        if (isEdit) {
            await ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
        } else {
            await ctx.reply(message, Markup.inlineKeyboard(buttons));
        }
        return;
    }

    const buttons = categories.map(cat => {
        const label = `${cat.emoji || '📁'} ${cat.name}`;
        return [Markup.button.callback(label, `cat_${cat.id}`)];
    });

    // Add back button
    buttons.push([Markup.button.callback('⬅️ Back to Menu', 'main_menu')]);

    const message = '📂 *Select a category:*';
    const keyboard = Markup.inlineKeyboard(buttons);

    if (isEdit) {
        await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
    } else {
        await ctx.reply(message, { parse_mode: 'Markdown', ...keyboard });
    }
}

// Show subcategories or products
async function showSubcategoriesOrProducts(ctx, categoryId, isEdit = true) {
    const category = await get(`SELECT * FROM categories WHERE id = ?`, [categoryId]);

    if (!category) {
        await ctx.answerCbQuery('Category not found');
        return;
    }

    // Check for subcategories
    const subcategories = await query(`
        SELECT * FROM categories 
        WHERE parent_id = ? AND is_active = 1 
        ORDER BY sort_order, name
    `, [categoryId]);

    if (subcategories.length > 0) {
        // Show subcategories
        const buttons = subcategories.map(sub => {
            return [Markup.button.callback(`${sub.emoji || '📁'} ${sub.name}`, `cat_${sub.id}`)];
        });

        // Add back button
        if (category.parent_id) {
            buttons.push([Markup.button.callback('⬅️ Back', `back_cat_${category.parent_id}`)]);
        } else {
            buttons.push([Markup.button.callback('⬅️ Back to Categories', 'back_categories')]);
        }

        const message = `📂 *${category.name}*\n\nSelect a subcategory:`;
        await ctx.editMessageText(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    } else {
        // Show products in this category
        await showProducts(ctx, categoryId, category.parent_id);
    }
}

// Show products in a category
async function showProducts(ctx, categoryId, parentCategoryId) {
    const category = await get(`SELECT * FROM categories WHERE id = ?`, [categoryId]);
    const currency = await getCurrencyInfo();

    const products = await query(`
        SELECT p.*, 
            (SELECT COUNT(*) FROM product_keys pk WHERE pk.product_id = p.id AND pk.is_sold = 0) as available_stock
        FROM products p 
        WHERE p.category_id = ? AND p.is_active = 1 
        ORDER BY p.name
    `, [categoryId]);

    if (products.length === 0) {
        const buttons = [[Markup.button.callback('⬅️ Back', parentCategoryId ? `back_cat_${parentCategoryId}` : 'back_categories')]];
        await ctx.editMessageText('📦 No products available in this category.', Markup.inlineKeyboard(buttons));
        return;
    }

    const buttons = products.map(prod => {
        // For auto-delivery, use available keys as stock
        const stock = prod.delivery_type === 'auto' ? prod.available_stock : prod.stock;
        const stockText = stock > 0 ? `(${stock})` : '🚫';
        const price = currency.code === 'USD' ? prod.price_usd : prod.price_dzd;
        return [Markup.button.callback(`${prod.name} - ${currency.symbol}${price.toFixed(currency.code === 'USD' ? 2 : 0)} ${stockText}`, `prod_${prod.id}`)];
    });

    // Add back button
    if (parentCategoryId) {
        buttons.push([Markup.button.callback('⬅️ Back', `back_cat_${parentCategoryId}`)]);
    } else {
        buttons.push([Markup.button.callback('⬅️ Back to Categories', 'back_categories')]);
    }

    const message = `🛍️ *${category ? category.name : 'Products'}*\n\nSelect a product to view details:`;
    await ctx.editMessageText(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
}

// Show product details
async function showProductDetails(ctx, productId) {
    const currency = await getCurrencyInfo();

    const product = await get(`
        SELECT p.*, c.name as category_name,
            (SELECT COUNT(*) FROM product_keys pk WHERE pk.product_id = p.id AND pk.is_sold = 0) as available_stock
        FROM products p 
        JOIN categories c ON p.category_id = c.id
        WHERE p.id = ?
    `, [productId]);

    if (!product) {
        await ctx.answerCbQuery('Product not found');
        return;
    }

    const stock = product.delivery_type === 'auto' ? product.available_stock : product.stock;
    const price = currency.code === 'USD' ? product.price_usd : product.price_dzd;

    let message = `📦 *${product.name}*\n\n`;

    if (product.description) {
        message += `${product.description}\n\n`;
    }

    message += `💵 Price: *${currency.symbol}${price.toFixed(currency.code === 'USD' ? 2 : 0)}*\n`;

    if (product.validity) {
        message += `⏱️ Validity: ${product.validity}\n`;
    }

    message += `📦 Stock: ${stock > 0 ? `${stock} available` : '🚫 Out of Stock'}\n`;

    if (product.notes) {
        message += `\n📝 *Note:*\n${product.notes}`;
    }

    const buttons = [];

    if (stock > 0) {
        buttons.push([Markup.button.callback(`🛒 Buy ${currency.symbol}${price.toFixed(currency.code === 'USD' ? 2 : 0)}`, `buy_${product.id}`)]);
    }

    buttons.push([Markup.button.callback('⬅️ Back to Products', `cat_${product.category_id}`)]);

    await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
    });
}

// Handle purchase
async function handlePurchase(ctx, productId) {
    const currency = await getCurrencyInfo();

    const product = await get(`
        SELECT p.*,
            (SELECT COUNT(*) FROM product_keys pk WHERE pk.product_id = p.id AND pk.is_sold = 0) as available_stock
        FROM products p WHERE p.id = ?
    `, [productId]);

    if (!product) {
        await ctx.answerCbQuery('Product not found');
        return;
    }

    // Refresh customer data
    ctx.customer = await get(`SELECT * FROM customers WHERE telegram_id = ?`, [ctx.from.id.toString()]);

    const stock = product.delivery_type === 'auto' ? product.available_stock : product.stock;

    if (stock <= 0) {
        await ctx.answerCbQuery('Sorry, this product is out of stock!');
        return;
    }

    const price = currency.code === 'USD' ? product.price_usd : product.price_dzd;
    const balance = currency.code === 'USD' ? ctx.customer.balance_usd : (ctx.customer.balance_dzd || 0);

    // Check customer balance
    if (balance < price) {
        const needed = price - balance;
        await ctx.editMessageText(
            `❌ *Insufficient Balance*\n\n` +
            `Your balance: *${currency.symbol}${balance.toFixed(currency.code === 'USD' ? 2 : 0)}*\n` +
            `Product price: *${currency.symbol}${price.toFixed(currency.code === 'USD' ? 2 : 0)}*\n` +
            `You need: *${currency.symbol}${needed.toFixed(currency.code === 'USD' ? 2 : 0)}* more\n\n` +
            `Tap "Add Funds" to top up your account.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('💳 Add Funds', 'add_funds')],
                    [Markup.button.callback('⬅️ Back', `prod_${productId}`)]
                ])
            }
        );
        return;
    }

    // Process the purchase
    if (product.delivery_type === 'auto') {
        // Get an available key
        const key = await get(`
            SELECT * FROM product_keys 
            WHERE product_id = ? AND is_sold = 0 
            LIMIT 1
        `, [productId]);

        if (!key) {
            await ctx.answerCbQuery('Sorry, no keys available!');
            return;
        }

        // Deduct balance
        if (currency.code === 'USD') {
            await run(`UPDATE customers SET balance_usd = balance_usd - ?, total_spent_usd = total_spent_usd + ? WHERE id = ?`,
                [product.price_usd, product.price_usd, ctx.customer.id]);
        } else {
            await run(`UPDATE customers SET balance_dzd = balance_dzd - ?, total_spent_dzd = total_spent_dzd + ? WHERE id = ?`,
                [product.price_dzd, product.price_dzd, ctx.customer.id]);
        }

        // Mark key as sold
        await run(`UPDATE product_keys SET is_sold = 1, sold_to = ?, sold_at = datetime('now') WHERE id = ?`,
            [ctx.customer.id, key.id]);

        // Create order
        const orderResult = await run(`
            INSERT INTO orders (customer_id, product_id, product_key_id, quantity, total_usd, total_dzd, status, delivery_type, delivered_data)
            VALUES (?, ?, ?, 1, ?, ?, 'delivered', 'auto', ?)
        `, [ctx.customer.id, productId, key.id, product.price_usd, product.price_dzd || 0, key.key_data]);

        const orderId = orderResult.lastInsertRowid;

        // Send the key to customer
        await ctx.editMessageText(
            `✅ *Purchase Successful!*\n\n` +
            `📦 Product: ${product.name}\n` +
            `💵 Paid: ${currency.symbol}${price.toFixed(currency.code === 'USD' ? 2 : 0)}\n` +
            `🔑 Order #${orderId}\n\n` +
            `*Your product:*\n\`\`\`\n${key.key_data}\n\`\`\`\n\n` +
            `Thank you for your purchase! 🎉`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🛍️ Continue Shopping', 'browse')],
                    [Markup.button.callback('📦 My Orders', 'my_orders')]
                ])
            }
        );

        // Check low stock
        const remainingStock = await get(`
            SELECT COUNT(*) as count FROM product_keys WHERE product_id = ? AND is_sold = 0
        `, [productId]);

        if (remainingStock && remainingStock.count <= 3 && remainingStock.count > 0) {
            console.log(`⚠️ Low stock alert: ${product.name} - ${remainingStock.count} remaining`);
        } else if (!remainingStock || remainingStock.count === 0) {
            console.log(`🚫 Out of stock: ${product.name}`);
        }

    } else {
        // Manual delivery
        // Deduct balance
        if (currency.code === 'USD') {
            await run(`UPDATE customers SET balance_usd = balance_usd - ?, total_spent_usd = total_spent_usd + ? WHERE id = ?`,
                [product.price_usd, product.price_usd, ctx.customer.id]);
        } else {
            await run(`UPDATE customers SET balance_dzd = balance_dzd - ?, total_spent_dzd = total_spent_dzd + ? WHERE id = ?`,
                [product.price_dzd, product.price_dzd, ctx.customer.id]);
        }

        // Decrease stock
        await run(`UPDATE products SET stock = stock - 1 WHERE id = ?`, [productId]);

        // Create order (pending manual delivery)
        const orderResult = await run(`
            INSERT INTO orders (customer_id, product_id, quantity, total_usd, total_dzd, status, delivery_type)
            VALUES (?, ?, 1, ?, ?, 'paid', 'manual')
        `, [ctx.customer.id, productId, product.price_usd, product.price_dzd || 0]);

        const orderId = orderResult.lastInsertRowid;

        await ctx.editMessageText(
            `✅ *Order Placed!*\n\n` +
            `📦 Product: ${product.name}\n` +
            `💵 Paid: ${currency.symbol}${price.toFixed(currency.code === 'USD' ? 2 : 0)}\n` +
            `🔑 Order #${orderId}\n\n` +
            `⏳ This product requires manual delivery.\n` +
            `You will receive your product shortly!\n\n` +
            `Thank you for your purchase! 🎉`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🛍️ Continue Shopping', 'browse')],
                    [Markup.button.callback('📦 My Orders', 'my_orders')]
                ])
            }
        );

        console.log(`📦 New manual order #${orderId} - ${product.name} for user ${ctx.customer.telegram_id}`);
    }

    saveDatabase();
}

// Show balance
async function showBalance(ctx, isEdit = false) {
    // Refresh customer data
    ctx.customer = await get(`SELECT * FROM customers WHERE telegram_id = ?`, [ctx.from.id.toString()]);
    const currency = await getCurrencyInfo();

    const balance = currency.code === 'USD' ? ctx.customer.balance_usd : (ctx.customer.balance_dzd || 0);
    const totalSpent = currency.code === 'USD' ? ctx.customer.total_spent_usd : (ctx.customer.total_spent_dzd || 0);

    const message = `💰 *Your Balance*\n\n` +
        `${currency.name}: *${currency.symbol}${balance.toFixed(currency.code === 'USD' ? 2 : 0)}*\n\n` +
        `Total spent: ${currency.symbol}${totalSpent.toFixed(currency.code === 'USD' ? 2 : 0)}`;

    const buttons = [
        [Markup.button.callback('💳 Add Funds', 'add_funds')],
        [Markup.button.callback('⬅️ Back to Menu', 'main_menu')]
    ];

    if (isEdit) {
        await ctx.editMessageText(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    } else {
        await ctx.reply(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    }
}

// Show orders
async function showOrders(ctx, isEdit = false) {
    const currency = await getCurrencyInfo();

    const orders = await query(`
        SELECT o.*, p.name as product_name 
        FROM orders o 
        JOIN products p ON o.product_id = p.id 
        WHERE o.customer_id = ? 
        ORDER BY o.created_at DESC 
        LIMIT 10
    `, [ctx.customer.id]);

    const buttons = [[Markup.button.callback('⬅️ Back to Menu', 'main_menu')]];

    if (orders.length === 0) {
        const message = '📦 You have no orders yet.\n\nUse "Browse Products" to shop!';
        if (isEdit) {
            await ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
        } else {
            await ctx.reply(message, Markup.inlineKeyboard(buttons));
        }
        return;
    }

    let message = '📦 *Your Recent Orders:*\n\n';

    for (const order of orders) {
        const statusEmoji = {
            'pending': '⏳',
            'paid': '💳',
            'delivered': '✅',
            'cancelled': '❌',
            'refunded': '↩️'
        }[order.status] || '❓';

        const total = currency.code === 'USD' ? order.total_usd : order.total_dzd;
        message += `${statusEmoji} #${order.id} - ${order.product_name}\n`;
        message += `   💵 ${currency.symbol}${total.toFixed(currency.code === 'USD' ? 2 : 0)} | ${order.status}\n\n`;
    }

    if (isEdit) {
        await ctx.editMessageText(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    } else {
        await ctx.reply(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    }
}

// Show payment options
async function showPaymentOptions(ctx, isEdit = false) {
    const currency = await getCurrencyInfo();

    let buttons;
    let paymentInfo;

    if (currency.code === 'USD') {
        const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
        const paymentPageUrl = `${dashboardUrl}/pay.html?telegram_id=${ctx.customer.telegram_id}`;
        const isHttps = dashboardUrl.startsWith('https://');

        paymentInfo = '💎 *Crypto* - On-chain payments (USDT, BTC, TON)\n' +
            '💛 *Binance Pay* - Pay with Binance app\n\n' +
            'Choose your preferred method:';

        // Telegram only allows HTTPS URLs for inline buttons
        if (isHttps) {
            buttons = [
                [Markup.button.callback('💎 Pay with Crypto', 'pay_crypto')],
                [Markup.button.url('💛 Binance Pay', paymentPageUrl)],
                [Markup.button.callback('⬅️ Back to Menu', 'main_menu')]
            ];
        } else {
            // For localhost testing, show Binance Pay as callback
            buttons = [
                [Markup.button.callback('💎 Pay with Crypto', 'pay_crypto')],
                [Markup.button.callback('💛 Binance Pay', 'pay_binance')],
                [Markup.button.callback('⬅️ Back to Menu', 'main_menu')]
            ];
        }
    } else {
        paymentInfo = '🏦 *BaridiMob Payment*\n\nPay with BaridiMob for balance top-up.';
        buttons = [
            [Markup.button.callback('🏦 Pay with BaridiMob', 'pay_baridimob')],
            [Markup.button.callback('⬅️ Back to Menu', 'main_menu')]
        ];
    }

    const message = `💳 *Add Funds*\n\n${paymentInfo}`;

    if (isEdit) {
        await ctx.editMessageText(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    } else {
        await ctx.reply(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    }
}

// Show Crypto/CoinPal payment - Amount selection
async function showCryptoPayment(ctx) {
    await ctx.editMessageText(
        `💎 *Crypto Payment*\n\n` +
        `Select the amount you want to add:\n\n` +
        `💵 Choose from preset amounts or tap "Custom" to enter your own.`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('$5', 'pay_amount_5'),
                    Markup.button.callback('$10', 'pay_amount_10'),
                    Markup.button.callback('$20', 'pay_amount_20')
                ],
                [
                    Markup.button.callback('$50', 'pay_amount_50'),
                    Markup.button.callback('$100', 'pay_amount_100')
                ],
                [Markup.button.callback('✏️ Custom Amount', 'pay_custom')],
                [Markup.button.callback('⬅️ Back', 'add_funds')]
            ])
        }
    );
}

// Show custom amount prompt
async function showCustomAmountPrompt(ctx) {
    await ctx.editMessageText(
        `✏️ *Custom Amount*\n\n` +
        `Type the amount you want to add (in USD).\n\n` +
        `Example: \`15\` or \`25.50\`\n\n` +
        `💡 Min: $1 | Max: $10,000`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('⬅️ Back', 'pay_crypto')]
            ])
        }
    );
}

// Show Binance Pay amount selection
async function showBinancePayAmounts(ctx) {
    const binancePayId = await getSetting('binance_pay_id');

    if (!binancePayId) {
        await ctx.editMessageText(
            `❌ *Binance Pay Not Configured*\n\n` +
            `The store owner hasn't set up Binance Pay yet.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back', 'add_funds')]])
            }
        );
        return;
    }

    await ctx.editMessageText(
        `💛 *Binance Pay*\n\n` +
        `Select amount or enter custom:\n` +
        `Pay ID: \`${binancePayId}\``,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('$5', 'binance_amount_5'),
                    Markup.button.callback('$10', 'binance_amount_10'),
                    Markup.button.callback('$20', 'binance_amount_20')
                ],
                [
                    Markup.button.callback('$50', 'binance_amount_50'),
                    Markup.button.callback('$100', 'binance_amount_100')
                ],
                [Markup.button.callback('✏️ Custom Amount', 'binance_custom')],
                [Markup.button.callback('⬅️ Back', 'add_funds')]
            ])
        }
    );
}

// Show Binance Pay custom amount prompt
async function showBinanceCustomPrompt(ctx) {
    // Mark that user is expecting to enter a custom Binance amount
    await run(`UPDATE customers SET expecting_binance_amount = 1 WHERE id = ?`, [ctx.customer.id]);
    saveDatabase();

    await ctx.editMessageText(
        `✏️ *Custom Binance Pay Amount*\n\n` +
        `Type the amount you want to add (in USD).\n\n` +
        `Example: \`15\` or \`25.50\`\n\n` +
        `💡 Min: $1 | Max: $10,000`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('⬅️ Back', 'pay_binance')]
            ])
        }
    );
}

// Handle Binance Pay - Show payment instructions
async function handleBinancePayment(ctx, amount) {
    const binancePayId = await getSetting('binance_pay_id');

    // Check if this is from a text message (custom amount) or callback
    const isTextMessage = ctx.message && ctx.message.text;

    // Helper to send message appropriately
    const sendMsg = async (text, options) => {
        if (isTextMessage) {
            return await ctx.reply(text, options);
        } else {
            return await ctx.editMessageText(text, options);
        }
    };

    if (!binancePayId) {
        await sendMsg(
            `❌ *Binance Pay Not Configured*`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back', 'add_funds')]])
            }
        );
        return;
    }

    // Create pending payment record with reference ID
    const refId = `BP${Date.now()}`;
    await run(`INSERT INTO payments (customer_id, amount_usd, payment_method, coinpal_order_id, status)
         VALUES (?, ?, 'binance', ?, 'pending')`, [ctx.customer.id, amount, refId]);
    saveDatabase();

    await sendMsg(
        `💛 *Binance Pay - $${amount} USDT*\n\n` +
        `📱 *How to pay:*\n` +
        `1️⃣ Open Binance app\n` +
        `2️⃣ Go to Pay → Send\n` +
        `3️⃣ Enter Pay ID: \`${binancePayId}\`\n` +
        `4️⃣ Send exactly *$${amount} USDT*\n\n` +
        `✅ After payment, tap "I've Paid" button`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('✅ I\'ve Paid - Verify', `verify_binance_${refId}`)],
                [Markup.button.callback('❌ Cancel', 'add_funds')]
            ])
        }
    );

    console.log(`💛 Binance Pay pending: ${refId} - $${amount} for customer ${ctx.customer.id}`);
}

// Show verification prompt - ask user for Order ID
async function showBinanceVerifyPrompt(ctx, refId) {
    const payment = await get(`SELECT * FROM payments WHERE coinpal_order_id = ?`, [refId]);

    if (!payment || payment.status !== 'pending') {
        await ctx.editMessageText(
            `❌ *Payment Not Found*\n\n` +
            `This payment has already been processed or doesn't exist.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back', 'main_menu')]])
            }
        );
        return;
    }

    // Store that this user is expecting to enter Order ID
    await run(`UPDATE customers SET expecting_binance_order_id = ? WHERE id = ?`, [refId, ctx.customer.id]);
    saveDatabase();

    await ctx.editMessageText(
        `🔍 *Verify Payment*\n\n` +
        `Amount: *$${payment.amount_usd} USDT*\n\n` +
        `📝 Please type the *Order ID* from your Binance payment.\n\n` +
        `💡 Find it in:\n` +
        `Binance → Pay → Transactions → Your transfer → Order ID`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'add_funds')]])
        }
    );
}

// Verify Binance Order ID - auto-credit or submit for review
async function verifyBinanceOrderId(ctx, orderId) {
    const refId = ctx.customer.expecting_binance_order_id;
    const payment = await get(`SELECT * FROM payments WHERE coinpal_order_id = ? AND status = 'pending'`, [refId]);

    // Clear the expecting flag
    await run(`UPDATE customers SET expecting_binance_order_id = NULL WHERE id = ?`, [ctx.customer.id]);
    ctx.customer.expecting_binance_order_id = null;
    saveDatabase();

    if (!payment) {
        await ctx.reply(`❌ Payment not found. Please try again.`);
        return;
    }

    // SECURITY: Check if this Order ID was already used
    const existingPayment = await get(`SELECT * FROM payments WHERE transaction_hash = ? AND status = 'verified'`, [orderId.trim()]);
    if (existingPayment) {
        await ctx.reply(
            `❌ *Order ID Already Used*\n\n` +
            `This Order ID was already verified on a previous payment.\n` +
            `Please use a new Order ID from a new payment.`,
            { parse_mode: 'Markdown' }
        );
        console.log(`⚠️ Duplicate Order ID attempt: ${orderId} by customer ${ctx.customer.id}`);
        return;
    }

    // Save the Order ID
    await run(`UPDATE payments SET transaction_hash = ? WHERE id = ?`, [orderId.trim(), payment.id]);
    saveDatabase();

    // Try API verification if credentials are configured
    const apiKey = await getSetting('binance_api_key');
    const apiSecret = await getSetting('binance_api_secret');

    if (apiKey && apiSecret) {
        await ctx.reply(`⏳ Verifying payment... Please wait.`);

        try {
            const binance = require('../api/binance');
            console.log(`🔍 Verifying Order ID: ${orderId.trim()} for $${payment.amount_usd}`);

            const result = await binance.verifyPayment({
                apiKey,
                secretKey: apiSecret,
                orderId: orderId.trim(),
                amount: payment.amount_usd
            });

            console.log(`📡 Binance API Result:`, JSON.stringify(result, null, 2));

            if (result.success && result.verified) {
                // Auto-credit balance!
                await run(`UPDATE customers SET balance_usd = balance_usd + ? WHERE id = ?`,
                    [payment.amount_usd, payment.customer_id]);
                await run(`UPDATE payments SET status = 'verified', verified_at = datetime('now') WHERE id = ?`,
                    [payment.id]);
                saveDatabase();

                // Refresh customer data
                ctx.customer = await get(`SELECT * FROM customers WHERE id = ?`, [ctx.customer.id]);

                await ctx.reply(
                    `✅ *Payment Verified!*\n\n` +
                    `Amount: *$${payment.amount_usd} USDT*\n` +
                    `New Balance: *$${ctx.customer.balance_usd.toFixed(2)}*\n\n` +
                    `Thank you! 🎉`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🛍️ Browse Products', 'browse')],
                            [Markup.button.callback('💰 My Balance', 'my_balance')]
                        ])
                    }
                );
                console.log(`✅ Binance Pay verified: ${orderId} - $${payment.amount_usd}`);
                return;
            } else {
                console.log(`❌ Verification failed: ${result.error || 'Not found in transactions'}`);
            }
        } catch (error) {
            console.error('Binance API verification error:', error);
        }
    } else {
        console.log('⚠️ No Binance API credentials configured');
    }

    // Fallback: Submit for manual review
    await ctx.reply(
        `✅ *Order ID Received*\n\n` +
        `Order ID: \`${orderId}\`\n` +
        `Amount: *$${payment.amount_usd} USDT*\n\n` +
        `⏳ An admin will verify and credit your balance shortly.`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('💰 Check Balance', 'my_balance')],
                [Markup.button.callback('⬅️ Back to Menu', 'main_menu')]
            ])
        }
    );
}

// Handle crypto payment - Create CryptoPay invoice and show payment link
async function handleCryptoPayment(ctx, amount) {
    const cryptoPayToken = process.env.CRYPTOPAY_TOKEN;

    // Check if this is from a text message (custom amount) or callback
    const isTextMessage = ctx.message && ctx.message.text;

    // Helper function to send message (reply for text, edit for callback)
    const sendMessage = async (text, options) => {
        if (isTextMessage) {
            return await ctx.reply(text, options);
        } else {
            return await ctx.editMessageText(text, options);
        }
    };

    if (!cryptoPayToken) {
        await sendMessage(
            `❌ *Payment Not Configured*\n\n` +
            `The store owner hasn't configured crypto payments yet.\n` +
            `Please try again later or contact support.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Back', 'pay_crypto')]
                ])
            }
        );
        return;
    }

    // Show loading message
    const loadingMsg = await sendMessage(
        `⏳ *Creating Payment...*\n\n` +
        `Please wait while we generate your payment link.`,
        { parse_mode: 'Markdown' }
    );

    try {
        // Call CryptoPay API to create invoice
        const CryptoPay = require('../api/cryptopay');
        const cryptoPay = new CryptoPay(cryptoPayToken);

        const result = await cryptoPay.createInvoice({
            asset: 'USDT',
            amount: amount,
            description: `Wallet Top-up $${amount}`,
            payload: JSON.stringify({
                customerId: ctx.customer.id,
                telegramId: ctx.customer.telegram_id,
                amount: amount
            }),
            expires_in: 3600 // 1 hour
        });

        // For text messages, we need to edit the loading message we just sent
        const editOrReply = async (text, options) => {
            if (isTextMessage && loadingMsg) {
                try {
                    return await ctx.telegram.editMessageText(
                        ctx.chat.id,
                        loadingMsg.message_id,
                        undefined,
                        text,
                        options
                    );
                } catch (e) {
                    return await ctx.reply(text, options);
                }
            } else {
                return await ctx.editMessageText(text, options);
            }
        };

        if (result.success && result.payUrl) {
            // Save payment record
            await run(`
                INSERT INTO payments (customer_id, amount_usd, payment_method, coinpal_order_id, status)
                VALUES (?, ?, 'cryptopay', ?, 'pending')
            `, [ctx.customer.id, amount, result.invoiceId.toString()]);
            saveDatabase();

            await editOrReply(
                `💎 *Payment Created!*\n\n` +
                `Amount: *$${amount} USDT*\n` +
                `Invoice: \`#${result.invoiceId}\`\n\n` +
                `🔗 Click the button below to pay with crypto.\n\n` +
                `⚠️ *Important:*\n` +
                `• Payment expires in 1 hour\n` +
                `• Send exact amount in USDT\n` +
                `• Balance will be credited automatically`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.url('💳 Pay Now', result.payUrl)],
                        [Markup.button.callback('🔄 Check Status', `check_crypto_${result.invoiceId}`)],
                        [Markup.button.callback('⬅️ Back', 'pay_crypto')]
                    ])
                }
            );

            console.log(`✅ CryptoPay invoice created: #${result.invoiceId} for $${amount} USDT`);
        } else {
            console.error('CryptoPay error:', result.error);
            await editOrReply(
                `❌ *Payment Error*\n\n` +
                `Could not create payment. Please try again.\n\n` +
                `Error: ${result.error || 'Unknown error'}`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🔄 Try Again', 'pay_crypto')],
                        [Markup.button.callback('⬅️ Back to Menu', 'main_menu')]
                    ])
                }
            );
        }
    } catch (error) {
        console.error('Payment creation error:', error);
        await ctx.reply(
            `❌ *Payment Error*\n\n` +
            `An error occurred. Please try again later.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Try Again', 'pay_crypto')],
                    [Markup.button.callback('⬅️ Back to Menu', 'main_menu')]
                ])
            }
        );
    }
}

// Check CryptoPay payment status and credit balance if paid
async function checkCryptoPaymentStatus(ctx, invoiceId) {
    const cryptoPayToken = process.env.CRYPTOPAY_TOKEN;

    try {
        const CryptoPay = require('../api/cryptopay');
        const cryptoPay = new CryptoPay(cryptoPayToken);

        const result = await cryptoPay.getInvoice(parseInt(invoiceId));

        if (!result.success) {
            await ctx.editMessageText(
                `❌ Could not check payment status.\n\nPlease try again.`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🔄 Try Again', `check_crypto_${invoiceId}`)],
                        [Markup.button.callback('⬅️ Back', 'pay_crypto')]
                    ])
                }
            );
            return;
        }

        const invoice = result.data;
        const status = invoice.status;

        if (status === 'paid') {
            // Check if already credited
            const payment = await get(`SELECT * FROM payments WHERE coinpal_order_id = ?`, [invoiceId.toString()]);

            if (payment && payment.status === 'pending') {
                // Credit the balance
                await run(`UPDATE customers SET balance_usd = balance_usd + ? WHERE id = ?`,
                    [payment.amount_usd, payment.customer_id]);
                await run(`UPDATE payments SET status = 'verified', verified_at = datetime('now') WHERE id = ?`,
                    [payment.id]);
                saveDatabase();

                // Refresh customer data
                ctx.customer = await get(`SELECT * FROM customers WHERE telegram_id = ?`, [ctx.from.id.toString()]);

                await ctx.editMessageText(
                    `✅ *Payment Confirmed!*\n\n` +
                    `Amount: *$${payment.amount_usd} USDT*\n` +
                    `New Balance: *$${ctx.customer.balance_usd.toFixed(2)}*\n\n` +
                    `Thank you for your payment! 🎉`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🛍️ Browse Products', 'browse')],
                            [Markup.button.callback('💰 My Balance', 'my_balance')]
                        ])
                    }
                );

                console.log(`✅ Payment credited: Invoice #${invoiceId}, $${payment.amount_usd} to customer ${payment.customer_id}`);
            } else if (payment && payment.status === 'verified') {
                await ctx.editMessageText(
                    `✅ *Already Credited*\n\n` +
                    `This payment has already been credited to your balance.`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('💰 My Balance', 'my_balance')],
                            [Markup.button.callback('⬅️ Back to Menu', 'main_menu')]
                        ])
                    }
                );
            }
        } else if (status === 'active') {
            await ctx.editMessageText(
                `⏳ *Payment Pending*\n\n` +
                `We haven't received your payment yet.\n\n` +
                `Invoice: \`#${invoiceId}\`\n\n` +
                `Click "Pay Now" to complete your payment.`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.url('💳 Pay Now', invoice.pay_url)],
                        [Markup.button.callback('🔄 Check Again', `check_crypto_${invoiceId}`)],
                        [Markup.button.callback('⬅️ Back', 'pay_crypto')]
                    ])
                }
            );
        } else if (status === 'expired') {
            await ctx.editMessageText(
                `❌ *Payment Expired*\n\n` +
                `This invoice has expired. Please create a new payment.`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('💳 Create New Payment', 'pay_crypto')],
                        [Markup.button.callback('⬅️ Back to Menu', 'main_menu')]
                    ])
                }
            );
        }
    } catch (error) {
        console.error('Check payment status error:', error);
        await ctx.answerCbQuery('Error checking status');
    }
}

// Show BaridiMob payment details
async function showBaridimobPayment(ctx) {
    const rip = (await getSetting('baridimob_rip')) || 'Not configured';
    const name = (await getSetting('baridimob_name')) || 'Not configured';

    await ctx.editMessageText(
        `🏦 *BaridiMob Payment*\n\n` +
        `Send your payment to:\n` +
        `📱 RIP: \`${rip}\`\n` +
        `👤 Name: ${name}\n\n` +
        `After sending, forward your payment receipt screenshot.\n\n` +
        `⚠️ Balance will be credited after admin verification.`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('⬅️ Back', 'add_funds')]
            ])
        }
    );
}

// Notification sender - checks for pending broadcasts and delivery notifications
let notificationBot = null;

function startBroadcastSender(bot) {
    notificationBot = bot;
    console.log('📢 Notification sender initialized');

    // Check for pending notifications every 5 seconds
    setInterval(async () => {
        try {
            // Process delivery notifications
            const pendingNotifications = await getSetting('pending_notifications');
            if (pendingNotifications) {
                let notifications = [];
                try {
                    notifications = JSON.parse(pendingNotifications);
                } catch (e) {
                    notifications = [];
                }

                if (notifications.length > 0) {
                    console.log(`📦 Processing ${notifications.length} delivery notifications...`);

                    for (const notif of notifications) {
                        try {
                            if (notif.type === 'delivery') {
                                const message =
                                    `🎉 *Order #${notif.order_id} Delivered!*\n\n` +
                                    `📦 *Product:* ${notif.product_name}\n\n` +
                                    `🔑 *Your Product Key/Data:*\n` +
                                    `\`\`\`\n${notif.delivered_data}\n\`\`\`\n\n` +
                                    `Thank you for your purchase! 🙏`;

                                await notificationBot.telegram.sendMessage(notif.telegram_id, message, {
                                    parse_mode: 'Markdown'
                                });
                                console.log(`✅ Delivery sent to ${notif.telegram_id} for order #${notif.order_id}`);
                            }
                        } catch (error) {
                            console.log(`❌ Failed to send notification to ${notif.telegram_id}: ${error.message}`);
                        }
                        // Rate limit
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                    // Clear notifications
                    await run(`DELETE FROM settings WHERE key = 'pending_notifications'`);
                    saveDatabase();
                }
            }

            // Process broadcasts
            const pendingBroadcast = await getSetting('pending_broadcast');
            if (pendingBroadcast) {
                const broadcast = JSON.parse(pendingBroadcast);
                if (broadcast.recipients && broadcast.recipients.length > 0) {
                    console.log(`📢 Sending broadcast to ${broadcast.recipients.length} users...`);

                    let sent = 0;
                    let failed = 0;

                    for (const telegramId of broadcast.recipients) {
                        try {
                            await notificationBot.telegram.sendMessage(telegramId, broadcast.message, {
                                parse_mode: 'Markdown'
                            });
                            sent++;
                            await new Promise(resolve => setTimeout(resolve, 50));
                        } catch (error) {
                            failed++;
                            console.log(`Failed to broadcast to ${telegramId}: ${error.message}`);
                        }
                    }

                    console.log(`📢 Broadcast complete: ${sent} sent, ${failed} failed`);
                }

                // Clear the broadcast
                await run(`DELETE FROM settings WHERE key = 'pending_broadcast'`);
                saveDatabase();
            }

        } catch (error) {
            console.error('Notification sender error:', error);
        }
    }, 5000);
}

module.exports = { createBot, startBroadcastSender };

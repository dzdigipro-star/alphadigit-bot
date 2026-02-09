const express = require('express');
const { getSetting, setSetting, query, run, get, saveDatabase } = require('../database');

const router = express.Router();

// =====================
// DASHBOARD STATS
// =====================

router.get('/stats', async (req, res) => {
    try {
        const totalRevenueResult = await get(`SELECT COALESCE(SUM(total_usd), 0) as total FROM orders WHERE status IN ('paid', 'delivered')`);
        const totalOrdersResult = await get(`SELECT COUNT(*) as count FROM orders`);
        const todayOrdersResult = await get(`SELECT COUNT(*) as count FROM orders WHERE date(created_at) = date('now')`);
        const totalCustomersResult = await get(`SELECT COUNT(*) as count FROM customers`);
        const activeCustomersResult = await get(`SELECT COUNT(*) as count FROM customers WHERE date(last_active) >= date('now', '-7 days')`);
        const pendingOrdersResult = await get(`SELECT COUNT(*) as count FROM orders WHERE status = 'paid'`);

        const stats = {
            totalRevenue: totalRevenueResult ? totalRevenueResult.total : 0,
            totalOrders: totalOrdersResult ? totalOrdersResult.count : 0,
            todayOrders: todayOrdersResult ? todayOrdersResult.count : 0,
            totalCustomers: totalCustomersResult ? totalCustomersResult.count : 0,
            activeCustomers: activeCustomersResult ? activeCustomersResult.count : 0,
            pendingOrders: pendingOrdersResult ? pendingOrdersResult.count : 0,
            lowStockProducts: [],
            outOfStockProducts: []
        };

        // Get all products with their stock
        const products = await query(`
            SELECT p.*, 
                (SELECT COUNT(*) FROM product_keys pk WHERE pk.product_id = p.id AND pk.is_sold = 0) as available_keys
            FROM products p
            WHERE p.is_active = 1
        `);

        products.forEach(p => {
            const currentStock = p.delivery_type === 'auto' ? p.available_keys : p.stock;
            p.current_stock = currentStock;

            if (currentStock === 0) {
                stats.outOfStockProducts.push(p);
            } else if (currentStock <= 3) {
                stats.lowStockProducts.push(p);
            }
        });

        // Recent orders
        stats.recentOrders = await query(`
            SELECT o.*, p.name as product_name, c.username, c.first_name, c.telegram_id
            FROM orders o
            JOIN products p ON o.product_id = p.id
            JOIN customers c ON o.customer_id = c.id
            ORDER BY o.created_at DESC
            LIMIT 10
        `);

        res.json(stats);
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================
// CATEGORIES
// =====================

router.get('/categories', async (req, res) => {
    try {
        const categories = await query(`
            SELECT c.*, 
                pc.name as parent_name,
                (SELECT COUNT(*) FROM categories WHERE parent_id = c.id) as subcategory_count,
                (SELECT COUNT(*) FROM products WHERE category_id = c.id) as product_count
            FROM categories c
            LEFT JOIN categories pc ON c.parent_id = pc.id
            ORDER BY c.parent_id NULLS FIRST, c.sort_order, c.name
        `);
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/categories/:id', async (req, res) => {
    try {
        const category = await get(`SELECT * FROM categories WHERE id = ?`, [parseInt(req.params.id)]);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        res.json(category);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/categories', async (req, res) => {
    try {
        const { name, emoji, parent_id, sort_order } = req.body;
        const result = await run(`
            INSERT INTO categories (name, emoji, parent_id, sort_order)
            VALUES (?, ?, ?, ?)
        `, [name, emoji || '📁', parent_id || null, sort_order || 0]);

        res.json({ id: result.lastInsertRowid, message: 'Category created' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/categories/:id', async (req, res) => {
    try {
        const { name, emoji, parent_id, sort_order, is_active } = req.body;
        await run(`
            UPDATE categories 
            SET name = ?, emoji = ?, parent_id = ?, sort_order = ?, is_active = ?
            WHERE id = ?
        `, [name, emoji, parent_id || null, sort_order, is_active ? 1 : 0, parseInt(req.params.id)]);

        res.json({ message: 'Category updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/categories/:id', async (req, res) => {
    try {
        await run(`DELETE FROM categories WHERE id = ?`, [parseInt(req.params.id)]);
        res.json({ message: 'Category deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================
// PRODUCTS
// =====================

router.get('/products', async (req, res) => {
    try {
        const products = await query(`
            SELECT p.*, c.name as category_name,
                (SELECT COUNT(*) FROM product_keys pk WHERE pk.product_id = p.id AND pk.is_sold = 0) as available_keys
            FROM products p
            JOIN categories c ON p.category_id = c.id
            ORDER BY p.created_at DESC
        `);
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/products/:id', async (req, res) => {
    try {
        const product = await get(`
            SELECT p.*, c.name as category_name,
                (SELECT COUNT(*) FROM product_keys pk WHERE pk.product_id = p.id AND pk.is_sold = 0) as available_keys
            FROM products p
            JOIN categories c ON p.category_id = c.id
            WHERE p.id = ?
        `, [parseInt(req.params.id)]);

        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Get keys for this product
        product.keys = await query(`
            SELECT * FROM product_keys WHERE product_id = ? ORDER BY is_sold, created_at DESC
        `, [parseInt(req.params.id)]);

        res.json(product);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/products', async (req, res) => {
    try {
        const { category_id, name, description, price_usd, validity, notes, delivery_type, stock } = req.body;

        const rate = parseFloat(await getSetting('usd_to_dzd_rate')) || 135;
        const price_dzd = price_usd * rate;

        const result = await run(`
            INSERT INTO products (category_id, name, description, price_usd, price_dzd, validity, notes, delivery_type, stock)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [category_id, name, description, price_usd, price_dzd, validity, notes, delivery_type || 'auto', stock || 0]);

        res.json({ id: result.lastInsertRowid, message: 'Product created' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/products/:id', async (req, res) => {
    try {
        const { category_id, name, description, price_usd, validity, notes, delivery_type, stock, is_active } = req.body;

        const rate = parseFloat(await getSetting('usd_to_dzd_rate')) || 135;
        const price_dzd = price_usd * rate;

        await run(`
            UPDATE products 
            SET category_id = ?, name = ?, description = ?, price_usd = ?, price_dzd = ?, 
                validity = ?, notes = ?, delivery_type = ?, stock = ?, is_active = ?,
                updated_at = datetime('now')
            WHERE id = ?
        `, [category_id, name, description, price_usd, price_dzd, validity, notes, delivery_type, stock, is_active ? 1 : 0, parseInt(req.params.id)]);

        res.json({ message: 'Product updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/products/:id', async (req, res) => {
    try {
        await run(`DELETE FROM products WHERE id = ?`, [parseInt(req.params.id)]);
        res.json({ message: 'Product deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Product Keys
router.post('/products/:id/keys', async (req, res) => {
    try {
        const { keys } = req.body; // Array of key strings
        const productId = parseInt(req.params.id);

        for (const key of keys) {
            await run(`INSERT INTO product_keys (product_id, key_data) VALUES (?, ?)`, [productId, key.trim()]);
        }

        res.json({ message: `${keys.length} keys added` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/products/:productId/keys/:keyId', async (req, res) => {
    try {
        await run(`DELETE FROM product_keys WHERE id = ? AND product_id = ?`, [parseInt(req.params.keyId), parseInt(req.params.productId)]);
        res.json({ message: 'Key deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================
// ORDERS
// =====================

router.get('/orders', async (req, res) => {
    try {
        const orders = await query(`
            SELECT o.*, p.name as product_name, c.username, c.first_name, c.telegram_id
            FROM orders o
            JOIN products p ON o.product_id = p.id
            JOIN customers c ON o.customer_id = c.id
            ORDER BY o.created_at DESC
        `);
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/orders/:id', async (req, res) => {
    try {
        const order = await get(`
            SELECT o.*, p.name as product_name, c.username, c.first_name, c.telegram_id
            FROM orders o
            JOIN products p ON o.product_id = p.id
            JOIN customers c ON o.customer_id = c.id
            WHERE o.id = ?
        `, [parseInt(req.params.id)]);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.json(order);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/orders/:id', async (req, res) => {
    try {
        const { status, delivered_data } = req.body;
        const orderId = parseInt(req.params.id);

        // Get order details including customer Telegram ID
        const order = await get(`
            SELECT o.*, c.telegram_id, p.name as product_name
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            JOIN products p ON o.product_id = p.id
            WHERE o.id = ?
        `, [orderId]);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Update order in database
        await run(`
            UPDATE orders SET status = ?, delivered_data = ?, updated_at = datetime('now')
            WHERE id = ?
        `, [status, delivered_data, orderId]);

        // If changing to delivered status AND has delivery data, queue notification
        if (status === 'delivered' && delivered_data && delivered_data.trim()) {
            // Queue delivery notification for bot to send
            const notification = {
                type: 'delivery',
                telegram_id: order.telegram_id,
                product_name: order.product_name,
                order_id: orderId,
                delivered_data: delivered_data,
                created_at: new Date().toISOString()
            };

            // Get existing notifications or create new array
            let notifications = [];
            const existing = await getSetting('pending_notifications');
            if (existing) {
                try {
                    notifications = JSON.parse(existing);
                } catch (e) {
                    notifications = [];
                }
            }
            notifications.push(notification);
            await setSetting('pending_notifications', JSON.stringify(notifications));
        }

        res.json({ message: 'Order updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================
// CUSTOMERS
// =====================

router.get('/customers', async (req, res) => {
    try {
        const customers = await query(`
            SELECT c.*,
                (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) as order_count
            FROM customers c
            ORDER BY c.last_active DESC
        `);
        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/customers/:id', async (req, res) => {
    try {
        const customer = await get(`SELECT * FROM customers WHERE id = ?`, [parseInt(req.params.id)]);
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        customer.orders = await query(`
            SELECT o.*, p.name as product_name
            FROM orders o
            JOIN products p ON o.product_id = p.id
            WHERE o.customer_id = ?
            ORDER BY o.created_at DESC
        `, [parseInt(req.params.id)]);

        res.json(customer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/customers/:id/balance', async (req, res) => {
    try {
        const { amount, action } = req.body; // action: 'add' or 'set'

        if (action === 'add') {
            await run(`UPDATE customers SET balance_usd = balance_usd + ? WHERE id = ?`, [amount, parseInt(req.params.id)]);
        } else {
            await run(`UPDATE customers SET balance_usd = ? WHERE id = ?`, [amount, parseInt(req.params.id)]);
        }

        res.json({ message: 'Balance updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/customers/:id/ban', async (req, res) => {
    try {
        const { is_banned } = req.body;
        await run(`UPDATE customers SET is_banned = ? WHERE id = ?`, [is_banned ? 1 : 0, parseInt(req.params.id)]);
        res.json({ message: is_banned ? 'Customer banned' : 'Customer unbanned' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================
// PAYMENTS
// =====================

router.get('/payments', async (req, res) => {
    try {
        const payments = await query(`
            SELECT p.*, c.username, c.first_name, c.telegram_id
            FROM payments p
            JOIN customers c ON p.customer_id = c.id
            ORDER BY p.created_at DESC
        `);
        res.json(payments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/payments/:id/verify', async (req, res) => {
    try {
        const { status, admin_notes } = req.body;
        const payment = await get(`SELECT * FROM payments WHERE id = ?`, [parseInt(req.params.id)]);

        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        if (status === 'verified' && payment.status !== 'verified') {
            // Add balance to customer
            await run(`UPDATE customers SET balance_usd = balance_usd + ? WHERE id = ?`, [payment.amount_usd, payment.customer_id]);
        }

        await run(`
            UPDATE payments SET status = ?, admin_notes = ?, verified_at = datetime('now')
            WHERE id = ?
        `, [status, admin_notes, parseInt(req.params.id)]);

        res.json({ message: 'Payment ' + status });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================
// COINPAL PAYMENTS
// =====================

const coinpal = require('./coinpal');

// Create CoinPal payment order
router.post('/coinpal/create-payment', async (req, res) => {
    try {
        const { customerId, telegramId, amount } = req.body;

        if ((!customerId && !telegramId) || !amount) {
            return res.status(400).json({ error: 'Customer ID/Telegram ID and amount are required' });
        }

        // Use .env credentials first, fallback to database settings
        const merchantNo = process.env.COINPAL_API_KEY || await getSetting('coinpal_api_key');
        const secretKey = process.env.COINPAL_API_SECRET || await getSetting('coinpal_api_secret');
        const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';

        if (!merchantNo || !secretKey) {
            return res.status(400).json({ error: 'CoinPal API credentials not configured' });
        }

        // Find customer by ID or Telegram ID
        let customer;
        if (customerId) {
            customer = await get(`SELECT * FROM customers WHERE id = ?`, [parseInt(customerId)]);
        } else if (telegramId) {
            customer = await get(`SELECT * FROM customers WHERE telegram_id = ?`, [telegramId.toString()]);
        }

        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const result = await coinpal.createPayment({
            merchantNo,
            secretKey,
            amount: parseFloat(amount),
            customerId: customer.telegram_id,
            description: `Wallet top-up - $${amount}`,
            notifyUrl: `${dashboardUrl}/api/coinpal/webhook`,
            redirectUrl: `${dashboardUrl}/payment-success.html`
        });

        if (result.success) {
            // Store payment record
            await run(`
                INSERT INTO payments (customer_id, amount_usd, payment_method, coinpal_order_id, status)
                VALUES (?, ?, 'coinpal', ?, 'pending')
            `, [customer.id, parseFloat(amount), result.orderNo]);

            res.json({
                success: true,
                checkoutUrl: result.checkoutUrl,
                orderNo: result.orderNo
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('CoinPal create payment error:', error);
        res.status(500).json({ error: error.message });
    }
});

// CoinPal webhook handler
router.post('/coinpal/webhook', async (req, res) => {
    try {
        const payload = req.body;
        const secretKey = await getSetting('coinpal_api_secret');

        console.log('CoinPal webhook received:', payload);

        // Verify signature
        if (!coinpal.verifyWebhookSignature(payload, secretKey)) {
            console.log('Invalid webhook signature');
            return res.status(400).json({ error: 'Invalid signature' });
        }

        const { orderNo, orderStatus, orderAmount } = payload;

        // Find the payment
        const payment = await get(`SELECT * FROM payments WHERE coinpal_order_id = ?`, [orderNo]);

        if (!payment) {
            console.log('Payment not found for order:', orderNo);
            return res.status(404).json({ error: 'Payment not found' });
        }

        // Check if already processed
        if (payment.status === 'verified') {
            return res.json({ message: 'Already processed' });
        }

        // Process successful payment
        if (orderStatus === 'PAID' || orderStatus === 'SUCCESS' || orderStatus === 'COMPLETED') {
            // Credit customer balance
            await run(`UPDATE customers SET balance_usd = balance_usd + ? WHERE id = ?`,
                [payment.amount_usd, payment.customer_id]);

            // Update payment status
            await run(`UPDATE payments SET status = 'verified', verified_at = datetime('now') WHERE id = ?`,
                [payment.id]);

            console.log(`✅ Payment ${orderNo} verified. Credited $${payment.amount_usd} to customer ${payment.customer_id}`);
        } else if (orderStatus === 'EXPIRED' || orderStatus === 'CANCELLED') {
            await run(`UPDATE payments SET status = 'rejected', admin_notes = ? WHERE id = ?`,
                [orderStatus, payment.id]);
        }

        res.json({ message: 'Webhook processed' });
    } catch (error) {
        console.error('CoinPal webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================
// SETTINGS
// =====================

router.get('/settings', async (req, res) => {
    try {
        const settings = await query(`SELECT * FROM settings`);
        const settingsObj = {};
        settings.forEach(s => settingsObj[s.key] = s.value);
        res.json(settingsObj);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/settings', async (req, res) => {
    try {
        const settings = req.body;
        console.log('📝 Saving settings:', Object.keys(settings));
        if (settings.bot_token) {
            console.log('🔑 Bot token received:', settings.bot_token.substring(0, 10) + '...');
        }
        for (const [key, value] of Object.entries(settings)) {
            await setSetting(key, value);
        }
        console.log('✅ Settings saved to database');
        res.json({ message: 'Settings updated' });
    } catch (error) {
        console.error('❌ Settings save error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================
// ADMIN PASSWORD
// =====================

router.put('/admin/password', async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Get current password from settings
        const storedPass = (await getSetting('admin_password')) || 'changeme123';

        if (currentPassword !== storedPass) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }

        await setSetting('admin_password', newPassword);

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =====================
// BROADCAST MESSAGE
// =====================

router.post('/broadcast', async (req, res) => {
    try {
        const { message, includeInactive } = req.body;

        if (!message || message.trim().length === 0) {
            return res.status(400).json({ error: 'Message cannot be empty' });
        }

        // Get all customers
        let customers;
        if (includeInactive) {
            customers = await query(`SELECT telegram_id FROM customers WHERE is_banned = 0`);
        } else {
            // Only active customers (active in last 30 days)
            customers = await query(`SELECT telegram_id FROM customers WHERE is_banned = 0 AND date(last_active) >= date('now', '-30 days')`);
        }

        // Store broadcast for the bot to send
        await setSetting('pending_broadcast', JSON.stringify({
            message: message,
            recipients: customers.map(c => c.telegram_id),
            created_at: new Date().toISOString()
        }));

        res.json({
            message: 'Broadcast queued',
            recipients: customers.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

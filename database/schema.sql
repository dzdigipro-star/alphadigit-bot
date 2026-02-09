-- AlphaDigit Database Schema

-- Categories table (supports subcategories)
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '📁',
    parent_id INTEGER DEFAULT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price_usd REAL NOT NULL,
    price_dzd REAL,
    validity TEXT,
    notes TEXT,
    delivery_type TEXT DEFAULT 'auto' CHECK(delivery_type IN ('auto', 'manual')),
    stock INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- Product keys/credentials for auto-delivery
CREATE TABLE IF NOT EXISTS product_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    key_data TEXT NOT NULL,
    is_sold INTEGER DEFAULT 0,
    sold_to INTEGER,
    sold_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (sold_to) REFERENCES customers(id)
);

-- Customers table (Telegram users)
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    balance_usd REAL DEFAULT 0,
    balance_dzd REAL DEFAULT 0,
    total_spent_usd REAL DEFAULT 0,
    total_spent_dzd REAL DEFAULT 0,
    is_banned INTEGER DEFAULT 0,
    expecting_binance_order_id TEXT,
    expecting_binance_amount INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_key_id INTEGER,
    quantity INTEGER DEFAULT 1,
    total_usd REAL NOT NULL,
    total_dzd REAL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'delivered', 'cancelled', 'refunded')),
    delivery_type TEXT,
    delivered_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (product_key_id) REFERENCES product_keys(id)
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    amount_usd REAL DEFAULT 0,
    amount_dzd REAL DEFAULT 0,
    payment_method TEXT NOT NULL CHECK(payment_method IN ('coinpal', 'cryptopay', 'binance', 'baridimob', 'manual')),
    transaction_hash TEXT,
    coinpal_order_id TEXT,
    receipt_image TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'verified', 'rejected')),
    admin_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    verified_at DATETIME,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Stock alerts log
CREATE TABLE IF NOT EXISTS stock_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    alert_type TEXT CHECK(alert_type IN ('low', 'out')),
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('bot_name', 'AlphaDigit'),
    ('welcome_message', 'Welcome to our digital store! 🛒\n\nBrowse our products and make purchases securely.'),
    ('store_currency', 'USD'),
    ('coinpal_api_key', ''),
    ('coinpal_api_secret', ''),
    ('binance_pay_id', ''),
    ('baridimob_rip', ''),
    ('baridimob_name', ''),
    ('low_stock_threshold', '3');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_product_keys_product ON product_keys(product_id);
CREATE INDEX IF NOT EXISTS idx_product_keys_sold ON product_keys(is_sold);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

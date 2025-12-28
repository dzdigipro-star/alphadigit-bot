/**
 * Binance API Integration
 * For verifying Binance Pay payments via Order ID
 */

const crypto = require('crypto');

const BINANCE_API_URL = 'https://api.binance.com';

// Store time offset between local and Binance server
let serverTimeOffset = 0;

/**
 * Get Binance server time and calculate offset
 */
async function syncServerTime() {
    try {
        const response = await fetch(`${BINANCE_API_URL}/api/v3/time`);
        const data = await response.json();
        const serverTime = data.serverTime;
        const localTime = Date.now();
        serverTimeOffset = serverTime - localTime;
        console.log(`⏰ Binance time synced. Offset: ${serverTimeOffset}ms`);
        return serverTime;
    } catch (error) {
        console.error('Failed to sync Binance server time:', error);
        return Date.now();
    }
}

/**
 * Generate Binance API signature
 */
function generateSignature(queryString, secretKey) {
    return crypto.createHmac('sha256', secretKey)
        .update(queryString)
        .digest('hex');
}

/**
 * Make authenticated request to Binance API
 */
async function binanceRequest(endpoint, apiKey, secretKey, params = {}) {
    try {
        // Sync server time first
        await syncServerTime();

        // Use synced timestamp
        params.timestamp = Date.now() + serverTimeOffset;
        params.recvWindow = 60000; // 60 second window

        // Create query string
        const queryString = new URLSearchParams(params).toString();

        // Generate signature
        const signature = generateSignature(queryString, secretKey);

        const url = `${BINANCE_API_URL}${endpoint}?${queryString}&signature=${signature}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-MBX-APIKEY': apiKey,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok) {
            return { success: true, data };
        } else {
            console.error('Binance API Error:', data);
            return { success: false, error: data.msg || 'API Error' };
        }
    } catch (error) {
        console.error('Binance Request Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get Binance Pay transaction history
 * Note: This uses the standard Binance API to check deposits/transfers
 */
async function getPaymentHistory(apiKey, secretKey, startTime = null, endTime = null) {
    const params = {};

    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;

    return binanceRequest('/sapi/v1/pay/transactions', apiKey, secretKey, params);
}

/**
 * Verify a payment by searching for a specific order ID in transaction history
 * @param {Object} options
 * @param {string} options.apiKey - Binance API Key
 * @param {string} options.secretKey - Binance API Secret
 * @param {string} options.orderId - The Order ID to verify
 * @param {number} options.amount - Expected amount
 * @param {string} options.payerId - (Optional) Sender's Binance Pay ID
 */
async function verifyPayment(options) {
    const { apiKey, secretKey, orderId, amount, payerId } = options;

    try {
        // Get recent transactions (last 7 days)
        const startTime = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const result = await getPaymentHistory(apiKey, secretKey, startTime);

        if (!result.success) {
            return { success: false, error: result.error };
        }

        const transactions = result.data.data || [];

        // Search for matching transaction
        const matchingTx = transactions.find(tx => {
            // Match by order ID (could be in different fields depending on transaction type)
            const matchesOrderId =
                tx.orderId === orderId ||
                tx.transactionId === orderId ||
                tx.orderNo === orderId ||
                String(tx.orderId).includes(orderId) ||
                String(tx.transactionId).includes(orderId);

            // Optionally match amount (with small tolerance for fees)
            const matchesAmount = !amount || Math.abs(parseFloat(tx.amount) - amount) < 0.01;

            return matchesOrderId && matchesAmount;
        });

        if (matchingTx) {
            return {
                success: true,
                verified: true,
                transaction: {
                    orderId: matchingTx.orderId || matchingTx.transactionId,
                    amount: parseFloat(matchingTx.amount),
                    currency: matchingTx.currency || 'USDT',
                    status: matchingTx.transferStatus || matchingTx.status,
                    timestamp: matchingTx.transactTime || matchingTx.transactionTime,
                    payerInfo: matchingTx.payerInfo
                }
            };
        }

        return {
            success: true,
            verified: false,
            error: 'Transaction not found. Please check the Order ID and try again.'
        };
    } catch (error) {
        console.error('Payment verification error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get account information to verify API credentials are working
 */
async function testApiCredentials(apiKey, secretKey) {
    return binanceRequest('/api/v3/account', apiKey, secretKey);
}

module.exports = {
    verifyPayment,
    getPaymentHistory,
    testApiCredentials
};

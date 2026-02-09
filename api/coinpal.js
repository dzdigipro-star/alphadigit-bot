const crypto = require('crypto');

// CoinPal API Base URL - Correct URL
const COINPAL_API_URL = 'https://pay.coinpal.io';

/**
 * Generate CoinPal API signature
 * Format: sha256(secretKey + requestId + merchantNo + orderNo + orderAmount + orderCurrency)
 */
function generateSignature(secretKey, requestId, merchantNo, orderNo, orderAmount, orderCurrency) {
    const signString = `${secretKey}${requestId}${merchantNo}${orderNo}${orderAmount}${orderCurrency}`;
    return crypto.createHash('sha256').update(signString).digest('hex');
}

/**
 * Generate unique request ID
 */
function generateRequestId() {
    return `REQ${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

/**
 * Generate unique order number
 */
function generateOrderNo() {
    return `ORD${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

/**
 * Create a CoinPal payment order
 */
async function createPayment(options) {
    const {
        merchantNo,
        secretKey,
        amount,
        customerId,
        description,
        notifyUrl,
        redirectUrl
    } = options;

    const requestId = generateRequestId();
    const orderNo = generateOrderNo();
    const orderAmount = amount.toFixed(2);
    const orderCurrency = 'USD';

    const signature = generateSignature(
        secretKey,
        requestId,
        merchantNo,
        orderNo,
        orderAmount,
        orderCurrency
    );

    const payload = {
        version: '2',
        requestId,
        merchantNo,
        merchantName: 'AlphaDigit',
        orderNo,
        orderCurrencyType: 'fiat',
        orderCurrency,
        orderAmount,
        orderDescription: description || `Wallet top-up for customer ${customerId}`,
        resultNotifyUser: 'Y',
        unpaidAutoRefund: 'Y',
        notifyURL: notifyUrl,
        redirectURL: redirectUrl,
        remark: JSON.stringify({ customerId }),
        sign: signature
    };

    console.log('CoinPal Request:', JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(`${COINPAL_API_URL}/gateway/pay/checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        // Log response status for debugging
        console.log('CoinPal Response Status:', response.status);

        // Get response text first to debug
        const responseText = await response.text();
        console.log('CoinPal Response Text:', responseText);

        // Try to parse as JSON
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('Failed to parse CoinPal response:', parseError);
            return {
                success: false,
                error: `API returned invalid response: ${responseText.substring(0, 100)}`,
                orderNo
            };
        }

        if (data.respCode === 200 || data.respCode === '200' || data.status === 'created') {
            return {
                success: true,
                orderNo,
                checkoutUrl: data.nextStepContent || data.data?.checkoutUrl || data.checkoutUrl,
                reference: data.reference,
                expireTime: data.data?.expireTime,
                data: data
            };
        } else {
            return {
                success: false,
                error: data.respMessage || data.message || data.msg || 'Failed to create payment',
                code: data.respCode || data.code,
                orderNo
            };
        }
    } catch (error) {
        console.error('CoinPal API error:', error);
        return {
            success: false,
            error: error.message || 'Network error',
            orderNo
        };
    }
}

/**
 * Verify CoinPal webhook signature
 */
function verifyWebhookSignature(payload, secretKey) {
    const { requestId, merchantNo, orderNo, orderAmount, orderCurrency, sign } = payload;
    const expectedSign = generateSignature(
        secretKey,
        requestId,
        merchantNo,
        orderNo,
        orderAmount,
        orderCurrency
    );
    return sign === expectedSign;
}

module.exports = {
    createPayment,
    verifyWebhookSignature,
    generateOrderNo,
    generateRequestId
};

/**
 * CryptoPay API Integration
 * Documentation: https://help.crypt.bot/crypto-pay-api
 */

const CRYPTOPAY_API_URL = 'https://pay.crypt.bot/api';

/**
 * CryptoPay API Client
 */
class CryptoPay {
    constructor(token) {
        this.token = token;
    }

    /**
     * Make API request to CryptoPay
     */
    async request(method, params = {}) {
        try {
            const url = new URL(`${CRYPTOPAY_API_URL}/${method}`);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Crypto-Pay-API-Token': this.token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(params)
            });

            const data = await response.json();

            if (!data.ok) {
                console.error('CryptoPay API Error:', data);
                return { success: false, error: data.error?.message || 'API Error' };
            }

            return { success: true, data: data.result };
        } catch (error) {
            console.error('CryptoPay Request Error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get app info
     */
    async getMe() {
        return this.request('getMe');
    }

    /**
     * Create an invoice
     * @param {Object} options
     * @param {string} options.asset - Currency code (USDT, TON, BTC, etc.)
     * @param {string} options.amount - Amount to pay
     * @param {string} options.description - Invoice description
     * @param {string} options.payload - Custom payload (will be returned in webhook)
     * @param {number} options.expires_in - Invoice expiration in seconds (1-2678400)
     */
    async createInvoice(options) {
        const params = {
            asset: options.asset || 'USDT',
            amount: options.amount.toString(),
            description: options.description || 'Wallet Top-up',
            payload: options.payload || '',
            expires_in: options.expires_in || 3600, // 1 hour default
            allow_comments: false,
            allow_anonymous: true
        };

        const result = await this.request('createInvoice', params);

        if (result.success) {
            return {
                success: true,
                invoiceId: result.data.invoice_id,
                payUrl: result.data.pay_url,
                miniAppUrl: result.data.mini_app_invoice_url,
                amount: result.data.amount,
                asset: result.data.asset,
                status: result.data.status,
                expirationDate: result.data.expiration_date
            };
        }

        return result;
    }

    /**
     * Get invoices
     */
    async getInvoices(invoiceIds = []) {
        return this.request('getInvoices', {
            invoice_ids: invoiceIds.length > 0 ? invoiceIds : undefined
        });
    }

    /**
     * Get specific invoice status
     */
    async getInvoice(invoiceId) {
        const result = await this.request('getInvoices', {
            invoice_ids: [invoiceId]
        });

        if (result.success && result.data.items && result.data.items.length > 0) {
            return { success: true, data: result.data.items[0] };
        }

        return { success: false, error: 'Invoice not found' };
    }

    /**
     * Get available currencies
     */
    async getCurrencies() {
        return this.request('getCurrencies');
    }

    /**
     * Get balance
     */
    async getBalance() {
        return this.request('getBalance');
    }
}

module.exports = CryptoPay;

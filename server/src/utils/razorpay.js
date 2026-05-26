const Razorpay = require("razorpay");

const isMockMode = !process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID === "rzp_test_mock_id";

let razorpayClient = null;

if (!isMockMode) {
  try {
    razorpayClient = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    console.log("Razorpay Live Client Initialized.");
  } catch (error) {
    console.error("Razorpay initialization failed, entering mock mode:", error.message);
    razorpayClient = null;
  }
}

// Production-grade mock interface mimicking Razorpay Route / Accounts API
const mockRazorpay = {
  orders: {
    create: async (options) => {
      const orderId = `order_${Math.random().toString(36).substring(2, 12)}`;
      return {
        id: orderId,
        entity: "order",
        amount: options.amount,
        amount_paid: 0,
        amount_due: options.amount,
        currency: options.currency || "INR",
        receipt: options.receipt,
        status: "created",
        attempts: 0,
        notes: options.notes || {},
        created_at: Math.floor(Date.now() / 1000),
      };
    }
  },
  payments: {
    transfer: async (paymentId, options) => {
      const transfers = (options.transfers || []).map((t) => {
        const transferId = `trns_${Math.random().toString(36).substring(2, 12)}`;
        return {
          id: transferId,
          entity: "transfer",
          source: paymentId,
          recipient: t.account,
          amount: t.amount,
          currency: "INR",
          status: "processed",
          on_hold: t.on_hold ? 1 : 0,
          on_hold_until: t.on_hold_until || null,
          created_at: Math.floor(Date.now() / 1000),
        };
      });
      return { items: transfers };
    }
  },
  transfers: {
    reverse: async (transferId, options) => {
      const reversalId = `rval_${Math.random().toString(36).substring(2, 12)}`;
      return {
        id: reversalId,
        entity: "reversal",
        transfer_id: transferId,
        amount: options.amount,
        currency: "INR",
        created_at: Math.floor(Date.now() / 1000),
      };
    }
  },
  accounts: {
    create: async (options) => {
      const accountId = `acc_${Math.random().toString(36).substring(2, 12)}`;
      return {
        id: accountId,
        entity: "account",
        email: options.email,
        phone: options.phone,
        type: options.type || "route",
        legal_business_name: options.legal_business_name,
        business_type: options.business_type,
        status: "activated", // Mock automatically activates for direct dev testing
        created_at: Math.floor(Date.now() / 1000),
      };
    }
  }
};

module.exports = isMockMode ? mockRazorpay : razorpayClient;

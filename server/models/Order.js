/**
 * Order model — persisted in MongoDB (Mongoose).
 *
 * Used exclusively for payment orders (Alipay 当面付).
 * Unlike the legacy MockDB models that store data in db.json,
 * orders MUST be durable and concurrency-safe, so they go into Mongo.
 */
const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    orderId:    { type: String, required: true, unique: true, index: true },
    userId:     { type: String, required: true, index: true },
    type:       { type: String, required: true, enum: ['subscription', 'batch', 'img', 'vid'] },
    tier:       { type: String, default: null },       // only for type=subscription
    count:      { type: Number, default: null },       // only for type=batch
    amount:     { type: Number, required: true },      // CNY
    status:     { type: String, default: 'pending', enum: ['pending', 'paid', 'closed', 'refunded'] },
    alipayTradeNo: { type: String, default: null },    // 支付宝交易号
    paidAt:     { type: Date, default: null },
    closedAt:   { type: Date, default: null },
    manualConfirm: { type: Boolean, default: false },
}, {
    timestamps: true,   // adds createdAt, updatedAt
});

// Auto-close stale pending orders older than 30 minutes
OrderSchema.statics.closeExpiredOrders = async function () {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const result = await this.updateMany(
        { status: 'pending', createdAt: { $lt: cutoff } },
        { $set: { status: 'closed', closedAt: new Date() } }
    );
    if (result.modifiedCount > 0) {
        console.log(`[Payment] Auto-closed ${result.modifiedCount} expired order(s)`);
    }
};

module.exports = mongoose.model('Order', OrderSchema);

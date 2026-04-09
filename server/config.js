
// Pricing and Quota Configuration
// 商业模式：个人端 / 高校端 / 企业端
const PRICING = {
    TRIAL: {
        id: 'trial',
        price: 0,
        quota: { img: 2, vid: 1 },
        unitPrice: { img: null, vid: null },
        label: 'Trial'
    },
    PERSONAL: {
        id: 'personal',
        price: 99,           // ¥99/月/Agent
        period: 'monthly',
        quota: { img: 0, vid: 0 },
        unitPrice: { img: 10, vid: 50 },
        label: '个人端'
    },
    ACADEMIC: {
        id: 'academic',
        price: 150000,       // ¥15万/年
        period: 'yearly',
        quota: { img: 9999, vid: 9999 },
        unitPrice: { img: 0, vid: 0 },
        label: '高校端'
    },
    ENTERPRISE: {
        id: 'enterprise',
        price: 0,            // ¥100万+ 定制化，不走线上支付
        period: 'custom',
        quota: { img: 9999, vid: 9999 },
        unitPrice: { img: 0, vid: 0 },
        label: '企业端',
        contactOnly: true
    }
};

const IP_LIMIT = 5; // Allow for network changes on same devices

module.exports = { PRICING, IP_LIMIT };


// Pricing and Quota Configuration
const PRICING = {
    TRIAL: {
        id: 'trial',
        price: 0,
        quota: { img: 2, vid: 1 },
        unitPrice: { img: null, vid: null },
        label: 'Trial'
    },
    NORMAL: {
        id: 'normal',
        price: 0,
        quota: { img: 0, vid: 0 },
        unitPrice: { img: 10, vid: 50 },
        label: 'Normal'
    },
    VIP: {
        id: 'vip',
        price: 3000,
        quota: { img: 368, vid: 30 },
        unitPrice: { img: 8, vid: 40 },
        label: 'VIP'
    },
    SVIP: {
        id: 'svip',
        price: 5000,
        quota: { img: 750, vid: 200 },
        unitPrice: { img: 6, vid: 30 },
        label: 'SVIP'
    }
};

const IP_LIMIT = 5; // Allow for network changes on same devices

module.exports = { PRICING, IP_LIMIT };

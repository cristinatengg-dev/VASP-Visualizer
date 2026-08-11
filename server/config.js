
// Pricing and Quota Configuration
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
        price: 30000,        // ¥3万/年
        period: 'yearly',
        quota: { img: 9999, vid: 9999 },
        unitPrice: { img: 0, vid: 0 },
        label: '高校端'
    },
    ENTERPRISE: {
        id: 'enterprise',
        price: 0,
        period: 'custom',
        quota: { img: 9999, vid: 9999 },
        unitPrice: { img: 0, vid: 0 },
        label: '企业端',
        contactOnly: true
    }
};

// Agent access policy. Agent capabilities are currently public; payment and
// export-credit policies remain separate from this switch.
const AGENT_ACCESS = {
    MODE: 'public',
    AGENTS: ['modeling', 'compute', 'rendering', 'cover', 'retrieval'],
};

const IP_LIMIT = 5;

module.exports = { PRICING, IP_LIMIT, AGENT_ACCESS };

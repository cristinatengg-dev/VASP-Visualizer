const { User, VerificationCode, InvitationCode } = require('../models');

// Connect to MongoDB (Mock)
const connectDB = async () => {
    console.log('Mock DB Connected (JSON File Mode)');
};

const getUser = async (email) => {
    return await User.findOne({ email });
};

const createUser = async (email, ip) => {
    return await User.create({
        email,
        tier: 'personal',
        trial_img_left: 2,
        trial_vid_left: 1,
        prepaid_img: 0,
        prepaid_vid: 0,
        used_img: 0,
        used_vid: 0,
        associated_ips: [ip],
        subscribed_agents: [],
        subscription_expires_at: null,
        cover_used_this_month: 0,
        cover_month_key: '',
        agent_daily_usage: {},
        createdAt: new Date(),
        updatedAt: new Date()
    });
};

const updateUser = async (email, updates) => {
    return await User.findOneAndUpdate({ email }, { $set: updates }, { new: true });
};

const redeemCode = async (codeStr, userId) => {
    const code = await InvitationCode.findOne({ code: codeStr, isUsed: false });
    if (!code) throw new Error('Invalid or used code');

    // Update Code
    await InvitationCode.findOneAndUpdate({ code: codeStr }, { $set: { isUsed: true, usedBy: userId, usedAt: new Date() } });

    // Update User
    const plan = code.planType || 'academic';
    await User.findOneAndUpdate({ _id: userId }, { $set: { tier: plan } });
    
    return true;
};

const createVerificationCode = async (email, otp) => {
    // Invalidate old codes
    // MockDB doesn't support deleteMany well, but we can just ignore old ones by checking expiry
    // Or we can implement deleteMany in mockDb if needed. 
    // For now, just create new one.
    return await VerificationCode.create({
        email,
        code: otp,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 min
    });
};

const verifyCode = async (email, otp) => {
    const record = await VerificationCode.findOne({ 
        email, 
        code: otp,
        expiresAt: { $gt: new Date() }
    });
    return !!record;
};

const getLastCodeTime = async (email) => {
    const codes = await VerificationCode.find({ email });
    if (codes.length === 0) return null;
    // Sort by createdAt desc
    codes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return codes[0].createdAt;
};

module.exports = {
    User,
    InvitationCode,
    VerificationCode,
    connectDB,
    getUser,
    createUser,
    updateUser,
    redeemCode,
    createVerificationCode,
    verifyCode,
    getLastCodeTime
};

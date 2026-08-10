const { User, VerificationCode, InvitationCode } = require('../models');

// Connect to MongoDB (Mock)
const connectDB = async () => {
    console.log('Mock DB Connected (JSON File Mode)');
};

const getUser = async (phone) => {
    return await User.findOne({ phone });
};

const createUser = async (phone, ip) => {
    return await User.create({
        id: phone,
        phone,
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

const updateUser = async (phone, updates) => {
    return await User.findOneAndUpdate({ phone }, { $set: updates }, { new: true });
};

const redeemCode = async (codeStr, userId) => {
    const code = await InvitationCode.findOne({ code: codeStr, isUsed: false });
    if (!code) throw new Error('Invalid or used code');

    // Update Code
    await InvitationCode.findOneAndUpdate({ code: codeStr }, { $set: { isUsed: true, usedBy: userId, usedAt: new Date() } });

    // Update User
    const plan = code.planType || 'academic';
    const updated = await User.findOneAndUpdate({ phone: userId }, { $set: { tier: plan } }, { new: true }) ||
        await User.findOneAndUpdate({ id: userId }, { $set: { tier: plan } }, { new: true }) ||
        await User.findOneAndUpdate({ _id: userId }, { $set: { tier: plan } }, { new: true });
    if (!updated) throw new Error('User not found');
    
    return true;
};

const createVerificationCode = async (phone, codeHash) => {
    const previousCodes = await VerificationCode.find({ phone });
    await Promise.all(previousCodes
        .filter(record => !record.consumedAt)
        .map(record => VerificationCode.findOneAndUpdate(
            { _id: record._id },
            { $set: { consumedAt: new Date() } },
            { new: true }
        )));

    return await VerificationCode.create({
        phone,
        codeHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        consumedAt: null,
    });
};

const verifyCode = async (phone, codeHash) => {
    const records = await VerificationCode.find({ phone });
    const record = records
        .filter(item => !item.consumedAt && new Date(item.expiresAt).getTime() > Date.now())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .find(item => item.codeHash === codeHash);
    if (!record) return false;

    await VerificationCode.findOneAndUpdate(
        { _id: record._id },
        { $set: { consumedAt: new Date() } },
        { new: true }
    );
    return true;
};

const getLastCodeTime = async (phone) => {
    const codes = await VerificationCode.find({ phone });
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

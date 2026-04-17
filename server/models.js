const MockModel = require('./utils/mockDb');

const User = new MockModel('users', {});
const InvitationCode = new MockModel('invitationCodes', {});
const VerificationCode = new MockModel('verificationCodes', {});

// Order uses real Mongoose model (persisted in MongoDB, not JSON file)
const Order = require('./models/Order');

module.exports = { User, InvitationCode, VerificationCode, Order };

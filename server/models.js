const MockModel = require('./utils/mockDb');

const User = new MockModel('users', {});
const InvitationCode = new MockModel('invitationCodes', {});
const VerificationCode = new MockModel('verificationCodes', {});

module.exports = { User, InvitationCode, VerificationCode };

const MockModel = require('./utils/mockDb');
const mongoose = require('mongoose');

const User = new MockModel('users', {});
const InvitationCode = new MockModel('invitationCodes', {});
const VerificationCode = new MockModel('verificationCodes', {});
const MockChatSession = new MockModel('chatSessions', {});
const MockChatMemory = new MockModel('chatMemories', {});
const MongoChatSession = require('./models/ChatSession');
const MongoChatMemory = require('./models/ChatMemory');

const createHybridModel = (mongoModel, mockModel) => {
  const active = () => (mongoose.connection.readyState === 1 ? mongoModel : mockModel);
  return {
    create: (...args) => active().create(...args),
    find: (...args) => active().find(...args),
    findOne: (...args) => active().findOne(...args),
    findById: (...args) => active().findById(...args),
    findOneAndUpdate: (...args) => active().findOneAndUpdate(...args),
  };
};

const ChatSession = createHybridModel(MongoChatSession, MockChatSession);
const ChatMemory = createHybridModel(MongoChatMemory, MockChatMemory);

// Order uses real Mongoose model (persisted in MongoDB, not JSON file)
const Order = require('./models/Order');

module.exports = { User, InvitationCode, VerificationCode, ChatSession, ChatMemory, Order };

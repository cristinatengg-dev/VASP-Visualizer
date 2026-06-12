const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const ChatSessionSchema = new mongoose.Schema({
  ownerId: { type: String, required: true, index: true },
  title: { type: String, default: 'Workspace chat' },
  messages: { type: [ChatMessageSchema], default: [] },
}, {
  timestamps: true,
  collection: 'chatSessions',
});

ChatSessionSchema.index({ ownerId: 1, updatedAt: -1 });

module.exports = mongoose.models.ChatSession || mongoose.model('ChatSession', ChatSessionSchema);

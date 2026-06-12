const mongoose = require('mongoose');

const ChatMemorySchema = new mongoose.Schema({
  ownerId: { type: String, required: true, index: true },
  text: { type: String, required: true },
  source: { type: String, default: 'chat' },
}, {
  timestamps: true,
  collection: 'chatMemories',
});

ChatMemorySchema.index({ ownerId: 1, text: 1 }, { unique: true });

module.exports = mongoose.models.ChatMemory || mongoose.model('ChatMemory', ChatMemorySchema);

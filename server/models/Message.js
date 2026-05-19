const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  encryptedMessage: { type: String, required: function() { return this.messageType === 'text'; } },
  messageType: { type: String, enum: ['text', 'image'], default: 'text' },
  fileData: { type: String }, // Base64 data for images
  fileName: { type: String },
  expiresAt: { type: Date }, // For TTL deletion
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  reactions: [{
    _id: false,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: String
  }],
  seen: { type: Boolean, default: false },
  deletedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, {
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false
});

// TTL Index: Automatically delete documents when expiresAt is reached
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Message', messageSchema);

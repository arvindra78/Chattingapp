const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  encryptedMessage: { type: String, required: true },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  reactions: [{
    _id: false,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: String
  }],
  seen: { type: Boolean, default: false }
}, {
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false
});

module.exports = mongoose.model('Message', messageSchema);

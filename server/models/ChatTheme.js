const mongoose = require('mongoose');

const chatThemeSchema = new mongoose.Schema({
  participantsKey: { type: String, required: true, unique: true, index: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  themeId: { type: String, required: true, default: 'matrix' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('ChatTheme', chatThemeSchema);

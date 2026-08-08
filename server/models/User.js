const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  device: String,
  ip: String,
  lastSeen: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  
  // Stealth Features
  alias: { type: String, unique: true, trim: true },
  // Public handle shown in Discovery. Private messaging still requires approval.
  fitId: { type: String, required: true, unique: true, trim: true, lowercase: true },
  isDiscoverable: { type: Boolean, default: true },
  avatarSeed: { type: String },
  unlockCode: { type: String, required: true }, // Passcode for the vault
  
  // Status Tracking
  vaultUnlockedAt: { type: Date },
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },
  activeSessions: [sessionSchema],
  vaultContacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  vaultNicknames: { type: Map, of: String },
  dmRequests: [{
    _id: false,
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
  }],

  // Fitness Data (Mask)
  fitnessStats: {
    calories: { type: Number, default: 0 },
    water: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    weight: { type: Number }
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);

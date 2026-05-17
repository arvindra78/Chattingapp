const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const { vaultAuth } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/encryption');

// @route   GET api/sync-center/nodes
// @desc    Get users you have messaged or received messages from
router.get('/nodes', vaultAuth, async (req, res) => {
  try {
    // Find unique user IDs from messages where current user is sender or receiver
    const messages = await Message.find({
      $or: [{ senderId: req.vaultUser.id }, { receiverId: req.vaultUser.id }]
    }).sort({ createdAt: -1 });

    const nodeIds = new Set();
    messages.forEach(msg => {
      nodeIds.add(msg.senderId.toString());
      nodeIds.add(msg.receiverId.toString());
    });
    nodeIds.delete(req.vaultUser.id.toString());

    const nodes = await User.find({ _id: { $in: Array.from(nodeIds) } })
      .select('alias fitId avatarSeed isOnline lastSeen');

    res.json(nodes);
  } catch (err) {
    console.error('Nodes Error:', err);
    res.status(500).send('Server error');
  }
});

// @route   GET api/sync-center/history/:otherUserId
// @desc    Get message history with a specific user
router.get('/history/:otherUserId', vaultAuth, async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { senderId: req.vaultUser.id, receiverId: req.params.otherUserId },
        { senderId: req.params.otherUserId, receiverId: req.vaultUser.id }
      ]
    }).populate('replyTo', 'encryptedMessage senderId').sort({ createdAt: 1 });

    const decryptedMessages = messages.map(msg => {
      const msgObj = msg.toObject();
      try {
        msgObj.message = decrypt(msg.encryptedMessage);
        if (msgObj.replyTo) {
          msgObj.replyTo.message = decrypt(msgObj.replyTo.encryptedMessage);
          delete msgObj.replyTo.encryptedMessage;
        }
      } catch (e) {
        msgObj.message = "[Decryption Error]";
      }
      return msgObj;
    });

    res.json(decryptedMessages);
  } catch (err) {
    console.error('History Error:', err);
    res.status(500).send('Server error');
  }
});

// @route   GET api/sync-center/search
// @desc    Search for users by FitID or Alias
router.get('/search', vaultAuth, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  try {
    const users = await User.find({
      $and: [
        { _id: { $ne: req.vaultUser.id } }, // Don't find yourself
        {
          $or: [
            { fitId: { $regex: q, $options: 'i' } },
            { alias: { $regex: q, $options: 'i' } }
          ]
        }
      ]
    }).select('alias fitId avatarSeed isOnline').limit(10);
    
    res.json(users);
  } catch (err) {
    console.error('Search Error:', err);
    res.status(500).send('Server error');
  }
});

module.exports = router;

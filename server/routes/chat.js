const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const { vaultAuth } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/encryption');

const getNicknameForUser = (nicknameMap, userId) => {
  if (!nicknameMap) return null;
  if (typeof nicknameMap.get === 'function') return nicknameMap.get(userId) || null;
  return nicknameMap[userId] || null;
};

// @route   GET api/sync-center/nodes
// @desc    Get users you have messaged or received messages from
router.get('/nodes', vaultAuth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.vaultUser.id)
      .select('vaultContacts vaultNicknames')
      .lean();

    // Find unique user IDs from messages where current user is sender or receiver
    const messages = await Message.find({
      $or: [{ senderId: req.vaultUser.id }, { receiverId: req.vaultUser.id }]
    })
      .select('senderId receiverId')
      .lean()
      .sort({ createdAt: -1 });

    const nodeIds = new Set();
    (currentUser?.vaultContacts || []).forEach((contactId) => nodeIds.add(contactId.toString()));

    messages.forEach(msg => {
      nodeIds.add(msg.senderId.toString());
      nodeIds.add(msg.receiverId.toString());
    });
    nodeIds.delete(req.vaultUser.id.toString());

    const nodes = await User.find({ _id: { $in: Array.from(nodeIds) } })
      .select('alias fitId avatarSeed isOnline lastSeen')
      .lean();

    res.json(nodes.map((node) => ({
      ...node,
      nickname: getNicknameForUser(currentUser?.vaultNicknames, node._id.toString())
    })));
  } catch (err) {
    console.error('Nodes Error:', err);
    res.status(500).send('Server error');
  }
});

// @route   DELETE api/sync-center/history/:otherUserId
// @desc    Clear message history with a specific user but keep the DM contact
router.delete('/history/:otherUserId', vaultAuth, async (req, res) => {
  try {
    const currentUserId = req.vaultUser.id;
    const otherUserId = req.params.otherUserId;

    await User.bulkWrite([
      {
        updateOne: {
          filter: { _id: currentUserId },
          update: { $addToSet: { vaultContacts: otherUserId } }
        }
      },
      {
        updateOne: {
          filter: { _id: otherUserId },
          update: { $addToSet: { vaultContacts: currentUserId } }
        }
      }
    ]);

    const deleteResult = await Message.deleteMany({
      $or: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId }
      ]
    });

    res.json({
      msg: 'Conversation cleared',
      deletedCount: deleteResult.deletedCount
    });
  } catch (err) {
    console.error('Clear History Error:', err);
    res.status(500).send('Server error');
  }
});

// @route   PATCH api/sync-center/contacts/:otherUserId/nickname
// @desc    Set or clear a nickname for a specific DM contact
router.patch('/contacts/:otherUserId/nickname', vaultAuth, async (req, res) => {
  try {
    const currentUserId = req.vaultUser.id;
    const otherUserId = req.params.otherUserId;
    const trimmedNickname = (req.body.nickname || '').trim().slice(0, 40);

    const currentUser = await User.findById(currentUserId);
    if (!currentUser) return res.status(404).json({ msg: 'User not found' });

    currentUser.vaultContacts = Array.from(new Set([
      ...(currentUser.vaultContacts || []).map((contactId) => contactId.toString()),
      otherUserId
    ]));

    if (!currentUser.vaultNicknames) {
      currentUser.vaultNicknames = new Map();
    }

    if (trimmedNickname) {
      currentUser.vaultNicknames.set(otherUserId, trimmedNickname);
    } else {
      currentUser.vaultNicknames.delete(otherUserId);
    }

    await currentUser.save();

    res.json({ nickname: trimmedNickname || null });
  } catch (err) {
    console.error('Nickname Update Error:', err);
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
    })
      .select('senderId receiverId encryptedMessage replyTo reactions seen createdAt')
      .populate('replyTo', 'encryptedMessage senderId')
      .sort({ createdAt: 1 })
      .lean();

    const decryptedMessages = messages.map(msg => {
      const msgObj = { ...msg };
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
    }).select('alias fitId avatarSeed isOnline').limit(10).lean();
    
    res.json(users);
  } catch (err) {
    console.error('Search Error:', err);
    res.status(500).send('Server error');
  }
});

module.exports = router;

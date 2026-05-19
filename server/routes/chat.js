const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const { auth, vaultAuth } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/encryption');

const getNicknameForUser = (nicknameMap, userId) => {
  if (!nicknameMap) return null;
  if (typeof nicknameMap.get === 'function') return nicknameMap.get(userId) || null;
  return nicknameMap[userId] || null;
};

const emitVaultMessage = async ({ io, senderId, receiverId, newMessage, plaintextMessage }) => {
  const sender = await User.findById(senderId).select('alias').lean();
  const populatedMessage = await newMessage.populate('replyTo', 'encryptedMessage senderId');
  const msgObj = populatedMessage.toObject();
  
  if (msgObj.messageType === 'text') {
    msgObj.message = plaintextMessage;
  }
  
  if (msgObj.replyTo) {
    try {
      msgObj.replyTo.message = decrypt(msgObj.replyTo.encryptedMessage);
    } catch (e) {
      msgObj.replyTo.message = "[Decryption Error]";
    }
    delete msgObj.replyTo.encryptedMessage;
  }

  io.to(`notify:${receiverId}`).emit('vaultNotification', {
    senderId,
    senderAlias: sender?.alias || 'Node',
    createdAt: newMessage.createdAt
  });

  io.to(`vault:${receiverId}`).to(`vault:${senderId}`).emit('message', msgObj);
  return msgObj;
};

const persistMessage = async ({ senderId, receiverId, message, replyTo, messageType = 'text', fileData, fileName }) => {
  await User.bulkWrite([
    {
      updateOne: {
        filter: { _id: senderId },
        update: { $addToSet: { vaultContacts: receiverId } }
      }
    },
    {
      updateOne: {
        filter: { _id: receiverId },
        update: { $addToSet: { vaultContacts: senderId } }
      }
    }
  ]);

  const encryptedMessage = message ? encrypt(message) : undefined;
  
  let expiresAt;
  if (messageType === 'image') {
    expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes TTL
  }

  const newMessage = new Message({
    senderId,
    receiverId,
    encryptedMessage,
    messageType,
    fileData,
    fileName,
    expiresAt,
    replyTo
  });
  await newMessage.save();
  return newMessage;
};

// @route   GET api/sync-center/unread-count
// @desc    Get unread private message count for the logged-in user
router.get('/unread-count', auth, async (req, res) => {
  try {
    const unreadCount = await Message.countDocuments({
      receiverId: req.user.id,
      seen: false
    });

    res.json({ unreadCount });
  } catch (err) {
    console.error('Unread Count Error:', err);
    res.status(500).send('Server error');
  }
});

// @route   GET api/sync-center/nodes
// @desc    Get users you have messaged or received messages from
router.get('/nodes', vaultAuth, async (req, res) => {
  try {
    const currentUserId = req.vaultUser.id;
    const currentUser = await User.findById(currentUserId)
      .select('vaultContacts vaultNicknames')
      .lean();

    // Find all active message threads for the user
    const messages = await Message.find({
      $and: [
        { $or: [{ senderId: currentUserId }, { receiverId: currentUserId }] },
        { deletedBy: { $ne: currentUserId } }
      ]
    })
      .select('senderId receiverId createdAt seen')
      .lean()
      .sort({ createdAt: -1 });

    const nodeStats = new Map();

    // Initialize with vaultContacts (explicitly added nodes)
    (currentUser?.vaultContacts || []).forEach((contactId) => {
      const idStr = contactId.toString();
      nodeStats.set(idStr, {
        lastInteraction: new Date(0), // Default to very old
        unreadCount: 0
      });
    });

    // Process messages to get latest interaction and unread count
    messages.forEach(msg => {
      const otherId = msg.senderId.toString() === currentUserId ? msg.receiverId.toString() : msg.senderId.toString();
      
      if (!nodeStats.has(otherId)) {
        nodeStats.set(otherId, { lastInteraction: msg.createdAt, unreadCount: 0 });
      }

      const stats = nodeStats.get(otherId);
      
      // Update latest interaction time
      if (new Date(msg.createdAt) > stats.lastInteraction) {
        stats.lastInteraction = msg.createdAt;
      }

      // Increment unread count if message was received by current user and not seen
      if (msg.receiverId.toString() === currentUserId && !msg.seen) {
        stats.unreadCount++;
      }
    });

    const nodeIds = Array.from(nodeStats.keys());
    const nodes = await User.find({ _id: { $in: nodeIds } })
      .select('alias fitId avatarSeed isOnline lastSeen')
      .lean();

    const result = nodes.map((node) => {
      const stats = nodeStats.get(node._id.toString());
      return {
        ...node,
        nickname: getNicknameForUser(currentUser?.vaultNicknames, node._id.toString()),
        unreadCount: stats.unreadCount,
        lastInteraction: stats.lastInteraction
      };
    });

    // Sort by lastInteraction (most recent first)
    result.sort((a, b) => new Date(b.lastInteraction).getTime() - new Date(a.lastInteraction).getTime());

    res.json(result);
  } catch (err) {
    console.error('Nodes Error:', err);
    res.status(500).send('Server error');
  }
});

// @route   DELETE api/sync-center/contacts/:otherUserId
// @desc    Remove a contact from the list and hide their history for the current user
router.delete('/contacts/:otherUserId', vaultAuth, async (req, res) => {
  try {
    const currentUserId = req.vaultUser.id;
    const otherUserId = req.params.otherUserId;

    // Remove from vaultContacts
    await User.findByIdAndUpdate(currentUserId, {
      $pull: { vaultContacts: otherUserId }
    });

    // Mark all existing messages as deleted by this user
    await Message.updateMany(
      {
        $or: [
          { senderId: currentUserId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: currentUserId }
        ]
      },
      { $addToSet: { deletedBy: currentUserId } }
    );

    res.json({ msg: 'Contact and history removed for you' });
  } catch (err) {
    console.error('Delete Contact Error:', err);
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

// @route   POST api/sync-center/message
// @desc    Send a private message with HTTP fallback support
router.post('/message', vaultAuth, async (req, res) => {
  try {
    const senderId = req.vaultUser.id;
    const { receiverId, message, replyTo, messageType, fileData, fileName } = req.body;
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';

    if (!receiverId || (messageType !== 'image' && !trimmedMessage)) {
      return res.status(400).json({ msg: 'receiverId and message are required' });
    }

    const newMessage = await persistMessage({
      senderId,
      receiverId,
      message: trimmedMessage,
      messageType,
      fileData,
      fileName,
      replyTo
    });

    const msgObj = await emitVaultMessage({
      io: req.app.get('io'),
      senderId,
      receiverId,
      newMessage,
      plaintextMessage: trimmedMessage
    });

    res.status(201).json(msgObj);
  } catch (err) {
    console.error('HTTP Send Message Error:', err);
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
    const currentUserId = req.vaultUser.id;
    const messages = await Message.find({
      $and: [
        {
          $or: [
            { senderId: currentUserId, receiverId: req.params.otherUserId },
            { senderId: req.params.otherUserId, receiverId: currentUserId }
          ]
        },
        { deletedBy: { $ne: currentUserId } }
      ]
    })
      .select('senderId receiverId encryptedMessage messageType fileData fileName expiresAt replyTo reactions seen createdAt')
      .populate('replyTo', 'encryptedMessage senderId')
      .sort({ createdAt: 1 })
      .lean();

    const decryptedMessages = messages.map(msg => {
      const msgObj = { ...msg };
      if (msg.messageType === 'text') {
        try {
          msgObj.message = decrypt(msg.encryptedMessage);
        } catch (e) {
          msgObj.message = "[Decryption Error]";
        }
      }
      
      if (msgObj.replyTo) {
        try {
          msgObj.replyTo.message = decrypt(msgObj.replyTo.encryptedMessage);
        } catch (e) {
          msgObj.replyTo.message = "[Decryption Error]";
        }
        delete msgObj.replyTo.encryptedMessage;
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

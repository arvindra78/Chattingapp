const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const ChatTheme = require('../models/ChatTheme');
const { auth, vaultAuth } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/encryption');

const CHAT_THEMES = new Set(['matrix', 'midnight', 'ember', 'ocean', 'violet', 'rose']);

const getParticipantsKey = (userA, userB) => [userA.toString(), userB.toString()].sort().join(':');

const getNicknameForUser = (nicknameMap, userId) => {
  if (!nicknameMap) return null;
  if (typeof nicknameMap.get === 'function') return nicknameMap.get(userId) || null;
  return nicknameMap[userId] || null;
};

const getSharedTheme = async (userA, userB) => {
  const participantsKey = getParticipantsKey(userA, userB);
  const theme = await ChatTheme.findOne({ participantsKey }).lean();
  return theme?.themeId || 'matrix';
};

const hasApprovedContact = async (userId, otherUserId) => {
  const user = await User.exists({ _id: userId, vaultContacts: otherUserId });
  return Boolean(user);
};

const canStartDirectDm = async (senderId, receiverId) => {
  if (await hasApprovedContact(senderId, receiverId)) return true;
  const receiver = await User.exists({ _id: receiverId, isDiscoverable: { $ne: false } });
  return Boolean(receiver);
};

const emitVaultMessage = async ({ io, senderId, receiverId, newMessage, plaintextMessage }) => {
  const sender = await User.findById(senderId).select('alias').lean();
  const populatedMessage = await newMessage.populate('replyTo', 'encryptedMessage senderId');
  const msgObj = populatedMessage.toObject();
  msgObj.message = plaintextMessage;
  if (msgObj.replyTo) {
    msgObj.replyTo.message = decrypt(msgObj.replyTo.encryptedMessage);
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

const persistMessage = async ({ senderId, receiverId, message, replyTo }) => {
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

  const encryptedMessage = encrypt(message);
  const newMessage = new Message({
    senderId,
    receiverId,
    encryptedMessage,
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
      seen: false,
      deletedBy: { $ne: req.user.id }
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
    const currentUser = await User.findById(req.vaultUser.id)
      .select('vaultContacts vaultNicknames')
      .lean();

    // Find unique user IDs from messages where current user is sender or receiver
    const messages = await Message.find({
      $or: [{ senderId: currentUserId }, { receiverId: currentUserId }],
      deletedBy: { $ne: currentUserId }
    })
      .select('senderId receiverId seen createdAt')
      .lean()
      .sort({ createdAt: -1 });

    const nodeIds = new Set();
    const interactionByNodeId = new Map();
    (currentUser?.vaultContacts || []).forEach((contactId) => nodeIds.add(contactId.toString()));

    messages.forEach(msg => {
      nodeIds.add(msg.senderId.toString());
      nodeIds.add(msg.receiverId.toString());

      const otherUserId = msg.senderId.toString() === currentUserId.toString()
        ? msg.receiverId.toString()
        : msg.senderId.toString();
      const interaction = interactionByNodeId.get(otherUserId) || {
        lastInteraction: msg.createdAt,
        unreadCount: 0
      };
      if (msg.receiverId.toString() === currentUserId.toString() && !msg.seen) {
        interaction.unreadCount += 1;
      }
      interactionByNodeId.set(otherUserId, interaction);
    });
    nodeIds.delete(currentUserId.toString());

    const nodes = await User.find({ _id: { $in: Array.from(nodeIds) } })
      .select('alias fitId avatarSeed isOnline lastSeen')
      .lean();

    const nodesWithInteraction = nodes.map((node) => {
      const interaction = interactionByNodeId.get(node._id.toString());
      return {
        ...node,
        nickname: getNicknameForUser(currentUser?.vaultNicknames, node._id.toString()),
        unreadCount: interaction?.unreadCount || 0,
        lastInteraction: interaction?.lastInteraction || null
      };
    });

    nodesWithInteraction.sort((a, b) => {
      const aTime = a.lastInteraction ? new Date(a.lastInteraction).getTime() : 0;
      const bTime = b.lastInteraction ? new Date(b.lastInteraction).getTime() : 0;
      return bTime - aTime;
    });

    res.json(nodesWithInteraction);
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

    const deleteResult = await Message.updateMany({
      $or: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId }
      ],
      deletedBy: { $ne: currentUserId }
    }, {
      $addToSet: { deletedBy: currentUserId }
    });

    res.json({
      msg: 'Conversation cleared',
      deletedCount: deleteResult.modifiedCount
    });
  } catch (err) {
    console.error('Clear History Error:', err);
    res.status(500).send('Server error');
  }
});

// @route   DELETE api/sync-center/contacts/:otherUserId
// @desc    Remove a DM contact and hide that conversation for the current user
router.delete('/contacts/:otherUserId', vaultAuth, async (req, res) => {
  try {
    const currentUserId = req.vaultUser.id;
    const otherUserId = req.params.otherUserId;

    if (!mongoose.Types.ObjectId.isValid(otherUserId) || otherUserId === currentUserId.toString()) {
      return res.status(400).json({ msg: 'Invalid DM contact' });
    }

    await User.updateOne(
      { _id: currentUserId },
      {
        $pull: { vaultContacts: otherUserId },
        $unset: { [`vaultNicknames.${otherUserId}`]: 1 }
      }
    );

    const hideResult = await Message.updateMany({
      $or: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId }
      ],
      deletedBy: { $ne: currentUserId }
    }, {
      $addToSet: { deletedBy: currentUserId }
    });

    res.json({
      msg: 'DM removed',
      hiddenMessageCount: hideResult.modifiedCount
    });
  } catch (err) {
    console.error('Delete Contact Error:', err);
    res.status(500).send('Server error');
  }
});

// @route   GET api/sync-center/requests
// @desc    Get pending DM requests for the current user
router.get('/requests', vaultAuth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.vaultUser.id).select('dmRequests').lean();
    const requestIds = (currentUser?.dmRequests || []).map((request) => request.requesterId);
    const requesters = await User.find({ _id: { $in: requestIds } })
      .select('alias fitId avatarSeed isOnline')
      .lean();
    const requesterById = new Map(requesters.map((requester) => [requester._id.toString(), requester]));

    res.json((currentUser?.dmRequests || [])
      .map((request) => {
        const requester = requesterById.get(request.requesterId.toString());
        return requester && { ...requester, requestedAt: request.createdAt };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()));
  } catch (err) {
    console.error('DM Requests Error:', err);
    res.status(500).send('Server error');
  }
});

// @route   POST api/sync-center/requests/:otherUserId
// @desc    Send a DM request; messaging is unavailable until it is accepted
router.post('/requests/:otherUserId', vaultAuth, async (req, res) => {
  try {
    const currentUserId = req.vaultUser.id;
    const otherUserId = req.params.otherUserId;
    if (!mongoose.Types.ObjectId.isValid(otherUserId) || otherUserId === currentUserId.toString()) {
      return res.status(400).json({ msg: 'Invalid DM recipient' });
    }

    const [otherUser, alreadyConnected] = await Promise.all([
      User.exists({ _id: otherUserId }),
      hasApprovedContact(currentUserId, otherUserId)
    ]);
    if (!otherUser) return res.status(404).json({ msg: 'User not found' });
    if (alreadyConnected) return res.status(409).json({ msg: 'This DM is already approved' });

    const result = await User.updateOne(
      { _id: otherUserId, 'dmRequests.requesterId': { $ne: currentUserId } },
      { $push: { dmRequests: { requesterId: currentUserId } } }
    );
    if (!result.modifiedCount) return res.status(409).json({ msg: 'DM request is already pending' });

    req.app.get('io').to(`vault:${otherUserId}`).emit('dmRequestReceived');
    res.status(201).json({ msg: 'DM request sent' });
  } catch (err) {
    console.error('DM Request Error:', err);
    res.status(500).send('Server error');
  }
});

// @route   PATCH api/sync-center/requests/:otherUserId
// @desc    Accept or decline a pending DM request
router.patch('/requests/:otherUserId', vaultAuth, async (req, res) => {
  try {
    const currentUserId = req.vaultUser.id;
    const otherUserId = req.params.otherUserId;
    const action = req.body.action;
    if (!mongoose.Types.ObjectId.isValid(otherUserId) || !['accept', 'decline'].includes(action)) {
      return res.status(400).json({ msg: 'Invalid DM request action' });
    }

    const currentUser = await User.findOne({ _id: currentUserId, 'dmRequests.requesterId': otherUserId }).select('_id');
    if (!currentUser) return res.status(404).json({ msg: 'DM request not found' });

    if (action === 'accept') {
      await User.bulkWrite([
        { updateOne: { filter: { _id: currentUserId }, update: { $addToSet: { vaultContacts: otherUserId } } } },
        { updateOne: { filter: { _id: otherUserId }, update: { $addToSet: { vaultContacts: currentUserId } } } }
      ]);
    }
    await User.updateOne(
      { _id: currentUserId },
      { $pull: { dmRequests: { requesterId: otherUserId } } }
    );

    req.app.get('io').to(`vault:${otherUserId}`).emit('dmRequestResolved', { accepted: action === 'accept' });
    res.json({ msg: action === 'accept' ? 'DM request accepted' : 'DM request declined' });
  } catch (err) {
    console.error('DM Request Update Error:', err);
    res.status(500).send('Server error');
  }
});

// @route   POST api/sync-center/message
// @desc    Send a private message with HTTP fallback support
router.post('/message', vaultAuth, async (req, res) => {
  try {
    const senderId = req.vaultUser.id;
    const { receiverId, message, replyTo } = req.body;
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';

    if (!receiverId || !trimmedMessage) {
      return res.status(400).json({ msg: 'receiverId and message are required' });
    }
    if (!await canStartDirectDm(senderId, receiverId)) {
      return res.status(403).json({ msg: 'This private account must accept your DM request first' });
    }

    const newMessage = await persistMessage({
      senderId,
      receiverId,
      message: trimmedMessage,
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

// @route   GET api/sync-center/contacts/:otherUserId/theme
// @desc    Get shared chat theme for a DM
router.get('/contacts/:otherUserId/theme', vaultAuth, async (req, res) => {
  try {
    const currentUserId = req.vaultUser.id;
    const otherUserId = req.params.otherUserId;
    const themeId = await getSharedTheme(currentUserId, otherUserId);
    res.json({ themeId });
  } catch (err) {
    console.error('Theme Fetch Error:', err);
    res.status(500).send('Server error');
  }
});

// @route   PATCH api/sync-center/contacts/:otherUserId/theme
// @desc    Set shared chat theme for both DM participants
router.patch('/contacts/:otherUserId/theme', vaultAuth, async (req, res) => {
  try {
    const currentUserId = req.vaultUser.id;
    const otherUserId = req.params.otherUserId;
    const themeId = (req.body.themeId || '').trim();

    if (!CHAT_THEMES.has(themeId)) {
      return res.status(400).json({ msg: 'Invalid chat theme' });
    }

    const participantsKey = getParticipantsKey(currentUserId, otherUserId);
    const participants = participantsKey.split(':');
    const theme = await ChatTheme.findOneAndUpdate(
      { participantsKey },
      { participants, themeId, updatedBy: currentUserId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    req.app.get('io')
      .to(`vault:${currentUserId}`)
      .to(`vault:${otherUserId}`)
      .emit('chatThemeUpdated', {
        userIds: participants,
        themeId: theme.themeId,
        updatedBy: currentUserId
      });

    res.json({ themeId: theme.themeId });
  } catch (err) {
    console.error('Theme Update Error:', err);
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
      ],
      deletedBy: { $ne: req.vaultUser.id }
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
// @desc    Search public Discovery handles
router.get('/search', vaultAuth, async (req, res) => {
  const query = String(req.query.q || '').trim();
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  try {
    const users = await User.find({
      $and: [
        { _id: { $ne: req.vaultUser.id } }, // Don't find yourself
        ...(escapedQuery ? [{
          $or: [
            { fitId: { $regex: escapedQuery, $options: 'i' } },
            { alias: { $regex: escapedQuery, $options: 'i' } }
          ]
        }] : [{ isDiscoverable: { $ne: false } }])
      ]
    }).select('alias fitId avatarSeed isOnline isDiscoverable').sort({ fitId: 1 }).limit(100).lean();
    
    res.json(users);
  } catch (err) {
    console.error('Search Error:', err);
    res.status(500).send('Server error');
  }
});


    
module.exports = router;

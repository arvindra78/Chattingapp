const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const { encrypt, decrypt } = require('../utils/encryption');

module.exports = (io) => {
  io.use((socket, next) => {
    try {
      const vaultToken = socket.handshake.auth.token;
      const authToken = socket.handshake.auth.authToken;
      const token = vaultToken || authToken;
      if (!token) return next(new Error('Authentication error'));

      const secret = vaultToken ? process.env.VAULT_SECRET : process.env.JWT_SECRET;
      const decoded = jwt.verify(token, secret);
      socket.user = decoded.user;
      socket.canAccessVault = Boolean(vaultToken);
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user.id;
    const notificationRoom = `notify:${userId}`;
    const vaultRoom = `vault:${userId}`;
    console.log(`[Socket] Vault connection: ${userId}`);
    
    socket.join(notificationRoom);
    if (socket.canAccessVault) {
      socket.join(vaultRoom);
    }
    
    try {
      const activeConnections = io.sockets.adapter.rooms.get(notificationRoom)?.size || 0;
      if (activeConnections === 1) {
        await User.findByIdAndUpdate(userId, { isOnline: true });
        socket.broadcast.emit('userStatus', { userId, isOnline: true });
      }
    } catch (err) {
      console.error('[Socket] Status Update Error:', err);
    }

    socket.on('sendMessage', async ({ receiverId, message, replyTo, messageType = 'text', fileData, fileName }, acknowledge) => {
      console.log(`[Socket] Message from ${userId} to ${receiverId} (${messageType})`);
      try {
        if (!socket.canAccessVault) {
          socket.emit('error', { msg: 'Vault access required' });
          if (typeof acknowledge === 'function') acknowledge({ ok: false, msg: 'Vault access required' });
          return;
        }
        if (!receiverId || (messageType !== 'image' && !message)) return;

        await User.bulkWrite([
          {
            updateOne: {
              filter: { _id: userId },
              update: { $addToSet: { vaultContacts: receiverId } }
            }
          },
          {
            updateOne: {
              filter: { _id: receiverId },
              update: { $addToSet: { vaultContacts: userId } }
            }
          }
        ]);

        const encryptedMessage = message ? encrypt(message) : undefined;
        
        let expiresAt;
        if (messageType === 'image') {
          expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes TTL
        }

        const newMessage = new Message({
          senderId: userId,
          receiverId,
          encryptedMessage,
          messageType,
          fileData,
          fileName,
          expiresAt,
          replyTo
        });
        await newMessage.save();

        const sender = await User.findById(userId).select('alias').lean();
        let populatedMessage = await newMessage.populate('replyTo', 'encryptedMessage senderId');
        const msgObj = populatedMessage.toObject();
        
        if (msgObj.messageType === 'text') {
          msgObj.message = message;
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
          senderId: userId,
          senderAlias: sender?.alias || 'Node',
          createdAt: newMessage.createdAt
        });

        // Emit full message only to unlocked vault sessions
        io.to(`vault:${receiverId}`).to(`vault:${userId}`).emit('message', msgObj);
        if (typeof acknowledge === 'function') acknowledge({ ok: true, messageId: newMessage.id });
      } catch (err) {
        console.error('[Socket] Send Message Error:', err);
        socket.emit('error', { msg: 'Failed to send message' });
        if (typeof acknowledge === 'function') acknowledge({ ok: false, msg: 'Failed to send message' });
      }
    });

    socket.on('reactToMessage', async ({ messageId, emoji, receiverId }) => {
      try {
        if (!socket.canAccessVault) return;
        const message = await Message.findById(messageId);
        if (!message) return;

        const reactionIndex = message.reactions.findIndex(r => r.userId.toString() === userId);
        if (reactionIndex > -1) {
          if (message.reactions[reactionIndex].emoji === emoji) {
            message.reactions.splice(reactionIndex, 1); // Toggle off
          } else {
            message.reactions[reactionIndex].emoji = emoji; // Update
          }
        } else {
          message.reactions.push({ userId, emoji });
        }

        await message.save();
        io.to(receiverId).to(userId).emit('reactionUpdate', { messageId, reactions: message.reactions });
      } catch (err) {
        console.error('[Socket] Reaction Error:', err);
      }
    });

    socket.on('markSeen', async ({ senderId }) => {
      try {
        if (!socket.canAccessVault) return;
        await Message.updateMany(
          { senderId, receiverId: userId, seen: false },
          { seen: true }
        );
        // Notify the original sender that their messages were seen
        io.to(`vault:${senderId}`).emit('messagesSeen', { seenBy: userId });
      } catch (err) {
        console.error('[Socket] Mark Seen Error:', err);
      }
    });

    socket.on('typing', ({ receiverId, isTyping }) => {
      if (!socket.canAccessVault) return;
      socket.to(`vault:${receiverId}`).emit('typing', { senderId: userId, isTyping });
    });

    const requireVaultSignalAccess = (eventName) => {
      if (socket.canAccessVault) return true;
      console.warn(`[Socket] Blocked unauthorized ${eventName} signal from ${userId}`);
      socket.emit('error', { msg: 'Vault access required' });
      return false;
    };

    const getCallerAlias = async () => {
      if (socket.user.alias) return socket.user.alias;
      const caller = await User.findById(userId).select('alias').lean();
      return caller?.alias || 'User';
    };

    // --- WebRTC Video Call Signaling ---
    socket.on('call-user', async ({ receiverId, offer, callId }) => {
      try {
        if (!requireVaultSignalAccess('call-user') || !receiverId || !offer) return;
        const callerAlias = await getCallerAlias();
        console.log(`[Socket] Call initiated by ${userId} to ${receiverId}`, { callId });
        socket.to(`vault:${receiverId}`).emit('incoming-call', {
          callerId: userId,
          callerAlias,
          offer,
          callId
        });
      } catch (err) {
        console.error('[Socket] Call Initiation Error:', err);
        socket.emit('call-error', { msg: 'Failed to initiate call' });
      }
    });

    socket.on('answer-call', ({ callerId, answer, callId }) => {
      if (!requireVaultSignalAccess('answer-call') || !callerId || !answer) return;
      console.log(`[Socket] Call answered by ${userId} for caller ${callerId}`, { callId });
      socket.to(`vault:${callerId}`).emit('call-answered', {
        answererId: userId,
        answer,
        callId
      });
    });

    socket.on('reject-call', ({ callerId, callId }) => {
      if (!requireVaultSignalAccess('reject-call') || !callerId) return;
      console.log(`[Socket] Call rejected by ${userId} for caller ${callerId}`, { callId });
      socket.to(`vault:${callerId}`).emit('call-rejected', {
        reason: 'Call rejected',
        callId
      });
    });

    socket.on('ice-candidate', ({ receiverId, candidate, callId }) => {
      if (!requireVaultSignalAccess('ice-candidate') || !receiverId || !candidate) return;
      console.log(`[Socket] ICE candidate from ${userId} to ${receiverId}`, { callId });
      socket.to(`vault:${receiverId}`).emit('ice-candidate', {
        candidate,
        senderId: userId,
        callId
      });
    });

    socket.on('end-call', ({ receiverId, callId }) => {
      if (!requireVaultSignalAccess('end-call') || !receiverId) return;
      console.log(`[Socket] Call ended by ${userId} for ${receiverId}`, { callId });
      socket.to(`vault:${receiverId}`).emit('call-ended', {
        senderId: userId,
        callId
      });
    });
    // --- End WebRTC Signaling ---

    socket.on('disconnect', async () => {
      console.log(`[Socket] Vault disconnect: ${userId}`);
      try {
        const remainingConnections = io.sockets.adapter.rooms.get(notificationRoom)?.size || 0;
        if (remainingConnections === 0) {
          await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
          socket.broadcast.emit('userStatus', { userId, isOnline: false });
        }
      } catch (err) {
        console.error('[Socket] Disconnect Status Error:', err);
      }
    });
  });
};

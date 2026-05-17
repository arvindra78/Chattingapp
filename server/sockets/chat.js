const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const { encrypt, decrypt } = require('../utils/encryption');

module.exports = (io) => {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    
    try {
      const decoded = jwt.verify(token, process.env.VAULT_SECRET);
      socket.user = decoded.user;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user.id;
    console.log(`[Socket] Vault connection: ${userId}`);
    
    // Join private room for targeted messaging
    socket.join(userId);
    
    try {
      // Set user online
      await User.findByIdAndUpdate(userId, { isOnline: true });
      socket.broadcast.emit('userStatus', { userId, isOnline: true });
    } catch (err) {
      console.error('[Socket] Status Update Error:', err);
    }

    socket.on('sendMessage', async ({ receiverId, message, replyTo }) => {
      console.log(`[Socket] Message from ${userId} to ${receiverId}`);
      try {
        if (!message || !receiverId) return;

        const encryptedMessage = encrypt(message);
        const newMessage = new Message({
          senderId: userId,
          receiverId,
          encryptedMessage,
          replyTo
        });
        await newMessage.save();

        let populatedMessage = await newMessage.populate('replyTo', 'encryptedMessage senderId');
        const msgObj = populatedMessage.toObject();
        msgObj.message = message;
        if (msgObj.replyTo) {
          msgObj.replyTo.message = decrypt(msgObj.replyTo.encryptedMessage);
          delete msgObj.replyTo.encryptedMessage;
        }

        // Emit to both sender and receiver rooms
        io.to(receiverId).to(userId).emit('message', msgObj);
      } catch (err) {
        console.error('[Socket] Send Message Error:', err);
        socket.emit('error', { msg: 'Failed to send message' });
      }
    });

    socket.on('reactToMessage', async ({ messageId, emoji, receiverId }) => {
      try {
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
        await Message.updateMany(
          { senderId, receiverId: userId, seen: false },
          { seen: true }
        );
        // Notify the original sender that their messages were seen
        io.to(senderId).emit('messagesSeen', { seenBy: userId });
      } catch (err) {
        console.error('[Socket] Mark Seen Error:', err);
      }
    });

    socket.on('typing', ({ receiverId, isTyping }) => {
      socket.to(receiverId).emit('typing', { senderId: userId, isTyping });
    });

    socket.on('disconnect', async () => {
      console.log(`[Socket] Vault disconnect: ${userId}`);
      try {
        await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
        socket.broadcast.emit('userStatus', { userId, isOnline: false });
      } catch (err) {
        console.error('[Socket] Disconnect Status Error:', err);
      }
    });
  });
};

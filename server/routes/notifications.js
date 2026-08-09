const express = require('express');
const rateLimit = require('express-rate-limit');
const PushSubscription = require('../models/PushSubscription');
const { auth } = require('../middleware/auth');
const { getVapidConfiguration, sendPushToUser } = require('../utils/pushNotifications');

const router = express.Router();

const notificationTestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false
});

const getSubscriptionData = (body) => {
  const subscription = body?.subscription || body;
  const endpoint = typeof subscription?.endpoint === 'string' ? subscription.endpoint : '';
  const p256dh = typeof subscription?.keys?.p256dh === 'string' ? subscription.keys.p256dh : '';
  const authKey = typeof subscription?.keys?.auth === 'string' ? subscription.keys.auth : '';
  return { endpoint, p256dh, auth: authKey };
};

router.get('/vapid-public-key', auth, (_req, res) => {
  const vapid = getVapidConfiguration();
  if (!vapid) return res.status(503).json({ msg: 'Push notifications are not configured' });
  res.json({ publicKey: vapid.publicKey });
});

router.post('/subscribe', auth, async (req, res) => {
  try {
    const { endpoint, p256dh, auth: authKey } = getSubscriptionData(req.body);
    if (!endpoint || !p256dh || !authKey || endpoint.length > 2048) {
      return res.status(400).json({ msg: 'Invalid push subscription' });
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { userId: req.user.id, endpoint, p256dh, auth: authKey },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ msg: 'Notifications enabled' });
  } catch (error) {
    console.error('[Push] Subscription save failed', error.message);
    res.status(500).json({ msg: 'Unable to save notification subscription' });
  }
});

router.delete('/subscribe', auth, async (req, res) => {
  try {
    const { endpoint } = getSubscriptionData(req.body);
    if (!endpoint) return res.status(400).json({ msg: 'Subscription endpoint is required' });
    await PushSubscription.deleteOne({ userId: req.user.id, endpoint });
    res.json({ msg: 'Notifications disabled' });
  } catch (error) {
    console.error('[Push] Subscription removal failed', error.message);
    res.status(500).json({ msg: 'Unable to remove notification subscription' });
  }
});

router.post('/test', auth, notificationTestLimiter, async (req, res) => {
  try {
    await sendPushToUser(req.user.id, {
      title: 'FitMask notifications enabled',
      body: 'Your device can receive private message alerts.',
      icon: '/logo.png',
      badge: '/logo.png',
      data: { url: '/advanced-metrics' }
    });
    res.json({ msg: 'Test notification sent' });
  } catch (error) {
    console.error('[Push] Test notification failed', error.message);
    res.status(500).json({ msg: 'Unable to send test notification' });
  }
});

module.exports = router;

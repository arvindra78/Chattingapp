const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

const getVapidConfiguration = () => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return null;
  return { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY, subject: VAPID_SUBJECT };
};

const configureWebPush = () => {
  const vapid = getVapidConfiguration();
  if (!vapid) return null;
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  return vapid;
};

const sendPushNotification = async (subscription, payload) => {
  if (!configureWebPush()) return { sent: false, reason: 'not-configured' };

  try {
    await webpush.sendNotification({
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth }
    }, JSON.stringify(payload), { TTL: 60 });
    return { sent: true };
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      await PushSubscription.deleteOne({ _id: subscription._id });
      console.info('[Push] Removed expired subscription');
    } else {
      console.error('[Push] Delivery failed', { statusCode: error.statusCode, message: error.message });
    }
    return { sent: false, reason: 'delivery-failed' };
  }
};

const sendPushToUser = async (userId, payload) => {
  const subscriptions = await PushSubscription.find({ userId }).lean();
  await Promise.all(subscriptions.map((subscription) => sendPushNotification(subscription, payload)));
};

module.exports = { getVapidConfiguration, sendPushNotification, sendPushToUser };

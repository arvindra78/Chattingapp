const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth, vaultAuth } = require('../middleware/auth');

const HANDLE_PATTERN = /^[a-z0-9_.]{3,24}$/i;

const normalizeHandle = (value) => String(value || '').trim().toLowerCase();

// @route   POST api/auth/register
// @desc    Register user
router.post('/register', async (req, res) => {
  const { username, alias, email, password, unlockCode, fitId, isDiscoverable = true } = req.body;
  const normalizedFitId = normalizeHandle(fitId);
  const normalizedAlias = String(alias || '').trim();

  try {
    if (!HANDLE_PATTERN.test(normalizedFitId)) {
      return res.status(400).json({ msg: 'FitID must be 3-24 letters, numbers, dots, or underscores' });
    }
    if (normalizedAlias.length < 3 || normalizedAlias.length > 24) {
      return res.status(400).json({ msg: 'Display name must be 3-24 characters' });
    }

    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'Email already exists' });

    user = await User.findOne({ username });
    if (user) return res.status(400).json({ msg: 'Username already exists' });

    user = await User.findOne({ alias: normalizedAlias });
    if (user) return res.status(400).json({ msg: 'Display name already exists' });

    user = await User.findOne({ fitId: normalizedFitId });
    if (user) return res.status(400).json({ msg: 'FitID already taken' });

    user = new User({
      username,
      email,
      passwordHash: await bcrypt.hash(String(password), 10),
      unlockCode: await bcrypt.hash(String(unlockCode), 10),
      alias: normalizedAlias,
      fitId: normalizedFitId,
      isDiscoverable: Boolean(isDiscoverable),
      avatarSeed: Math.random().toString(36).substring(7)
    });

    await user.save();

    const payload = { user: { id: user.id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: user.id, username, alias: user.alias, fitId: user.fitId, isDiscoverable: user.isDiscoverable } });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/auth/login
// @desc    Login user
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

    const payload = { user: { id: user.id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: user.id, username: user.username, alias: user.alias, fitId: user.fitId, isDiscoverable: user.isDiscoverable } });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   PATCH api/auth/profile
// @desc    Update one or more profile fields
router.patch('/profile', auth, async (req, res) => {
  const updates = {};
  const hasField = (field) => Object.prototype.hasOwnProperty.call(req.body, field);

  try {
    if (hasField('username')) {
      const username = String(req.body.username || '').trim();
      if (username.length < 3 || username.length > 24) {
        return res.status(400).json({ msg: 'Username must be 3-24 characters' });
      }
      updates.username = username;
    }
    if (hasField('alias')) {
      const alias = String(req.body.alias || '').trim();
      if (alias.length < 3 || alias.length > 24) {
        return res.status(400).json({ msg: 'Display name must be 3-24 characters' });
      }
      updates.alias = alias;
    }
    if (hasField('fitId')) {
      const fitId = normalizeHandle(req.body.fitId);
      if (!HANDLE_PATTERN.test(fitId)) {
        return res.status(400).json({ msg: 'FitID must be 3-24 letters, numbers, dots, or underscores' });
      }
      updates.fitId = fitId;
    }
    if (hasField('isDiscoverable')) updates.isDiscoverable = Boolean(req.body.isDiscoverable);
    if (!Object.keys(updates).length) return res.status(400).json({ msg: 'No profile changes supplied' });

    const uniquenessChecks = ['username', 'alias', 'fitId']
      .filter((field) => updates[field])
      .map((field) => ({ [field]: updates[field] }));
    const existingUser = uniquenessChecks.length && await User.findOne({ _id: { $ne: req.user.id }, $or: uniquenessChecks });
    if (existingUser) {
      const field = existingUser.username === updates.username ? 'Username' : existingUser.alias === updates.alias ? 'Display name' : 'FitID';
      return res.status(400).json({ msg: `${field} already exists` });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      updates,
      { new: true }
    ).select('username alias fitId isDiscoverable');

    if (!user) return res.status(404).json({ msg: 'User not found' });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        alias: user.alias,
        fitId: user.fitId,
        isDiscoverable: user.isDiscoverable
      }
    });
  } catch (err) {
    console.error('Profile Update Error:', err);
    res.status(500).send('Server error');
  }
});

// @route   PATCH api/auth/password
// @desc    Change account password
router.patch('/password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ msg: 'Current and new password are required' });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ msg: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) return res.status(400).json({ msg: 'Current password is incorrect' });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ msg: 'Password updated' });
  } catch (err) {
    console.error('Password Update Error:', err);
    res.status(500).send('Server error');
  }
});

// @route   POST api/auth/unlock-vault
// @desc    Unlock vault and get Vault JWT
router.post('/unlock-vault', auth, async (req, res) => {
  const { unlockCode } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const isMatch = await bcrypt.compare(String(unlockCode), user.unlockCode);
    if (!isMatch) return res.status(400).json({ msg: 'Incorrect passcode' });

    const payload = { user: { id: user.id } };
    const vaultToken = jwt.sign(payload, process.env.VAULT_SECRET, { expiresIn: '1h' });

    user.vaultUnlockedAt = new Date();
    await user.save();

    res.json({ vaultToken });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   PATCH api/auth/vault-passcode
// @desc    Change vault passcode
router.patch('/vault-passcode', vaultAuth, async (req, res) => {
  const { currentPasscode, newPasscode } = req.body;

  try {
    if (!currentPasscode || !newPasscode) {
      return res.status(400).json({ msg: 'Current and new passcode are required' });
    }

    // Relaxed validation: Allow alphanumeric and flexible length
    if (String(newPasscode).length < 4) {
      return res.status(400).json({ msg: 'New passcode must be at least 4 characters' });
    }

    const user = await User.findById(req.vaultUser.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const isMatch = await bcrypt.compare(String(currentPasscode), user.unlockCode);
    if (!isMatch) return res.status(400).json({ msg: 'Incorrect current passcode' });

    user.unlockCode = await bcrypt.hash(String(newPasscode), 10);
    await user.save();

    res.json({ msg: 'Vault passcode updated' });
  } catch (err) {
    console.error('Vault Passcode Update Error:', err);
    res.status(500).send('Server error');
  }
});

module.exports = router;

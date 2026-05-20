const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { generateAlias } = require('../utils/alias');
const { auth } = require('../middleware/auth');

// @route   POST api/auth/register
// @desc    Register user
router.post('/register', async (req, res) => {
  const { username, email, password, unlockCode, fitId } = req.body;
  const normalizedFitId = (fitId || '').trim().toUpperCase();

  try {
    if (!normalizedFitId) {
      return res.status(400).json({ msg: 'FitID is required' });
    }

    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'Email already exists' });

    user = await User.findOne({ username });
    if (user) return res.status(400).json({ msg: 'Username already exists' });

    user = await User.findOne({ fitId: normalizedFitId });
    if (user) return res.status(400).json({ msg: 'FitID already taken' });

    user = new User({
      username,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      unlockCode: await bcrypt.hash(unlockCode, 10),
      alias: generateAlias(),
      fitId: normalizedFitId,
      avatarSeed: Math.random().toString(36).substring(7)
    });

    await user.save();

    const payload = { user: { id: user.id } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: user.id, username, alias: user.alias, fitId: user.fitId } });
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

    res.json({ token, user: { id: user.id, username: user.username, alias: user.alias, fitId: user.fitId } });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   PATCH api/auth/profile
// @desc    Update username
router.patch('/profile', auth, async (req, res) => {
  const username = (req.body.username || '').trim();

  try {
    if (username.length < 3 || username.length > 24) {
      return res.status(400).json({ msg: 'Username must be 3-24 characters' });
    }

    const existingUser = await User.findOne({ username, _id: { $ne: req.user.id } });
    if (existingUser) return res.status(400).json({ msg: 'Username already exists' });

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { username },
      { new: true }
    ).select('username alias fitId');

    if (!user) return res.status(404).json({ msg: 'User not found' });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        alias: user.alias,
        fitId: user.fitId
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

    const isMatch = await bcrypt.compare(unlockCode, user.unlockCode);
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

module.exports = router;

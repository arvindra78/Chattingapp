const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { generateAlias, generateFitId } = require('../utils/alias');
const { auth } = require('../middleware/auth');

// @route   POST api/auth/register
// @desc    Register user
router.post('/register', async (req, res) => {
  const { username, email, password, unlockCode } = req.body;

  try {
    let user = await User.findOne({ $or: [{ email }, { username }] });
    if (user) return res.status(400).json({ msg: 'User already exists' });

    user = new User({
      username,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      unlockCode: await bcrypt.hash(unlockCode, 10),
      alias: generateAlias(),
      fitId: generateFitId(),
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

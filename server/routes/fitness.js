const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { auth } = require('../middleware/auth');

// @route   GET api/metrics/stats
// @desc    Get fitness stats
router.get('/stats', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('fitnessStats');
    res.json(user.fitnessStats);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// @route   POST api/metrics/update
// @desc    Update fitness stats
router.post('/update', auth, async (req, res) => {
  const { calories, water, streak } = req.body;
  try {
    const user = await User.findById(req.user.id);
    if (calories !== undefined) user.fitnessStats.calories = calories;
    if (water !== undefined) user.fitnessStats.water = water;
    if (streak !== undefined) user.fitnessStats.streak = streak;
    await user.save();
    res.json(user.fitnessStats);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

module.exports = router;

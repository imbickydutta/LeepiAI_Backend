const express = require('express');
const router = express.Router();

// Import all route modules
const authRoutes = require('./auth');
const audioRoutes = require('./audio');
const transcriptRoutes = require('./transcripts');
const aiRoutes = require('./ai');
const userRoutes = require('./users');
const analyticsRoutes = require('./analytics');
const settingsRoutes = require('./settings');

// Mount routes
router.use('/auth', authRoutes);
router.use('/audio', audioRoutes);
router.use('/transcripts', transcriptRoutes);
router.use('/ai', aiRoutes);
router.use('/users', userRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/settings', settingsRoutes);

module.exports = router; 
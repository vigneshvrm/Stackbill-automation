/**
 * Routes Index
 * Central route configuration for the API
 */

const express = require('express');
const router = express.Router();

// Import route modules
const healthRoutes = require('./health');
const playbookRoutes = require('./playbook');
const sessionRoutes = require('./sessions');
const settingsRoutes = require('./settings');

// Mount routes
router.use('/health', healthRoutes);
router.use('/playbook', playbookRoutes);
router.use('/sessions', sessionRoutes);
router.use('/settings', settingsRoutes);

module.exports = router;

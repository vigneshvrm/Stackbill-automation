/**
 * Health Routes
 * /api/health endpoints
 */

const express = require('express');
const router = express.Router();
const { health } = require('../controllers');

/**
 * @route   GET /api/health
 * @desc    Check if API server is running
 * @access  Public
 */
router.get('/', health.getHealth);

module.exports = router;

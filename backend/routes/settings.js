/**
 * Settings Routes
 * /api/settings/* endpoints for global configuration management
 */

const express = require('express');
const router = express.Router();
const { settings } = require('../controllers');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateSettingValue, validateNewSetting } = require('../middleware/validation');

/**
 * @route   GET /api/settings
 * @desc    Get all global settings
 * @access  Public
 */
router.get('/', asyncHandler(settings.getAllSettings));

/**
 * @route   POST /api/settings
 * @desc    Add a new setting
 * @access  Public
 */
router.post('/',
  validateNewSetting,
  asyncHandler(settings.addSetting)
);

/**
 * @route   POST /api/settings/reset-all
 * @desc    Reset all settings to defaults
 * @access  Public
 * @note    Must be defined before /:key routes
 */
router.post('/reset-all', asyncHandler(settings.resetAllSettings));

/**
 * @route   GET /api/settings/category/:category
 * @desc    Get settings by category
 * @access  Public
 */
router.get('/category/:category', asyncHandler(settings.getSettingsByCategory));

/**
 * @route   GET /api/settings/:key
 * @desc    Get a single setting by key
 * @access  Public
 */
router.get('/:key', asyncHandler(settings.getSetting));

/**
 * @route   PATCH /api/settings/:key
 * @desc    Update a setting value
 * @access  Public
 */
router.patch('/:key',
  validateSettingValue,
  asyncHandler(settings.updateSetting)
);

/**
 * @route   POST /api/settings/:key/reset
 * @desc    Reset a setting to its default value
 * @access  Public
 */
router.post('/:key/reset', asyncHandler(settings.resetSetting));

/**
 * @route   DELETE /api/settings/:key
 * @desc    Delete a setting
 * @access  Public
 */
router.delete('/:key', asyncHandler(settings.deleteSetting));

module.exports = router;

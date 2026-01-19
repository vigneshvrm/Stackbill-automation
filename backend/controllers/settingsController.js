/**
 * Settings Controller
 * Handles global settings management
 */

const db = require('../database');
const response = require('../utils/responseHelper');

/**
 * GET /api/settings
 * Get all global settings
 */
function getAllSettings(req, res) {
  try {
    const settings = db.getAllSettings();
    response.success(res, { settings });
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * GET /api/settings/category/:category
 * Get settings by category
 */
function getSettingsByCategory(req, res) {
  try {
    const settings = db.getSettingsByCategory(req.params.category);
    response.success(res, { settings });
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * GET /api/settings/:key
 * Get a single setting by key
 */
function getSetting(req, res) {
  try {
    const value = db.getSetting(req.params.key);
    if (value === null) {
      return response.notFound(res, 'Setting');
    }
    response.success(res, { key: req.params.key, value });
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * PATCH /api/settings/:key
 * Update a setting value
 */
function updateSetting(req, res) {
  try {
    const { value } = req.body;
    const success = db.updateSetting(req.params.key, value);
    if (!success) {
      return response.notFound(res, 'Setting');
    }
    response.success(res);
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * POST /api/settings
 * Add a new setting
 */
function addSetting(req, res) {
  try {
    const { key, value, description, category } = req.body;
    db.addSetting(key, value, description || '', category || 'custom');
    response.success(res);
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * POST /api/settings/:key/reset
 * Reset a setting to its default value
 */
function resetSetting(req, res) {
  try {
    const success = db.resetSetting(req.params.key);
    if (!success) {
      return response.notFound(res, 'Setting');
    }
    response.success(res);
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * POST /api/settings/reset-all
 * Reset all settings to defaults
 */
function resetAllSettings(req, res) {
  try {
    db.resetAllSettings();
    response.success(res, { message: 'All settings reset to defaults' });
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * DELETE /api/settings/:key
 * Delete a setting
 */
function deleteSetting(req, res) {
  try {
    const success = db.deleteSetting(req.params.key);
    if (!success) {
      return response.notFound(res, 'Setting');
    }
    response.success(res);
  } catch (error) {
    response.error(res, error.message);
  }
}

module.exports = {
  getAllSettings,
  getSettingsByCategory,
  getSetting,
  updateSetting,
  addSetting,
  resetSetting,
  resetAllSettings,
  deleteSetting
};

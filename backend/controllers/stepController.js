/**
 * Step Controller
 * Handles step completion and mode management
 */

const db = require('../database');
const response = require('../utils/responseHelper');

/**
 * POST /api/sessions/:id/steps/:stepId/complete
 * Mark a step as completed
 */
function completeStep(req, res) {
  try {
    const { stepData } = req.body;
    db.completeStep(req.params.id, req.params.stepId, stepData || {});
    response.success(res);
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * POST /api/sessions/:id/steps/:stepId/mode
 * Set the mode for a step
 */
function setStepMode(req, res) {
  try {
    const { mode } = req.body;
    db.setStepMode(req.params.id, req.params.stepId, mode);
    response.success(res);
  } catch (error) {
    response.error(res, error.message);
  }
}

module.exports = {
  completeStep,
  setStepMode
};

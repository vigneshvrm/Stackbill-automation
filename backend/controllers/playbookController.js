/**
 * Playbook Controller
 * Handles all playbook execution endpoints
 */

const { generateInventory, cleanupInventory } = require('../services/inventoryService');
const { executePlaybook } = require('../services/playbookService');
const { getPlaybookPath } = require('../utils/pathHelper');
const db = require('../database');

/**
 * Check if request wants streaming
 * @param {object} req - Express request
 * @returns {boolean}
 */
function isStreamingRequest(req) {
  return req.query.stream === 'true' || req.headers.accept?.includes('text/event-stream');
}

/**
 * Execute playbook with streaming support
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {string} playbookType - Type of playbook
 */
async function executePlaybookStream(req, res, playbookType) {
  const sessionId = req.body.sessionId || req.query.sessionId;

  try {
    const { servers, variables = {} } = req.body;
    const playbookPath = getPlaybookPath(playbookType);

    // Set up Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const { inventoryId, inventoryPath } = await generateInventory(servers, playbookType);

    // Start tracking this deployment
    if (sessionId) {
      db.startActiveDeployment(sessionId, playbookType);
    }

    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      // Also track in database for reconnection
      if (sessionId) {
        db.addDeploymentEvent(sessionId, playbookType, data);
      }
    };

    try {
      const result = await executePlaybook(playbookType, inventoryPath, playbookPath, variables, (output) => {
        sendEvent(output);
      });

      const completeEvent = {
        type: 'complete',
        success: true,
        credentials: result.credentials || {},
        stdout: result.stdout,
        stderr: result.stderr
      };
      sendEvent(completeEvent);

      // Mark deployment as completed
      if (sessionId) {
        db.completeActiveDeployment(sessionId, playbookType, true);

        // Also mark the step as completed in the database
        // This ensures the step shows as completed even if frontend SSE was disconnected
        db.completeStep(sessionId, playbookType, {}, 'completed');

        // Save any credentials that were generated
        if (result.credentials && Object.keys(result.credentials).length > 0) {
          for (const [service, creds] of Object.entries(result.credentials)) {
            if (creds && typeof creds === 'object') {
              db.saveCredentials(sessionId, service, creds);
            }
          }
        }
      }

      await cleanupInventory(inventoryId, servers);
      res.end();
    } catch (error) {
      const errorEvent = {
        type: 'complete',
        success: false,
        error: error.error || error.message,
        stdout: error.stdout,
        stderr: error.stderr,
        credentials: error.credentials || {}
      };
      sendEvent(errorEvent);

      // Mark deployment as failed
      if (sessionId) {
        db.completeActiveDeployment(sessionId, playbookType, false, error.error || error.message);
      }

      await cleanupInventory(inventoryId, servers);
      res.end();
    }
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    // Mark as failed
    if (sessionId) {
      db.completeActiveDeployment(sessionId, playbookType, false, error.message);
    }
    res.end();
  }
}

/**
 * Execute playbook without streaming
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {string} playbookType - Type of playbook
 */
async function executePlaybookStandard(req, res, playbookType) {
  const { servers, variables = {} } = req.body;
  const playbookPath = getPlaybookPath(playbookType);

  const { inventoryId, inventoryPath } = await generateInventory(servers, playbookType);

  try {
    const result = await executePlaybook(playbookType, inventoryPath, playbookPath, variables);
    await cleanupInventory(inventoryId, servers);
    res.json(result);
  } catch (error) {
    await cleanupInventory(inventoryId, servers);
    res.status(500).json(error);
  }
}

/**
 * Generic playbook handler factory
 * @param {string} playbookType - Type of playbook
 * @returns {Function} Express handler
 */
function createPlaybookHandler(playbookType) {
  return async (req, res) => {
    if (isStreamingRequest(req)) {
      return executePlaybookStream(req, res, playbookType);
    }
    return executePlaybookStandard(req, res, playbookType);
  };
}

/**
 * Get deployment status for reconnection
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
async function getDeploymentStatus(req, res) {
  const { sessionId, stepId } = req.params;

  if (!sessionId || !stepId) {
    return res.status(400).json({ error: 'sessionId and stepId are required' });
  }

  const deployment = db.getActiveDeployment(sessionId, stepId);

  if (!deployment) {
    return res.status(404).json({ error: 'No active deployment found' });
  }

  res.json({
    success: true,
    deployment
  });
}

/**
 * Get deployment events since a specific timestamp (for SSE reconnection)
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
async function getEventsSince(req, res) {
  const { sessionId, stepId } = req.params;
  const { since } = req.query;

  if (!sessionId || !stepId) {
    return res.status(400).json({ error: 'sessionId and stepId are required' });
  }

  const deployment = db.getActiveDeployment(sessionId, stepId);

  if (!deployment) {
    return res.status(404).json({ error: 'No active deployment found' });
  }

  let events = deployment.taskEvents || [];

  // If 'since' timestamp provided, filter events after that time
  if (since) {
    const sinceTime = new Date(since).getTime();
    events = events.filter(e => {
      const eventTime = e.timestamp ? new Date(e.timestamp).getTime() : 0;
      return eventTime > sinceTime;
    });
  }

  res.json({
    success: true,
    status: deployment.status,
    currentTask: deployment.currentTask,
    errorMessage: deployment.errorMessage,
    events: events,
    isComplete: deployment.status === 'completed' || deployment.status === 'failed'
  });
}

/**
 * Get all active deployments for a session
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
async function getActiveDeployments(req, res) {
  const { sessionId } = req.params;
  const logger = require('../utils/logger');

  logger.debug(`Checking active deployments for session: ${sessionId}`, { sessionId });

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  try {
    const deployments = db.getActiveDeploymentsForSession(sessionId);
    logger.debug(`Found ${deployments.length} active deployments`, { sessionId, count: deployments.length });

    res.json({
      success: true,
      deployments
    });
  } catch (error) {
    logger.error(`Error getting active deployments: ${error.message}`, { sessionId, error: error.stack });
    res.status(500).json({ error: 'Failed to get active deployments', details: error.message });
  }
}

// Export individual handlers
module.exports = {
  // MySQL
  executeMysql: createPlaybookHandler('mysql'),

  // MongoDB
  executeMongodb: createPlaybookHandler('mongodb'),

  // NFS
  executeNfs: createPlaybookHandler('nfs'),

  // RabbitMQ
  executeRabbitmq: createPlaybookHandler('rabbitmq'),

  // Environment Check
  executeEnvCheck: createPlaybookHandler('env-check'),

  // Kubernetes
  executeKubernetes: createPlaybookHandler('kubernetes'),

  // Kubectl/Istio
  executeKubectl: createPlaybookHandler('kubectl'),

  // Helm
  executeHelm: createPlaybookHandler('helm'),

  // Load Balancer
  executeLoadbalancer: createPlaybookHandler('loadbalancer'),

  // StackBill
  executeStackbill: createPlaybookHandler('stackbill'),

  // Status endpoints
  getDeploymentStatus,
  getActiveDeployments,
  getEventsSince
};

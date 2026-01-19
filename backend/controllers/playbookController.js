/**
 * Playbook Controller
 * Handles all playbook execution endpoints
 */

const { generateInventory, cleanupInventory } = require('../services/inventoryService');
const { executePlaybook } = require('../services/playbookService');
const { getPlaybookPath } = require('../utils/pathHelper');

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
  try {
    const { servers, variables = {} } = req.body;
    const playbookPath = getPlaybookPath(playbookType);

    // Set up Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const { inventoryId, inventoryPath } = await generateInventory(servers, playbookType);

    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await executePlaybook(playbookType, inventoryPath, playbookPath, variables, (output) => {
        sendEvent(output);
      });

      sendEvent({
        type: 'complete',
        success: true,
        credentials: result.credentials || {},
        stdout: result.stdout,
        stderr: result.stderr
      });

      await cleanupInventory(inventoryId, servers);
      res.end();
    } catch (error) {
      sendEvent({
        type: 'complete',
        success: false,
        error: error.error || error.message,
        stdout: error.stdout,
        stderr: error.stderr,
        credentials: error.credentials || {}
      });
      await cleanupInventory(inventoryId, servers);
      res.end();
    }
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
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

  // SSL
  executeSSL: createPlaybookHandler('ssl'),

  // StackBill
  executeStackbill: createPlaybookHandler('stackbill')
};

/**
 * Playbook Routes
 * /api/playbook/* endpoints for Ansible playbook execution
 */

const express = require('express');
const router = express.Router();
const { playbook } = require('../controllers');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  validateServers,
  validateNfsVariables,
  validateKubernetesMaster
} = require('../middleware/validation');

/**
 * @route   POST /api/playbook/mysql
 * @desc    Execute MySQL installation playbook
 * @access  Public
 * @streaming Supports SSE with ?stream=true
 */
router.post('/mysql',
  validateServers,
  asyncHandler(playbook.executeMysql)
);

/**
 * @route   POST /api/playbook/mongodb
 * @desc    Execute MongoDB installation playbook
 * @access  Public
 * @streaming Supports SSE with ?stream=true
 */
router.post('/mongodb',
  validateServers,
  asyncHandler(playbook.executeMongodb)
);

/**
 * @route   POST /api/playbook/nfs
 * @desc    Execute NFS server installation playbook
 * @access  Public
 * @requires disk_device and client_ip_range variables
 * @streaming Supports SSE with ?stream=true
 */
router.post('/nfs',
  validateServers,
  validateNfsVariables,
  asyncHandler(playbook.executeNfs)
);

/**
 * @route   POST /api/playbook/rabbitmq
 * @desc    Execute RabbitMQ installation playbook
 * @access  Public
 * @streaming Supports SSE with ?stream=true
 */
router.post('/rabbitmq',
  validateServers,
  asyncHandler(playbook.executeRabbitmq)
);

/**
 * @route   POST /api/playbook/env-check
 * @desc    Execute environment verification playbook
 * @access  Public
 * @streaming Supports SSE with ?stream=true
 */
router.post('/env-check',
  validateServers,
  asyncHandler(playbook.executeEnvCheck)
);

/**
 * @route   POST /api/playbook/kubernetes
 * @desc    Execute Kubernetes cluster setup playbook
 * @access  Public
 * @requires At least one server with role='master'
 * @streaming Supports SSE with ?stream=true
 */
router.post('/kubernetes',
  validateServers,
  validateKubernetesMaster,
  asyncHandler(playbook.executeKubernetes)
);

/**
 * @route   POST /api/playbook/kubectl
 * @desc    Execute kubectl and Istio installation playbook
 * @access  Public
 * @streaming Supports SSE with ?stream=true
 */
router.post('/kubectl',
  validateServers,
  asyncHandler(playbook.executeKubectl)
);

/**
 * @route   POST /api/playbook/helm
 * @desc    Execute Helm installation playbook
 * @access  Public
 * @streaming Supports SSE with ?stream=true
 */
router.post('/helm',
  validateServers,
  asyncHandler(playbook.executeHelm)
);

/**
 * @route   POST /api/playbook/loadbalancer
 * @desc    Execute HAProxy load balancer installation playbook
 * @access  Public
 * @streaming Supports SSE with ?stream=true
 */
router.post('/loadbalancer',
  validateServers,
  asyncHandler(playbook.executeLoadbalancer)
);

/**
 * @route   POST /api/playbook/stackbill
 * @desc    Execute StackBill application deployment playbook
 * @access  Public
 * @streaming Supports SSE with ?stream=true
 */
router.post('/stackbill',
  validateServers,
  asyncHandler(playbook.executeStackbill)
);

/**
 * @route   GET /api/playbook/status/:sessionId/:stepId
 * @desc    Get active deployment status for reconnection
 * @access  Public
 */
router.get('/status/:sessionId/:stepId',
  asyncHandler(playbook.getDeploymentStatus)
);

/**
 * @route   GET /api/playbook/active/:sessionId
 * @desc    Get all active deployments for a session
 * @access  Public
 */
router.get('/active/:sessionId',
  asyncHandler(playbook.getActiveDeployments)
);

module.exports = router;

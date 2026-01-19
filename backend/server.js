/**
 * StackBill Deployment Center - Server Entry Point
 * Starts the Express server
 */

const app = require('./app');
const config = require('./config');
const { ensureInventoryDir } = require('./services/inventoryService');

// Ensure required directories exist
async function initialize() {
  await ensureInventoryDir();
}

// Start server
initialize().then(() => {
  app.listen(config.server.port, () => {
    console.log(`🚀 Ansible API Server running on http://localhost:${config.server.port}`);
    console.log(`📋 Frontend available at http://localhost:${config.server.port}`);
    console.log(`💾 Database location: ./data/stackbill.db`);
    console.log('');
    console.log('API Endpoints:');
    console.log('  Health:     GET  /api/health');
    console.log('  Playbooks:  POST /api/playbook/{mysql|mongodb|nfs|rabbitmq|...}');
    console.log('  Sessions:   GET|POST|PATCH|DELETE /api/sessions');
    console.log('  Settings:   GET|POST|PATCH|DELETE /api/settings');
  });
}).catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

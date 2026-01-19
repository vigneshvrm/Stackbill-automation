/**
 * StackBill Deployment Center - Express Application
 * Modular backend application setup
 */

const express = require('express');
const path = require('path');
const config = require('./config');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Create Express app
const app = express();

// =====================================================
// MIDDLEWARE
// =====================================================

// Parse JSON bodies
app.use(express.json());

// Serve static files from frontend
app.use(express.static(config.paths.frontend));

// =====================================================
// ROUTES
// =====================================================

// Redirect root to sessions page
app.get('/', (req, res) => {
  res.redirect('/sessions.html');
});

// Mount API routes
app.use('/api', routes);

// =====================================================
// ERROR HANDLING
// =====================================================

// 404 handler for undefined API routes
app.use('/api/*', notFoundHandler);

// Global error handler
app.use(errorHandler);

module.exports = app;

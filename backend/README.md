# StackBill Deployment Center - Backend

Modular Node.js/Express backend for the StackBill Deployment Center.

## Directory Structure

```
backend/
├── config/                 # Application configuration
│   └── index.js           # Central config (paths, settings)
│
├── controllers/           # Request handlers (business logic)
│   ├── index.js          # Export all controllers
│   ├── healthController.js
│   ├── playbookController.js
│   ├── sessionController.js
│   ├── serverController.js
│   ├── credentialController.js
│   ├── stepController.js
│   ├── sslController.js
│   ├── fileController.js
│   └── settingsController.js
│
├── middleware/            # Express middleware
│   ├── errorHandler.js   # Global error handling
│   └── validation.js     # Request validation
│
├── routes/               # Route definitions
│   ├── index.js         # Mount all routes
│   ├── health.js        # /api/health
│   ├── playbook.js      # /api/playbook/*
│   ├── sessions.js      # /api/sessions/*
│   └── settings.js      # /api/settings/*
│
├── services/             # Business services
│   ├── inventoryService.js  # Ansible inventory management
│   └── playbookService.js   # Playbook execution
│
├── utils/                # Utility functions
│   ├── pathHelper.js    # Path conversions (Windows/WSL)
│   └── responseHelper.js # Standardized API responses
│
├── app.js               # Express app setup
├── server.js            # Server entry point
├── database.js          # SQLite database module
└── api-server.js        # Legacy monolithic server (deprecated)
```

## Getting Started

### Start the Server

```bash
# Using the new modular structure
npm start

# Development mode with auto-reload
npm run dev

# Legacy monolithic server (deprecated)
npm run start:legacy
```

### API Endpoints

See [API Documentation](../docs/API_DOCUMENTATION.md) for complete endpoint reference.

## Architecture

### Controllers
Handle HTTP request/response logic. Each controller corresponds to a resource or feature area.

### Services
Contain business logic that may be shared across controllers:
- **inventoryService**: Generate and manage Ansible inventory files
- **playbookService**: Execute Ansible playbooks with streaming support

### Middleware
- **errorHandler**: Global error handling and async wrapper
- **validation**: Request body validation

### Routes
Define API endpoints and connect them to controllers with appropriate middleware.

## Configuration

Configuration is centralized in `config/index.js`:

- Server port (default: 3000)
- File paths (ansible, frontend, data)
- Platform detection (Windows/WSL/Linux)
- Ansible settings

## Database

Uses SQLite with `better-sqlite3` for:
- Session management
- Server configurations
- Credentials (encrypted with AES-256-CBC)
- Global settings

Database file: `data/stackbill.db`

## Adding New Features

### 1. Add a New Route

```javascript
// routes/myFeature.js
const express = require('express');
const router = express.Router();
const { myFeature } = require('../controllers');
const { asyncHandler } = require('../middleware/errorHandler');

router.get('/', asyncHandler(myFeature.list));
router.post('/', asyncHandler(myFeature.create));

module.exports = router;
```

### 2. Add Controller

```javascript
// controllers/myFeatureController.js
const response = require('../utils/responseHelper');

function list(req, res) {
  response.success(res, { items: [] });
}

function create(req, res) {
  response.created(res, { id: 1 });
}

module.exports = { list, create };
```

### 3. Register Route

```javascript
// routes/index.js
const myFeatureRoutes = require('./myFeature');
router.use('/myfeature', myFeatureRoutes);
```

## Error Handling

Use the `asyncHandler` wrapper for async route handlers:

```javascript
const { asyncHandler } = require('../middleware/errorHandler');

router.get('/', asyncHandler(async (req, res) => {
  const data = await someAsyncOperation();
  res.json(data);
}));
```

Throw `ApiError` for custom error responses:

```javascript
const { ApiError, badRequest } = require('../middleware/errorHandler');

if (!data) {
  throw badRequest('Data is required');
}
```

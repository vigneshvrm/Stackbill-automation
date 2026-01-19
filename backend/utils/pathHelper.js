/**
 * Path Helper Utilities
 * Handles path conversions between Windows and WSL
 */

const path = require('path');
const config = require('../config');

/**
 * Convert Windows path to WSL path
 * @param {string} windowsPath - The Windows path to convert
 * @returns {string} The WSL-compatible path
 */
function toWslPath(windowsPath) {
  if (!config.platform.isWindows) return windowsPath;

  let normalized = path.normalize(windowsPath);

  // Extract drive letter (C, D, etc.)
  const driveMatch = normalized.match(/^([A-Za-z]):/);
  if (!driveMatch) {
    // No drive letter found, return as-is or handle relative path
    return normalized.replace(/\\/g, '/');
  }

  const drive = driveMatch[1].toLowerCase();
  // Get everything after "C:" or "C:\"
  let rest = normalized.substring(2);

  // Remove leading slashes/backslashes
  rest = rest.replace(/^[\\\/]+/, '');

  // Convert backslashes to forward slashes
  rest = rest.replace(/\\/g, '/');

  // Ensure we have a proper path
  const wslPath = `/mnt/${drive}/${rest}`;

  // Escape spaces and special characters for shell
  return wslPath.includes(' ') ? `"${wslPath}"` : wslPath;
}

/**
 * Get the appropriate path based on platform
 * @param {string} nativePath - The native system path
 * @returns {string} Platform-appropriate path
 */
function getPlatformPath(nativePath) {
  if (config.platform.isWindows) {
    return toWslPath(nativePath);
  }
  return nativePath;
}

/**
 * Get role path for a specific playbook type
 * @param {string} playbookType - The type of playbook
 * @returns {string} The role path
 */
function getRolePath(playbookType) {
  const roleDir = config.rolePaths[playbookType] || config.rolePaths.default;
  return path.join(config.paths.ansible, roleDir);
}

/**
 * Get playbook path for a specific type
 * @param {string} playbookType - The type of playbook
 * @returns {string} The playbook path
 */
function getPlaybookPath(playbookType) {
  const playbookFile = config.playbooks[playbookType];
  if (!playbookFile) {
    throw new Error(`Unknown playbook type: ${playbookType}`);
  }
  return path.join(config.paths.ansible, playbookFile);
}

module.exports = {
  toWslPath,
  getPlatformPath,
  getRolePath,
  getPlaybookPath
};

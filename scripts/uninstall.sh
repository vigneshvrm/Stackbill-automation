#!/bin/bash

# StackBill Deployment Center - Uninstall Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default values
INSTALL_DIR="/opt/stackbill-deploy"
SERVICE_USER="stackbill"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root"
    exit 1
fi

echo -e "${RED}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       StackBill Deployment Center - Uninstaller              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

read -p "Are you sure you want to uninstall StackBill Deployment Center? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Uninstall cancelled"
    exit 0
fi

# Stop and disable service
log_info "Stopping service..."
systemctl stop stackbill-deploy 2>/dev/null || true
systemctl disable stackbill-deploy 2>/dev/null || true

# Remove service file
log_info "Removing service file..."
rm -f /etc/systemd/system/stackbill-deploy.service
systemctl daemon-reload

# Ask about data removal
read -p "Do you want to remove application data (database, logs)? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Removing installation directory including data..."
    rm -rf ${INSTALL_DIR}
else
    log_info "Keeping data directory, removing application files only..."
    # Keep data and logs directories
    find ${INSTALL_DIR} -mindepth 1 -maxdepth 1 ! -name 'data' ! -name 'logs' -exec rm -rf {} \;
fi

# Ask about user removal
read -p "Do you want to remove the ${SERVICE_USER} user? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Removing user ${SERVICE_USER}..."
    userdel -r ${SERVICE_USER} 2>/dev/null || true
fi

log_success "StackBill Deployment Center has been uninstalled"

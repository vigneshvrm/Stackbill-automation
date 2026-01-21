#!/bin/bash

# StackBill Deployment Center - Installation Script
# Supports: Ubuntu 20.04+, Debian 11+, CentOS 8+, RHEL 8+

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
INSTALL_DIR="/opt/stackbill-deploy"
SERVICE_USER="stackbill"
SERVICE_GROUP="stackbill"
PORT=3000
NODE_VERSION="18"

# Print banner
print_banner() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║         StackBill Deployment Center - Installer              ║"
    echo "║                     Version 1.0.0                            ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Print status messages
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

# Detect OS
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    else
        log_error "Cannot detect OS. /etc/os-release not found."
        exit 1
    fi
    log_info "Detected OS: $OS $VERSION"
}

# Install dependencies based on OS
install_dependencies() {
    log_info "Installing dependencies..."

    case $OS in
        ubuntu|debian)
            apt-get update
            apt-get install -y curl wget git ansible python3-pip sshpass
            ;;
        centos|rhel|rocky|almalinux)
            dnf install -y curl wget git epel-release
            dnf install -y ansible python3-pip sshpass
            ;;
        *)
            log_error "Unsupported OS: $OS"
            exit 1
            ;;
    esac

    log_success "Dependencies installed"
}

# Install Node.js
install_nodejs() {
    log_info "Installing Node.js v${NODE_VERSION}..."

    # Check if Node.js is already installed
    if command -v node &> /dev/null; then
        CURRENT_NODE=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$CURRENT_NODE" -ge "$NODE_VERSION" ]; then
            log_info "Node.js v$(node -v) already installed"
            return
        fi
    fi

    # Install Node.js using NodeSource
    case $OS in
        ubuntu|debian)
            curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
            apt-get install -y nodejs
            ;;
        centos|rhel|rocky|almalinux)
            curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | bash -
            dnf install -y nodejs
            ;;
    esac

    log_success "Node.js $(node -v) installed"
}

# Create service user
create_user() {
    log_info "Creating service user: ${SERVICE_USER}..."

    if id "$SERVICE_USER" &>/dev/null; then
        log_info "User ${SERVICE_USER} already exists"
    else
        useradd -r -m -d /home/${SERVICE_USER} -s /bin/bash ${SERVICE_USER}
        log_success "User ${SERVICE_USER} created"
    fi
}

# Install application
install_application() {
    log_info "Installing application to ${INSTALL_DIR}..."

    # Create install directory
    mkdir -p ${INSTALL_DIR}

    # If we're in the source directory, copy files
    if [ -f "package.json" ]; then
        log_info "Copying files from current directory..."
        cp -r . ${INSTALL_DIR}/
    else
        log_error "package.json not found. Please run this script from the project root directory."
        exit 1
    fi

    # Create required directories
    mkdir -p ${INSTALL_DIR}/data
    mkdir -p ${INSTALL_DIR}/logs
    mkdir -p ${INSTALL_DIR}/backend/.inventory

    # Install npm dependencies
    cd ${INSTALL_DIR}
    npm install --production

    # Set ownership
    chown -R ${SERVICE_USER}:${SERVICE_GROUP} ${INSTALL_DIR}
    chmod -R 755 ${INSTALL_DIR}
    chmod 700 ${INSTALL_DIR}/data
    chmod 700 ${INSTALL_DIR}/logs

    log_success "Application installed"
}

# Install systemd service
install_service() {
    log_info "Installing systemd service..."

    # Copy service file
    cp ${INSTALL_DIR}/scripts/stackbill-deploy.service /etc/systemd/system/

    # Update service file with correct paths
    sed -i "s|WorkingDirectory=.*|WorkingDirectory=${INSTALL_DIR}|g" /etc/systemd/system/stackbill-deploy.service
    sed -i "s|User=.*|User=${SERVICE_USER}|g" /etc/systemd/system/stackbill-deploy.service
    sed -i "s|Group=.*|Group=${SERVICE_GROUP}|g" /etc/systemd/system/stackbill-deploy.service
    sed -i "s|Environment=PORT=.*|Environment=PORT=${PORT}|g" /etc/systemd/system/stackbill-deploy.service

    # Reload systemd
    systemctl daemon-reload

    # Enable and start service
    systemctl enable stackbill-deploy
    systemctl start stackbill-deploy

    log_success "Service installed and started"
}

# Configure firewall
configure_firewall() {
    log_info "Configuring firewall..."

    case $OS in
        ubuntu|debian)
            if command -v ufw &> /dev/null; then
                ufw allow ${PORT}/tcp
                log_success "UFW rule added for port ${PORT}"
            fi
            ;;
        centos|rhel|rocky|almalinux)
            if command -v firewall-cmd &> /dev/null; then
                firewall-cmd --permanent --add-port=${PORT}/tcp
                firewall-cmd --reload
                log_success "Firewalld rule added for port ${PORT}"
            fi
            ;;
    esac
}

# Verify installation
verify_installation() {
    log_info "Verifying installation..."

    sleep 3  # Wait for service to start

    if systemctl is-active --quiet stackbill-deploy; then
        log_success "Service is running"
    else
        log_error "Service failed to start. Check logs with: journalctl -u stackbill-deploy"
        exit 1
    fi

    # Test API endpoint
    if curl -s http://localhost:${PORT}/api/health | grep -q "ok"; then
        log_success "API health check passed"
    else
        log_warn "API health check failed. Service may still be starting..."
    fi
}

# Print completion message
print_completion() {
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Installation Complete!${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BLUE}Web Interface:${NC}  http://$(hostname -I | awk '{print $1}'):${PORT}"
    echo -e "  ${BLUE}Service Status:${NC} systemctl status stackbill-deploy"
    echo -e "  ${BLUE}View Logs:${NC}      journalctl -u stackbill-deploy -f"
    echo -e "  ${BLUE}App Logs:${NC}       tail -f ${INSTALL_DIR}/logs/stackbill.log"
    echo ""
    echo -e "  ${YELLOW}Useful Commands:${NC}"
    echo "    systemctl stop stackbill-deploy     # Stop service"
    echo "    systemctl start stackbill-deploy    # Start service"
    echo "    systemctl restart stackbill-deploy  # Restart service"
    echo ""
}

# Main installation flow
main() {
    print_banner
    check_root
    detect_os
    install_dependencies
    install_nodejs
    create_user
    install_application
    install_service
    configure_firewall
    verify_installation
    print_completion
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --port)
            PORT="$2"
            shift 2
            ;;
        --install-dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        --user)
            SERVICE_USER="$2"
            SERVICE_GROUP="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --port PORT         Set the service port (default: 3000)"
            echo "  --install-dir DIR   Set installation directory (default: /opt/stackbill-deploy)"
            echo "  --user USER         Set service user (default: stackbill)"
            echo "  --help              Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run main installation
main

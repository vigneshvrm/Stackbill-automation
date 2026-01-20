#!/bin/bash

# StackBill Deployment Center - Patch Management System
# Supports: Zero-downtime updates, rollback, backup/restore

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
INSTALL_DIR="${STACKBILL_INSTALL_DIR:-/opt/stackbill-deploy}"
BACKUP_DIR="${INSTALL_DIR}/backups"
VERSION_FILE="${INSTALL_DIR}/VERSION"
SERVICE_NAME="stackbill-deploy"
REPO_URL="https://github.com/vigneshvrm/Stackbill-automation.git"
MAX_BACKUPS=5

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"; }

# Print banner
print_banner() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║       StackBill Deployment Center - Patch Manager            ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Get current version
get_current_version() {
    if [ -f "$VERSION_FILE" ]; then
        cat "$VERSION_FILE"
    else
        echo "unknown"
    fi
}

# Get latest version from git
get_latest_version() {
    cd "$INSTALL_DIR"
    git fetch origin --tags 2>/dev/null || true
    git describe --tags --abbrev=0 2>/dev/null || git rev-parse --short HEAD
}

# Get current commit hash
get_current_commit() {
    cd "$INSTALL_DIR"
    git rev-parse --short HEAD 2>/dev/null || echo "unknown"
}

# Check if updates are available
check_updates() {
    log_info "Checking for updates..."

    cd "$INSTALL_DIR"
    git fetch origin main --quiet 2>/dev/null

    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse origin/main)

    if [ "$LOCAL" = "$REMOTE" ]; then
        log_success "Already up to date!"
        echo ""
        echo "Current version: $(get_current_version)"
        echo "Current commit:  $(get_current_commit)"
        return 1
    else
        BEHIND=$(git rev-list --count HEAD..origin/main)
        log_warn "Updates available! ($BEHIND commits behind)"
        echo ""
        echo "Current commit: $(get_current_commit)"
        echo "Latest commit:  $(git rev-parse --short origin/main)"
        echo ""
        echo "Recent changes:"
        git log --oneline HEAD..origin/main | head -10
        return 0
    fi
}

# Create backup before update
create_backup() {
    local backup_name="backup_$(date +%Y%m%d_%H%M%S)_$(get_current_commit)"
    local backup_path="${BACKUP_DIR}/${backup_name}"

    log_info "Creating backup: ${backup_name}"

    mkdir -p "$BACKUP_DIR"
    mkdir -p "$backup_path"

    # Backup critical files
    cp -r "${INSTALL_DIR}/data" "${backup_path}/" 2>/dev/null || true
    cp -r "${INSTALL_DIR}/logs" "${backup_path}/" 2>/dev/null || true
    cp "${INSTALL_DIR}/package.json" "${backup_path}/" 2>/dev/null || true
    cp "${INSTALL_DIR}/package-lock.json" "${backup_path}/" 2>/dev/null || true
    cp "$VERSION_FILE" "${backup_path}/" 2>/dev/null || true

    # Save current commit hash for rollback
    echo "$(get_current_commit)" > "${backup_path}/COMMIT_HASH"
    echo "$(date -Iseconds)" > "${backup_path}/BACKUP_TIME"

    # Cleanup old backups (keep only MAX_BACKUPS)
    cleanup_old_backups

    log_success "Backup created: ${backup_path}"
    echo "$backup_path"
}

# Cleanup old backups
cleanup_old_backups() {
    local count=$(ls -1d ${BACKUP_DIR}/backup_* 2>/dev/null | wc -l)

    if [ "$count" -gt "$MAX_BACKUPS" ]; then
        local to_delete=$((count - MAX_BACKUPS))
        log_info "Cleaning up $to_delete old backup(s)..."
        ls -1dt ${BACKUP_DIR}/backup_* | tail -n "$to_delete" | xargs rm -rf
    fi
}

# List available backups
list_backups() {
    log_info "Available backups:"
    echo ""

    if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A $BACKUP_DIR 2>/dev/null)" ]; then
        echo "  No backups found."
        return
    fi

    printf "%-40s %-20s %-15s\n" "BACKUP NAME" "DATE" "COMMIT"
    printf "%-40s %-20s %-15s\n" "----------------------------------------" "--------------------" "---------------"

    for backup in $(ls -1dt ${BACKUP_DIR}/backup_* 2>/dev/null); do
        local name=$(basename "$backup")
        local date_str="unknown"
        local commit="unknown"

        if [ -f "${backup}/BACKUP_TIME" ]; then
            date_str=$(cat "${backup}/BACKUP_TIME" | cut -d'T' -f1,2 | tr 'T' ' ' | cut -c1-16)
        fi

        if [ -f "${backup}/COMMIT_HASH" ]; then
            commit=$(cat "${backup}/COMMIT_HASH")
        fi

        printf "%-40s %-20s %-15s\n" "$name" "$date_str" "$commit"
    done
}

# Apply update with zero downtime
apply_update() {
    local force=${1:-false}

    log_info "Starting update process..."

    # Check if running as root or with sudo
    if [ "$EUID" -ne 0 ]; then
        log_error "Please run with sudo for service management"
        exit 1
    fi

    cd "$INSTALL_DIR"

    # Check for updates
    if ! check_updates && [ "$force" != "true" ]; then
        log_info "No updates to apply. Use --force to reinstall."
        return 0
    fi

    # Create backup
    local backup_path=$(create_backup)

    # Pull latest changes
    log_info "Pulling latest changes..."
    git stash --quiet 2>/dev/null || true
    git pull origin main --quiet

    # Update version file
    echo "$(get_current_commit)" > "$VERSION_FILE"

    # Install/update dependencies
    log_info "Updating dependencies..."
    npm install --production --quiet

    # Graceful restart with zero downtime
    log_info "Restarting service (zero-downtime)..."

    # Send SIGUSR2 for graceful reload if supported, otherwise restart
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        # Try graceful reload first
        systemctl reload "$SERVICE_NAME" 2>/dev/null || systemctl restart "$SERVICE_NAME"
    else
        systemctl start "$SERVICE_NAME"
    fi

    # Wait for service to be ready
    sleep 2

    # Verify service is running
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_success "Update completed successfully!"
        echo ""
        echo "New version: $(get_current_version)"
        echo "Backup saved: $backup_path"
    else
        log_error "Service failed to start after update!"
        log_warn "Initiating automatic rollback..."
        rollback_to_backup "$backup_path"
    fi
}

# Rollback to a specific backup
rollback_to_backup() {
    local backup_path="$1"

    if [ -z "$backup_path" ]; then
        log_error "No backup path specified"
        exit 1
    fi

    if [ ! -d "$backup_path" ]; then
        # Try to find by name
        backup_path="${BACKUP_DIR}/${backup_path}"
    fi

    if [ ! -d "$backup_path" ]; then
        log_error "Backup not found: $backup_path"
        exit 1
    fi

    log_warn "Rolling back to: $(basename $backup_path)"

    # Get commit hash from backup
    if [ -f "${backup_path}/COMMIT_HASH" ]; then
        local commit=$(cat "${backup_path}/COMMIT_HASH")

        cd "$INSTALL_DIR"

        # Reset to the backup commit
        log_info "Resetting to commit: $commit"
        git fetch origin --quiet
        git reset --hard "$commit"

        # Restore data directory
        if [ -d "${backup_path}/data" ]; then
            log_info "Restoring data directory..."
            rm -rf "${INSTALL_DIR}/data"
            cp -r "${backup_path}/data" "${INSTALL_DIR}/"
        fi

        # Reinstall dependencies for that version
        log_info "Reinstalling dependencies..."
        npm install --production --quiet

        # Update version file
        echo "$commit" > "$VERSION_FILE"

        # Restart service
        log_info "Restarting service..."
        systemctl restart "$SERVICE_NAME"

        sleep 2

        if systemctl is-active --quiet "$SERVICE_NAME"; then
            log_success "Rollback completed successfully!"
        else
            log_error "Service failed to start after rollback!"
            log_error "Manual intervention required."
            exit 1
        fi
    else
        log_error "Invalid backup: missing COMMIT_HASH"
        exit 1
    fi
}

# Show status
show_status() {
    echo ""
    echo -e "${CYAN}=== StackBill Deployment Center Status ===${NC}"
    echo ""

    echo "Installation Directory: $INSTALL_DIR"
    echo "Current Version:        $(get_current_version)"
    echo "Current Commit:         $(get_current_commit)"
    echo ""

    echo -e "${CYAN}Service Status:${NC}"
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        echo -e "  Status: ${GREEN}Running${NC}"
        echo "  PID:    $(systemctl show -p MainPID --value $SERVICE_NAME)"
        echo "  Uptime: $(systemctl show -p ActiveEnterTimestamp --value $SERVICE_NAME)"
    else
        echo -e "  Status: ${RED}Stopped${NC}"
    fi
    echo ""

    echo -e "${CYAN}Backup Status:${NC}"
    local backup_count=$(ls -1d ${BACKUP_DIR}/backup_* 2>/dev/null | wc -l)
    echo "  Backups: $backup_count (max: $MAX_BACKUPS)"
    if [ "$backup_count" -gt 0 ]; then
        echo "  Latest:  $(ls -1t ${BACKUP_DIR}/backup_* 2>/dev/null | head -1 | xargs basename)"
    fi
    echo ""
}

# Health check
health_check() {
    log_info "Running health check..."

    local errors=0

    # Check service
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        echo -e "  [${GREEN}OK${NC}] Service is running"
    else
        echo -e "  [${RED}FAIL${NC}] Service is not running"
        ((errors++))
    fi

    # Check API endpoint
    if curl -s http://localhost:3000/api/health | grep -q "ok"; then
        echo -e "  [${GREEN}OK${NC}] API is responding"
    else
        echo -e "  [${RED}FAIL${NC}] API is not responding"
        ((errors++))
    fi

    # Check database
    if [ -f "${INSTALL_DIR}/data/stackbill.db" ]; then
        echo -e "  [${GREEN}OK${NC}] Database exists"
    else
        echo -e "  [${YELLOW}WARN${NC}] Database not found (may be first run)"
    fi

    # Check disk space
    local disk_usage=$(df "$INSTALL_DIR" | tail -1 | awk '{print $5}' | tr -d '%')
    if [ "$disk_usage" -lt 90 ]; then
        echo -e "  [${GREEN}OK${NC}] Disk space: ${disk_usage}% used"
    else
        echo -e "  [${RED}FAIL${NC}] Disk space critical: ${disk_usage}% used"
        ((errors++))
    fi

    echo ""
    if [ "$errors" -eq 0 ]; then
        log_success "All health checks passed!"
        return 0
    else
        log_error "$errors health check(s) failed!"
        return 1
    fi
}

# Print usage
print_usage() {
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  status          Show current status and version"
    echo "  check           Check for available updates"
    echo "  update          Apply updates (with automatic backup)"
    echo "  update --force  Force update even if no changes detected"
    echo "  backup          Create a backup of current state"
    echo "  backups         List available backups"
    echo "  rollback <name> Rollback to a specific backup"
    echo "  rollback-last   Rollback to the most recent backup"
    echo "  health          Run health checks"
    echo "  help            Show this help message"
    echo ""
    echo "Examples:"
    echo "  sudo $0 update              # Update to latest version"
    echo "  sudo $0 rollback-last       # Rollback to previous version"
    echo "  $0 status                   # Check current status"
    echo ""
}

# Main command handler
main() {
    print_banner

    case "${1:-}" in
        status)
            show_status
            ;;
        check)
            check_updates
            ;;
        update)
            apply_update "${2:-false}"
            ;;
        backup)
            create_backup
            ;;
        backups|list)
            list_backups
            ;;
        rollback)
            if [ -z "${2:-}" ]; then
                log_error "Please specify a backup name"
                echo "Use '$0 backups' to list available backups"
                exit 1
            fi
            rollback_to_backup "$2"
            ;;
        rollback-last)
            local latest=$(ls -1t ${BACKUP_DIR}/backup_* 2>/dev/null | head -1)
            if [ -z "$latest" ]; then
                log_error "No backups available for rollback"
                exit 1
            fi
            rollback_to_backup "$latest"
            ;;
        health)
            health_check
            ;;
        help|--help|-h)
            print_usage
            ;;
        *)
            print_usage
            exit 1
            ;;
    esac
}

# Run main
main "$@"

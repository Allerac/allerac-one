#!/bin/bash
#
# Database Restore Script for Allerac One
# Downloads and restores a PostgreSQL backup from Google Cloud Storage
#
# Usage: ./restore-database.sh <backup-file-name>
#
# Examples:
#   ./restore-database.sh allerac-2026-02-11_03-00-00.sql.gz
#   ./restore-database.sh latest  # Restores the most recent backup
#

set -e

# Configuration
BUCKET_NAME="${BACKUP_BUCKET:-allerac-one-backups}"
BACKUP_DIR="/home/allerac/backups"
LOG_FILE="/var/log/allerac-restore.log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Error handler
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Check arguments
if [ -z "$1" ]; then
    echo "Usage: $0 <backup-file-name|latest>"
    echo ""
    echo "Available backups:"
    gsutil ls "gs://$BUCKET_NAME/" | sed 's|.*/||'
    exit 1
fi

BACKUP_NAME="$1"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Find the PostgreSQL container
DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'db|postgres' | head -1)

if [ -z "$DB_CONTAINER" ]; then
    error_exit "PostgreSQL container not found"
fi

log "Using container: $DB_CONTAINER"

# Handle "latest" option
if [ "$BACKUP_NAME" = "latest" ]; then
    log "Finding latest backup..."
    BACKUP_NAME=$(gsutil ls "gs://$BUCKET_NAME/" | sort | tail -1 | sed 's|.*/||')
    if [ -z "$BACKUP_NAME" ]; then
        error_exit "No backups found in bucket"
    fi
    log "Latest backup: $BACKUP_NAME"
fi

LOCAL_FILE="$BACKUP_DIR/$BACKUP_NAME"

# Download backup if not exists locally
if [ ! -f "$LOCAL_FILE" ]; then
    log "Downloading gs://$BUCKET_NAME/$BACKUP_NAME..."
    gsutil cp "gs://$BUCKET_NAME/$BACKUP_NAME" "$LOCAL_FILE" || error_exit "Download failed"
else
    log "Using local backup: $LOCAL_FILE"
fi

# Confirm restore
echo ""
echo "WARNING: This will REPLACE ALL DATA in the database!"
echo "Backup to restore: $BACKUP_NAME"
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    log "Restore cancelled by user"
    exit 0
fi

# Stop the application to prevent connections
log "Stopping application..."
cd /home/allerac/allerac-one
docker compose stop app 2>/dev/null || true

# Restore the database
log "Restoring database..."
gunzip < "$LOCAL_FILE" | docker exec -i "$DB_CONTAINER" psql -U postgres -d allerac || error_exit "Restore failed"

# Restart the application
log "Starting application..."
docker compose start app 2>/dev/null || docker compose up -d app

log "Database restored successfully from $BACKUP_NAME"

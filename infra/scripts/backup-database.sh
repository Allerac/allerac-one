#!/bin/bash
#
# Database Backup Script for Allerac One
# Performs daily PostgreSQL backup and uploads to Google Cloud Storage
#
# Usage: ./backup-database.sh [BUCKET_NAME]
#
# Environment variables:
#   BACKUP_BUCKET - GCS bucket name (default: allerac-one-backups)
#   RETENTION_DAYS - Local backup retention in days (default: 7)
#

set -e

# Configuration
BUCKET_NAME="${1:-${BACKUP_BUCKET:-allerac-one-backups}}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
BACKUP_DIR="/home/allerac/backups"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="allerac-${DATE}.sql.gz"
LOG_FILE="/var/log/allerac-backup.log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Error handler
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

log "Starting database backup..."

# Find the PostgreSQL container
DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'db|postgres' | head -1)

if [ -z "$DB_CONTAINER" ]; then
    error_exit "PostgreSQL container not found"
fi

log "Using container: $DB_CONTAINER"

# Perform the backup
log "Creating backup: $BACKUP_FILE"
docker exec "$DB_CONTAINER" pg_dump -U postgres allerac | gzip > "$BACKUP_DIR/$BACKUP_FILE" || error_exit "pg_dump failed"

# Get backup size
BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
log "Backup created: $BACKUP_SIZE"

# Upload to Google Cloud Storage
log "Uploading to gs://$BUCKET_NAME/"
gsutil cp "$BACKUP_DIR/$BACKUP_FILE" "gs://$BUCKET_NAME/" || error_exit "gsutil upload failed"

log "Upload complete"

# Clean up old local backups
log "Cleaning up local backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "allerac-*.sql.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

# List recent backups in bucket
log "Recent backups in bucket:"
gsutil ls -l "gs://$BUCKET_NAME/" | tail -5

log "Backup completed successfully"

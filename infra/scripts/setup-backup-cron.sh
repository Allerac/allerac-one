#!/bin/bash
#
# Setup Backup Cron Job
# Installs daily backup cron job at 3:00 AM
#
# Usage: sudo ./setup-backup-cron.sh <bucket-name>
#

BUCKET_NAME="${1:-allerac-one-backups}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup-database.sh"

# Make backup script executable
chmod +x "$BACKUP_SCRIPT"

# Create cron entry
CRON_ENTRY="0 3 * * * BACKUP_BUCKET=$BUCKET_NAME $BACKUP_SCRIPT >> /var/log/allerac-backup.log 2>&1"

# Check if cron entry already exists
if crontab -l 2>/dev/null | grep -q "backup-database.sh"; then
    echo "Backup cron job already exists. Updating..."
    crontab -l | grep -v "backup-database.sh" | crontab -
fi

# Add new cron entry
(crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -

echo "Backup cron job installed:"
echo "  Schedule: Daily at 3:00 AM"
echo "  Bucket: gs://$BUCKET_NAME/"
echo "  Log: /var/log/allerac-backup.log"
echo ""
echo "Current crontab:"
crontab -l

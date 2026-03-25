# Database Backup and Restore Guide

This document explains how the Allerac One database backup system works and how to restore from a backup.

## Overview

The backup system automatically creates daily PostgreSQL database backups and stores them in Google Cloud Storage (Nearline storage class for cost efficiency).

### Features

- **Daily automated backups** at 3:00 AM (server time)
- **30-day retention** - older backups are automatically deleted
- **Compressed storage** - backups are gzipped for efficient storage
- **Cloud Storage** - backups stored in GCS Nearline (~$0.01/GB/month)

## Backup Location

Backups are stored in Google Cloud Storage:

```
gs://allerac-one-backups/
├── allerac-2026-02-11_03-00-00.sql.gz
├── allerac-2026-02-10_03-00-00.sql.gz
├── allerac-2026-02-09_03-00-00.sql.gz
└── ...
```

## Manual Backup

To create a manual backup at any time:

```bash
# SSH into the server
ssh allerac@<VM_IP>

# Run the backup script
cd ~/allerac-one/infra/scripts
./backup-database.sh
```

## Listing Available Backups

```bash
# List all backups in the bucket
gsutil ls -l gs://allerac-one-backups/

# Or use the gcloud console
gcloud storage ls gs://allerac-one-backups/
```

## Restore Procedures

### Option 1: Using the Restore Script (Recommended)

```bash
# SSH into the server
ssh allerac@<VM_IP>

# Navigate to scripts directory
cd ~/allerac-one/infra/scripts

# List available backups
./restore-database.sh

# Restore a specific backup
./restore-database.sh allerac-2026-02-11_03-00-00.sql.gz

# Or restore the latest backup
./restore-database.sh latest
```

The script will:
1. Download the backup from GCS (if not cached locally)
2. Ask for confirmation before proceeding
3. Stop the application to prevent data conflicts
4. Restore the database
5. Restart the application

### Option 2: Manual Restore

If you need more control over the restore process:

```bash
# 1. SSH into the server
ssh allerac@<VM_IP>

# 2. Download the backup
gsutil cp gs://allerac-one-backups/allerac-2026-02-11_03-00-00.sql.gz /tmp/

# 3. Stop the application (optional but recommended)
cd ~/allerac-one
docker compose stop app

# 4. Restore the database
# Find the database container name
docker ps | grep postgres

# Restore (replace container name as needed)
gunzip < /tmp/allerac-2026-02-11_03-00-00.sql.gz | docker exec -i allerac-one-db-1 psql -U postgres -d allerac

# 5. Restart the application
docker compose start app
```

### Option 3: Restore to a Fresh Database

If you need to restore to a completely fresh database:

```bash
# 1. Stop all services
cd ~/allerac-one
docker compose down

# 2. Remove the existing database volume
docker volume rm allerac-one_db_data

# 3. Start only the database
docker compose up -d db

# 4. Wait for database to be ready
sleep 10

# 5. Restore the backup
gunzip < /tmp/allerac-2026-02-11_03-00-00.sql.gz | docker exec -i allerac-one-db-1 psql -U postgres -d allerac

# 6. Start the rest of the services
docker compose up -d
```

## Restore from Local Machine

If you need to restore from your local machine:

```bash
# 1. Download the backup locally
gsutil cp gs://allerac-one-backups/allerac-2026-02-11_03-00-00.sql.gz ./

# 2. Copy to server
scp allerac-2026-02-11_03-00-00.sql.gz allerac@<VM_IP>:/tmp/

# 3. SSH and restore (follow manual restore steps above)
ssh allerac@<VM_IP>
```

## Verifying a Restore

After restoring, verify the data:

```bash
# Connect to the database
docker exec -it allerac-one-db-1 psql -U postgres -d allerac

# Check tables exist
\dt

# Check row counts
SELECT 'users' as table_name, COUNT(*) FROM users
UNION ALL
SELECT 'conversations', COUNT(*) FROM conversations
UNION ALL
SELECT 'messages', COUNT(*) FROM messages;

# Exit
\q
```

## Troubleshooting

### Backup Not Running

Check the cron job:
```bash
crontab -l | grep backup
```

Check the logs:
```bash
tail -f /var/log/allerac-backup.log
```

### Permission Issues with GCS

Verify the VM service account has storage permissions:
```bash
gsutil ls gs://allerac-one-backups/
```

If permission denied, check the service account scopes in Terraform.

### Database Container Not Found

The scripts auto-detect the PostgreSQL container. If it fails:
```bash
# List running containers
docker ps

# Find the correct container name
docker ps --format '{{.Names}}' | grep -E 'db|postgres'
```

## Setting Up Backups on a New Server

```bash
# 1. Clone the repository
git clone https://github.com/Allerac/allerac-one.git
cd allerac-one

# 2. Make scripts executable
chmod +x infra/scripts/*.sh

# 3. Set up the cron job
sudo ./infra/scripts/setup-backup-cron.sh allerac-one-backups

# 4. Test the backup manually
./infra/scripts/backup-database.sh
```

## Cost Estimates

| Scenario | Backup Size | 30-day Storage | Monthly Cost |
|----------|-------------|----------------|--------------|
| Small app | ~10 MB | 300 MB | ~$0.003 |
| Medium app | ~50 MB | 1.5 GB | ~$0.015 |
| Large app | ~500 MB | 15 GB | ~$0.15 |

*Using Nearline storage at $0.01/GB/month*

## Support

For issues with the backup system, check:
1. `/var/log/allerac-backup.log` for backup errors
2. GCS console for storage issues
3. Docker logs for database issues: `docker logs allerac-one-db-1`

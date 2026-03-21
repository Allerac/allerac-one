#!/bin/sh
set -e

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
until PGPASSWORD=$POSTGRES_PASSWORD psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\q' 2>/dev/null; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done

echo "PostgreSQL is ready!"

# Create migrations tracking table if it doesn't exist
PGPASSWORD=$POSTGRES_PASSWORD psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<EOF
CREATE TABLE IF NOT EXISTS _migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
EOF

MIGRATIONS_DIR="/database/migrations"

# Collect all migration files
TOTAL=0
APPLIED=0
SKIPPED=0
FAILED=0
LAST=""

for migration in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
  TOTAL=$((TOTAL + 1))
  migration_name=$(basename "$migration")
  # Track the highest migration number seen
  LAST="$migration_name"

  already_applied=$(PGPASSWORD=$POSTGRES_PASSWORD psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM _migrations WHERE name = '$migration_name';" | tr -d ' ')

  if [ "$already_applied" = "0" ]; then
    if PGPASSWORD=$POSTGRES_PASSWORD psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$migration" -q 2>/dev/null; then
      PGPASSWORD=$POSTGRES_PASSWORD psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "INSERT INTO _migrations (name) VALUES ('$migration_name');" -q
      echo "  + $migration_name"
      APPLIED=$((APPLIED + 1))
    else
      echo "  ✗ $migration_name FAILED"
      FAILED=$((FAILED + 1))
    fi
  else
    SKIPPED=$((SKIPPED + 1))
  fi
done

# Extract version number from last migration filename (e.g. 020_user_location.sql → 020)
VERSION=$(echo "$LAST" | sed 's/^\([0-9]*\).*/\1/')

if [ "$FAILED" -gt 0 ]; then
  echo "Database schema: $FAILED migration(s) FAILED — check logs above"
  exit 1
elif [ "$APPLIED" -gt 0 ]; then
  echo "Database schema: updated to v${VERSION} ($APPLIED migration(s) applied)"
else
  echo "Database schema: up to date (v${VERSION})"
fi

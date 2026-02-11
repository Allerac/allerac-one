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

echo "Running migrations..."

# Migrations directory (relative to where script is mounted)
MIGRATIONS_DIR="/database/migrations"

# Run each migration file in order
for migration in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
  migration_name=$(basename "$migration")

  # Check if migration was already applied
  already_applied=$(PGPASSWORD=$POSTGRES_PASSWORD psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM _migrations WHERE name = '$migration_name';" | tr -d ' ')

  if [ "$already_applied" = "0" ]; then
    echo "Applying migration: $migration_name"
    PGPASSWORD=$POSTGRES_PASSWORD psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$migration"
    PGPASSWORD=$POSTGRES_PASSWORD psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "INSERT INTO _migrations (name) VALUES ('$migration_name');"
    echo "Migration $migration_name applied successfully"
  else
    echo "Migration $migration_name already applied, skipping"
  fi
done

echo "All migrations completed!"

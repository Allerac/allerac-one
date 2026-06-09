#!/bin/sh
set -e
export LC_ALL=C

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

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/database/migrations}"

# Reject ambiguous ordering before touching the schema.
DUPLICATE_NUMBERS=$(
  find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '[0-9][0-9][0-9]_*.sql' -exec basename {} \; \
    | sed 's/_.*//' \
    | sort \
    | uniq -d
)
if [ -n "$DUPLICATE_NUMBERS" ]; then
  echo "Duplicate migration number(s): $DUPLICATE_NUMBERS"
  exit 1
fi

TOTAL=0
APPLIED=0
SKIPPED=0
LAST=""

for migration in "$MIGRATIONS_DIR"/*.sql; do
  [ -f "$migration" ] || continue
  TOTAL=$((TOTAL + 1))
  migration_name=$(basename "$migration")
  case "$migration_name" in
    *[!A-Za-z0-9._-]*)
      echo "Invalid migration filename: $migration_name"
      exit 1
      ;;
  esac
  LAST="$migration_name"

  already_applied=$(PGPASSWORD=$POSTGRES_PASSWORD psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM _migrations WHERE name = '$migration_name';" | tr -d ' ')

  if [ "$already_applied" = "0" ]; then
    echo "  > $migration_name"
    PGPASSWORD=$POSTGRES_PASSWORD psql \
      -h "$POSTGRES_HOST" \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DB" \
      -v ON_ERROR_STOP=1 \
      --single-transaction \
      -f "$migration" \
      -c "INSERT INTO _migrations (name) VALUES ('$migration_name');" \
      -q
    echo "  + $migration_name"
    APPLIED=$((APPLIED + 1))
  else
    SKIPPED=$((SKIPPED + 1))
  fi
done

VERSION=$(echo "$LAST" | sed 's/^\([0-9]*\).*/\1/')

if [ "$APPLIED" -gt 0 ]; then
  echo "Database schema: updated to v${VERSION} ($APPLIED migration(s) applied)"
else
  echo "Database schema: up to date (v${VERSION})"
fi

#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATABASE_DIR="$ROOT_DIR/src/database"
IMAGE="${POSTGRES_TEST_IMAGE:-pgvector/pgvector:pg16}"
CONTAINER="allerac-schema-smoke-$$"
PASSWORD="allerac-schema-smoke"
TEMP_DIR="$(mktemp -d)"

cleanup() {
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

if ! docker info >/dev/null 2>&1; then
    echo "Docker is required and the current user must be able to access the Docker daemon." >&2
    exit 1
fi

echo "Starting disposable PostgreSQL container..."
docker run --detach --rm \
    --name "$CONTAINER" \
    -e POSTGRES_PASSWORD="$PASSWORD" \
    -v "$DATABASE_DIR:/database:ro" \
    -v "$ROOT_DIR/scripts:/scripts:ro" \
    "$IMAGE" >/dev/null

for attempt in $(seq 1 30); do
    # The PostgreSQL entrypoint briefly starts a socket-only temporary server
    # during initialization, then shuts it down before launching the real
    # server. TCP readiness avoids racing createdb against that shutdown.
    if docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U postgres -d postgres >/dev/null 2>&1; then
        break
    fi
    if [ "$attempt" -eq 30 ]; then
        echo "PostgreSQL did not become ready." >&2
        exit 1
    fi
    sleep 1
done

docker exec "$CONTAINER" createdb -U postgres schema_fresh
docker exec "$CONTAINER" createdb -U postgres schema_upgrade

run_psql() {
    local database="$1"
    shift
    docker exec "$CONTAINER" psql \
        -v ON_ERROR_STOP=1 \
        -U postgres \
        -d "$database" \
        "$@"
}

run_migrations() {
    local database="$1"
    docker exec \
        -e POSTGRES_HOST=localhost \
        -e POSTGRES_USER=postgres \
        -e POSTGRES_PASSWORD="$PASSWORD" \
        -e POSTGRES_DB="$database" \
        "$CONTAINER" \
        sh /database/run-migrations.sh
}

apply_tracked_migration() {
    local database="$1"
    local migration_path="$2"
    local migration_name="$3"

    run_psql "$database" \
        --single-transaction \
        -f "$migration_path" \
        -c "INSERT INTO _migrations (name) VALUES ('$migration_name');" \
        -q
}

echo "Building fresh-install schema..."
run_psql schema_fresh -f /database/init.sql -q
run_migrations schema_fresh
run_migrations schema_fresh

echo "Building legacy-upgrade schema..."
run_psql schema_upgrade -f /database/init.sql -q
run_psql schema_upgrade -c \
    'CREATE TABLE _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );' -q

for migration in "$DATABASE_DIR"/migrations/*.sql; do
    name="$(basename "$migration")"
    number="${name%%_*}"
    if [ "$number" -le 19 ]; then
        apply_tracked_migration schema_upgrade "/database/migrations/$name" "$name"
    fi
done

sed \
    -e 's/CREATE TABLE IF NOT EXISTS/CREATE TABLE/' \
    -e 's/CREATE INDEX IF NOT EXISTS/CREATE INDEX/g' \
    "$DATABASE_DIR/migrations/063_health_activities.sql" \
    > "$TEMP_DIR/020_health_activities.sql"
cp "$DATABASE_DIR/migrations/064_user_location.sql" "$TEMP_DIR/020_user_location.sql"
cp "$DATABASE_DIR/migrations/065_anthropic_api_key.sql" "$TEMP_DIR/021_anthropic_api_key.sql"
cp "$DATABASE_DIR/migrations/066_onboarding.sql" "$TEMP_DIR/021_onboarding.sql"

docker cp "$TEMP_DIR/020_health_activities.sql" "$CONTAINER:/tmp/020_health_activities.sql"
docker cp "$TEMP_DIR/020_user_location.sql" "$CONTAINER:/tmp/020_user_location.sql"
docker cp "$TEMP_DIR/021_anthropic_api_key.sql" "$CONTAINER:/tmp/021_anthropic_api_key.sql"
docker cp "$TEMP_DIR/021_onboarding.sql" "$CONTAINER:/tmp/021_onboarding.sql"

apply_tracked_migration schema_upgrade /tmp/020_health_activities.sql 020_health_activities.sql
apply_tracked_migration schema_upgrade /tmp/020_user_location.sql 020_user_location.sql
apply_tracked_migration schema_upgrade /tmp/021_anthropic_api_key.sql 021_anthropic_api_key.sql
apply_tracked_migration schema_upgrade /tmp/021_onboarding.sql 021_onboarding.sql

for migration in "$DATABASE_DIR"/migrations/*.sql; do
    name="$(basename "$migration")"
    number="${name%%_*}"
    if [ "$number" -ge 22 ] && [ "$number" -le 62 ]; then
        apply_tracked_migration schema_upgrade "/database/migrations/$name" "$name"
    fi
done

run_migrations schema_upgrade
run_migrations schema_upgrade

run_psql schema_fresh -f /scripts/schema-signature.sql \
    > "$TEMP_DIR/fresh.signature"
run_psql schema_upgrade -f /scripts/schema-signature.sql \
    > "$TEMP_DIR/upgrade.signature"

if ! diff -u "$TEMP_DIR/fresh.signature" "$TEMP_DIR/upgrade.signature"; then
    docker exec "$CONTAINER" pg_dump -U postgres --schema-only --no-owner schema_fresh \
        > "$TEMP_DIR/fresh.sql"
    docker exec "$CONTAINER" pg_dump -U postgres --schema-only --no-owner schema_upgrade \
        > "$TEMP_DIR/upgrade.sql"
    echo "Fresh-install and upgraded schemas differ." >&2
    exit 1
fi

echo "Schema equivalence smoke test passed."

#!/usr/bin/env bash
#
# Allerac One - multi-Unit smoke test (lean public Unit)
# ======================================================
# Brings up a THROWAWAY lean Unit (docker-compose.yml + docker-compose.public.yml)
# next to whatever is already running on this host, checks it, then removes it
# again together with its volumes and images.
#
#   bash scripts/smoke/multi-unit-smoke.sh
#
# What it checks
#   1. The resolved config has no executor / portainer / promtail /
#      node-exporter / prometheus / loki / docs service, and every project,
#      container, volume and network name belongs to the throwaway Unit.
#   2. The Unit builds and app + agent-worker become healthy WITHOUT an executor.
#   3. No executor / portainer container exists for the Unit; its volumes and
#      network are distinct from the default Unit's.
#   4. HTTP: /login 200, /api/v1/version 200, /api/v1/me 401 (no session),
#      /api/workspace/run 401 (no session).
#   5. With an ADMIN session (created directly in the throwaway database):
#      /api/v1/me 200 with isAdmin=true, but /api/workspace/run 403 and
#      /workspace 404, i.e. the shell is refused even for an admin.
#   6. The default Unit's containers were not touched (same IDs and states).
#
# Safety
#   - Refuses to run if the Unit name is empty, "allerac", the ALLERAC_UNIT
#     of ./.env, or a project/volume that already exists.
#   - Runs every Compose command in a clean environment (env -i) with an
#     explicit -p, -f and --env-file, so exported shell variables such as
#     ALLERAC_UNIT / COMPOSE_FILE / COMPOSE_PROFILES cannot redirect it.
#   - Before tearing down, re-checks that every container and volume Compose
#     would remove carries the throwaway Unit's prefix.
#
# Options (environment)
#   SMOKE_UNIT=<name>        Unit name (default: smoke-<timestamp>)
#   SMOKE_APP_PORT=<port>    Host port for the app (default: first free from 18080)
#   SMOKE_WAIT_TIMEOUT=<s>   Max seconds to become healthy after the build (default: 300)
#   SMOKE_KEEP=1             Do not tear down (debugging). Remove later with the
#                            command printed at the end.
#   SMOKE_KEEP_IMAGES=1      Tear down but keep the built images.
#   SMOKE_DRY_RUN=1          Only checks 0-1 (config), no containers.
#   SMOKE_IMAGES_FROM=<unit> Reuse the app/agent-worker images already built for
#                            another Unit (e.g. "allerac" in CI) instead of
#                            building: they are tagged <unit>-app etc. (same code).
#
# Requirements: docker with Compose >= 2.24.4, curl, openssl (or /dev/urandom).

# ok/bad always return 0, so "A && ok || bad" is a safe pass/fail idiom (SC2015);
# the single-quoted $VARS are expanded by the shell inside the db container (SC2016).
# shellcheck disable=SC2015,SC2016

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0
ok()   { PASS=$((PASS + 1)); echo -e "${GREEN}PASS${NC} $*"; }
bad()  { FAIL=$((FAIL + 1)); echo -e "${RED}FAIL${NC} $*"; }
info() { echo -e "${YELLOW}....${NC} $*"; }
die()  { echo -e "${RED}ABORT${NC} $*" >&2; exit 2; }

if [ -n "${SMOKE_UNIT+x}" ] && [ -z "$SMOKE_UNIT" ]; then
    echo "ABORT SMOKE_UNIT is set but empty." >&2; exit 2
fi
UNIT="${SMOKE_UNIT:-smoke-$(date +%s)}"
WAIT_TIMEOUT="${SMOKE_WAIT_TIMEOUT:-300}"
ENV_FILE=".env.${UNIT}"
TMP_DIR=""
STARTED=false

# ------------------------------------------------------------------
# Guards
# ------------------------------------------------------------------
[ -n "$UNIT" ] || die "Unit name is empty."
[[ "$UNIT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die "Invalid Unit name '$UNIT' (lowercase letters, digits, '-', '_')."
[ "$UNIT" != "allerac" ] || die "Refusing to use the default Unit name 'allerac'."
case "$UNIT" in allerac-*|allerac_*) die "Refusing a Unit name starting with 'allerac' ('$UNIT'): other tools match allerac-* containers." ;; esac
DEFAULT_UNIT="$( { grep -E '^ALLERAC_UNIT=' .env 2>/dev/null || true; } | tail -n 1 | cut -d= -f2- | tr -d '"'"'"' ')"
DEFAULT_UNIT="${DEFAULT_UNIT:-allerac}"
[ "$UNIT" != "$DEFAULT_UNIT" ] || die "Refusing to use the Unit of ./.env ('$DEFAULT_UNIT')."
[ -f docker-compose.yml ] && [ -f docker-compose.public.yml ] || die "Run from an allerac-one checkout (docker-compose.public.yml missing)."
[ ! -e "$ENV_FILE" ] || die "$ENV_FILE already exists; pick another SMOKE_UNIT."

command -v docker >/dev/null || die "docker not found."
command -v curl >/dev/null || die "curl not found."

compose_version="$(docker compose version --short 2>/dev/null || true)"
[ -n "$compose_version" ] || die "docker compose (v2) not available."
version_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n 1)" = "$2" ]; }
version_ge "${compose_version#v}" "2.24.4" || die "Docker Compose $compose_version < 2.24.4 (docker-compose.public.yml uses !override)."

if [ -n "$(docker ps -aq --filter "label=com.docker.compose.project=${UNIT}")" ]; then
    die "A Compose project named '$UNIT' already exists on this host."
fi
for vol in "${UNIT}_db_data" "${UNIT}_backups_data" "${UNIT}_redis_data" "${UNIT}_ollama_data"; do
    if docker volume inspect "$vol" >/dev/null 2>&1; then die "Volume $vol already exists."; fi
done

# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
rand_hex() {
    if command -v openssl >/dev/null; then openssl rand -hex 32
    else od -An -tx1 -N32 /dev/urandom | tr -d ' \n'; fi
}
port_in_use() {
    if command -v ss >/dev/null; then
        ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$1\$"
    else
        (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
    fi
}
free_port() {
    local p="$1"
    while port_in_use "$p"; do p=$((p + 1)); done
    echo "$p"
}
# Clean environment: only PATH/HOME/Docker client settings survive, so nothing
# exported in the caller's shell can change the project, files or profiles.
dc() {
    env -i PATH="$PATH" HOME="${HOME:-/root}" \
        ${DOCKER_HOST:+DOCKER_HOST="$DOCKER_HOST"} \
        ${DOCKER_CONTEXT:+DOCKER_CONTEXT="$DOCKER_CONTEXT"} \
        ${DOCKER_CONFIG:+DOCKER_CONFIG="$DOCKER_CONFIG"} \
        docker compose -p "$UNIT" -f docker-compose.yml -f docker-compose.public.yml \
        --env-file "$ENV_FILE" "$@"
}
default_unit_snapshot() {
    docker ps -a --filter "label=com.docker.compose.project=${DEFAULT_UNIT}" \
        --format '{{.ID}} {{.Names}} {{.State}}' | sort
}
wait_healthy() {
    local deadline=$((SECONDS + WAIT_TIMEOUT)) c s
    for c in "$@"; do
        while :; do
            s="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$c" 2>/dev/null || echo missing)"
            [ "$s" = "healthy" ] && break
            if [ "$s" = "exited" ] || [ "$s" = "dead" ] || [ "$SECONDS" -ge "$deadline" ]; then
                echo "  $c: $s" >&2
                return 1
            fi
            sleep 3
        done
    done
}
http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$@" || echo "000"; }

cleanup() {
    local rc=$?
    if [ "$STARTED" = true ] && [ "${SMOKE_KEEP:-}" = "1" ]; then
        echo ""
        info "SMOKE_KEEP=1: leaving Unit '$UNIT' running. Remove it with:"
        echo "  docker compose -p $UNIT -f docker-compose.yml -f docker-compose.public.yml --env-file $ENV_FILE down -v --rmi local && rm -f $ENV_FILE"
    elif [ "$STARTED" = true ]; then
        echo ""
        info "Tearing down Unit '$UNIT' (containers, volumes, network, images)..."
        # Last guard: everything Compose would remove must carry the Unit prefix.
        local foreign
        foreign="$(docker ps -a --filter "label=com.docker.compose.project=${UNIT}" --format '{{.Names}}' | grep -v "^${UNIT}-" || true)"
        foreign="$foreign$(docker volume ls -q --filter "label=com.docker.compose.project=${UNIT}" | grep -v "^${UNIT}_" || true)"
        if [ -n "$foreign" ]; then
            echo -e "${RED}Not tearing down: unexpected resources in project ${UNIT}:${NC} $foreign" >&2
            rc=2
        else
            local rmi=(--rmi local)
            [ "${SMOKE_KEEP_IMAGES:-}" = "1" ] && rmi=()
            dc down -v --remove-orphans "${rmi[@]}" >/dev/null 2>&1 || echo "  (compose down reported an error; check 'docker ps -a | grep ${UNIT}-')"
        fi
    fi
    if [ "${SMOKE_KEEP:-}" != "1" ]; then rm -f "$ENV_FILE"; fi
    [ -z "$TMP_DIR" ] || rm -rf "$TMP_DIR"
    exit "$rc"
}
trap cleanup EXIT

# ------------------------------------------------------------------
# 0. Throwaway env file
# ------------------------------------------------------------------
APP_PORT="${SMOKE_APP_PORT:-$(free_port 18080)}"
OLLAMA_PORT="$(free_port 21434)"
TMP_DIR="$(mktemp -d)"
printf '[]\n' > "$TMP_DIR/telegram-bots.json"
umask 077
cat > "$ENV_FILE" <<EOF
# Generated by scripts/smoke/multi-unit-smoke.sh, removed at the end.
ALLERAC_UNIT=${UNIT}
ALLERAC_ENV_FILE=${ENV_FILE}
COMPOSE_FILE=docker-compose.yml:docker-compose.public.yml
COMPOSE_PROFILES=
APP_PORT=${APP_PORT}
OLLAMA_PORT=${OLLAMA_PORT}
APP_URL=http://127.0.0.1:${APP_PORT}
NEXT_PUBLIC_API_URL=http://127.0.0.1:${APP_PORT}
ENCRYPTION_KEY=$(rand_hex)
TELEGRAM_TOKEN_ENCRYPTION_KEY=$(rand_hex)
EXECUTOR_SECRET=$(rand_hex)
POSTGRES_PASSWORD=$(rand_hex)
ALLOW_REGISTRATION=false
TELEGRAM_BOTS_FILE=${TMP_DIR}/telegram-bots.json
OLLAMA_MODELS=
EOF
umask 022
info "Unit: $UNIT  (default Unit on this host: $DEFAULT_UNIT)"
info "App port: $APP_PORT   env file: $ENV_FILE   compose: $compose_version"

# ------------------------------------------------------------------
# 1. Resolved config
# ------------------------------------------------------------------
config_json="$(dc config --format json)" || die "docker compose config failed."
services="$(dc config --services)"
for forbidden in executor portainer promtail node-exporter prometheus loki docs; do
    if printf '%s\n' "$services" | grep -qx "$forbidden"; then bad "config: service '$forbidden' is active in a lean Unit"
    else ok "config: no '$forbidden' service"; fi
done
for svc in app agent-worker db migrations; do
    printf '%s\n' "$services" | grep -qx "$svc" && ok "config: '$svc' present" || bad "config: '$svc' missing"
done

# Names, read from the JSON with plain grep/sed (no jq dependency).
project_name="$(printf '%s' "$config_json" | grep -o '"name": *"[^"]*"' | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/')"
[ "$project_name" = "$UNIT" ] && ok "config: project name is '$UNIT'" || bad "config: project name '$project_name' != '$UNIT'"
cnames="$(printf '%s' "$config_json" | grep -o '"container_name": *"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')"
if [ -n "$cnames" ] && ! printf '%s\n' "$cnames" | grep -qv "^${UNIT}-"; then ok "config: all container names start with '${UNIT}-'"
else bad "config: container names outside '${UNIT}-': $(printf '%s\n' "$cnames" | grep -v "^${UNIT}-" | tr '\n' ' ')"; fi
vnames="$(printf '%s' "$config_json" | grep -o '"name": *"'"${UNIT}"'_[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/' | sort -u)"
printf '%s\n' "$vnames" | grep -qx "${UNIT}_db_data" && ok "config: database volume is ${UNIT}_db_data" || bad "config: ${UNIT}_db_data not found"
printf '%s\n' "$vnames" | grep -qx "${UNIT}_default" && ok "config: network is ${UNIT}_default" || bad "config: network ${UNIT}_default not found"
if printf '%s' "$config_json" | grep -q "\"${DEFAULT_UNIT}_db_data\"\|\"${DEFAULT_UNIT}-app\""; then
    bad "config: references the default Unit's names (${DEFAULT_UNIT}_db_data / ${DEFAULT_UNIT}-app)"
else ok "config: no reference to the default Unit's container/volume names"; fi
printf '%s' "$config_json" | grep -q '"EXECUTOR_ENABLED": *"false"' && ok "config: EXECUTOR_ENABLED=false" || bad "config: EXECUTOR_ENABLED=false missing"

if [ "${SMOKE_DRY_RUN:-}" = "1" ]; then
    echo ""; echo "Dry run: $PASS passed, $FAIL failed (no containers started)."
    [ "$FAIL" -eq 0 ]; exit
fi

# ------------------------------------------------------------------
# 2. Build and start (app, agent-worker and their dependencies only:
#    no Ollama model download, no Telegram)
# ------------------------------------------------------------------
before_default="$(default_unit_snapshot)"
STARTED=true
if [ -n "${SMOKE_IMAGES_FROM:-}" ]; then
    for svc in app agent-worker; do
        docker image inspect "${SMOKE_IMAGES_FROM}-${svc}" >/dev/null 2>&1 \
            || die "SMOKE_IMAGES_FROM=${SMOKE_IMAGES_FROM}: image ${SMOKE_IMAGES_FROM}-${svc} not found."
        docker tag "${SMOKE_IMAGES_FROM}-${svc}" "${UNIT}-${svc}"
    done
    info "Reusing images ${SMOKE_IMAGES_FROM}-app / ${SMOKE_IMAGES_FROM}-agent-worker (tagged ${UNIT}-*)."
else
    info "Building app and agent-worker images (can take several minutes)..."
    dc build app agent-worker || die "image build failed."
fi
info "Starting app, agent-worker and their dependencies (db, migrations)..."
dc up -d --no-build app agent-worker || bad "docker compose up failed"
if wait_healthy "${UNIT}-app" "${UNIT}-agent-worker"; then
    ok "app and agent-worker are healthy without an executor"
else
    bad "app/agent-worker did not become healthy"
    dc ps -a || true
    dc logs --tail=80 app agent-worker migrations || true
fi

# ------------------------------------------------------------------
# 3. Containers, volumes, network
# ------------------------------------------------------------------
running_services="$(docker ps -a --filter "label=com.docker.compose.project=${UNIT}" --format '{{.Label "com.docker.compose.service"}}')"
for forbidden in executor portainer promtail node-exporter; do
    printf '%s\n' "$running_services" | grep -qx "$forbidden" && bad "container for '$forbidden' exists" || ok "no '$forbidden' container"
done
docker volume inspect "${UNIT}_db_data" >/dev/null 2>&1 && ok "volume ${UNIT}_db_data exists" || bad "volume ${UNIT}_db_data missing"
docker network inspect "${UNIT}_default" >/dev/null 2>&1 && ok "network ${UNIT}_default exists" || bad "network ${UNIT}_default missing"
db_mount="$(docker inspect "${UNIT}-db" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' 2>/dev/null || true)"
[ "$db_mount" = "${UNIT}_db_data" ] && ok "${UNIT}-db uses ${UNIT}_db_data" || bad "${UNIT}-db data volume is '$db_mount'"
app_nets="$(docker inspect "${UNIT}-app" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null || true)"
[ "$(echo "$app_nets" | xargs)" = "${UNIT}_default" ] && ok "${UNIT}-app is only on ${UNIT}_default" || bad "${UNIT}-app networks: $app_nets"
exec_env="$(docker exec "${UNIT}-app" printenv EXECUTOR_ENABLED 2>/dev/null || true)"
[ "$exec_env" = "false" ] && ok "app container has EXECUTOR_ENABLED=false" || bad "app container EXECUTOR_ENABLED='$exec_env'"

# ------------------------------------------------------------------
# 4. HTTP without a session
# ------------------------------------------------------------------
BASE="http://127.0.0.1:${APP_PORT}"
[ "$(http_code "$BASE/login")" = "200" ] && ok "GET /login -> 200" || bad "GET /login did not return 200"
[ "$(http_code "$BASE/api/v1/version")" = "200" ] && ok "GET /api/v1/version -> 200" || bad "GET /api/v1/version did not return 200"
[ "$(http_code "$BASE/api/v1/me")" = "401" ] && ok "GET /api/v1/me (no session) -> 401" || bad "GET /api/v1/me (no session) did not return 401"
code="$(http_code -X POST -H 'Content-Type: application/json' -d '{"command":"id"}' "$BASE/api/workspace/run")"
[ "$code" = "401" ] && ok "POST /api/workspace/run (no session) -> 401" || bad "POST /api/workspace/run (no session) -> $code"

# ------------------------------------------------------------------
# 5. Admin session created directly in the throwaway database
# ------------------------------------------------------------------
TOKEN="$(rand_hex)"
psql_out="$(dc exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -qtA -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<SQL 2>&1 || true
WITH u AS (
  INSERT INTO users (email, name, is_admin, is_active)
  VALUES ('smoke-admin@smoke.invalid', 'Smoke Admin', true, true)
  RETURNING id
)
INSERT INTO user_sessions (user_id, token, expires_at)
SELECT id, '${TOKEN}', NOW() + INTERVAL '1 hour' FROM u
RETURNING user_id;
SQL
)"
if printf '%s' "$psql_out" | grep -Eq '^[0-9a-f-]{36}$'; then
    ok "created a throwaway admin session"
    COOKIE="session_token=${TOKEN}"
    me="$(curl -s --max-time 20 -H "Cookie: $COOKIE" "$BASE/api/v1/me" || true)"
    printf '%s' "$me" | grep -q '"isAdmin": *true' && ok "GET /api/v1/me (admin session) -> isAdmin=true" || bad "admin session not accepted by /api/v1/me: ${me:0:200}"
    resp="$(curl -s --max-time 20 -w '\n%{http_code}' -X POST -H "Cookie: $COOKIE" -H 'Content-Type: application/json' -d '{"command":"id"}' "$BASE/api/workspace/run" || true)"
    code="$(printf '%s' "$resp" | tail -n 1)"
    [ "$code" = "403" ] && ok "POST /api/workspace/run (admin, no executor) -> 403" || bad "POST /api/workspace/run (admin) -> $code: $(printf '%s' "$resp" | head -n 1 | cut -c1-200)"
    code="$(http_code -H "Cookie: $COOKIE" "$BASE/workspace")"
    [ "$code" = "404" ] && ok "GET /workspace (admin, no executor) -> 404" || bad "GET /workspace (admin) -> $code"
else
    bad "could not create an admin session: ${psql_out:0:300}"
fi

# ------------------------------------------------------------------
# 6. Default Unit untouched
# ------------------------------------------------------------------
after_default="$(default_unit_snapshot)"
if [ "$before_default" = "$after_default" ]; then
    ok "default Unit '${DEFAULT_UNIT}' containers unchanged ($(printf '%s' "$after_default" | grep -c . || true) containers)"
else
    bad "default Unit containers changed during the smoke test"
    diff <(echo "$before_default") <(echo "$after_default") || true
fi

echo ""
echo "Result: $PASS passed, $FAIL failed."
[ "$FAIL" -eq 0 ]

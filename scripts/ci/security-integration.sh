#!/usr/bin/env bash
#
# Allerac One - security integration test against a running Unit (Docker).
# ========================================================================
# Brings up the core of a Unit (db, migrations, executor, app, agent-worker;
# no Ollama, monitoring, n8n or Portainer), seeds a throwaway admin and a
# throwaway non-admin user, and checks the shell hardening end to end:
#
#   executor   uid 10001, read-only rootfs, CapEff 0, NoNewPrivs 1, no
#              /home, /project or Docker socket mounts, refuses a short secret
#   network    /execute 401 without / with a wrong secret (from the app
#              container); every published port is 127.0.0.1 except the
#              intentionally public ones (app 8080, ollama 11434, docs 8000,
#              caddy 80/443, and today also webhook 9999 for GitHub deploy
#              hooks and garmin-auth-worker 8787); executor 3001 never published
#   shell      admin: /workspace 200, POST /api/workspace/run 200 and the
#              command cannot see EXECUTOR_SECRET; non-admin: the 7
#              /api/workspace/* routes (8 calls) 403 and /workspace 404;
#              no session: 401
#   api keys   a key with empty scopes is denied (403), a scoped key only
#              reaches its own scope, key creation without scopes is 400
#   sign-up    registration closed by default: checkFirstRun reports
#              registrationOpen=false and the register server action creates
#              no user (calls the real Next.js server actions)
#
# Usage (from the repo root; CI runs exactly this):
#   bash scripts/ci/generate-ci-env.sh                    # writes .env (refuses to overwrite)
#   bash scripts/ci/security-integration.sh --build --down
#
# On a host that already runs your Unit, use a separate throwaway Unit:
#   bash scripts/ci/generate-ci-env.sh .env.ci-sec ci-sec
#   bash scripts/ci/security-integration.sh --env-file .env.ci-sec --build --down
#
# Options
#   --env-file FILE  env file of the Unit to test (default .env)
#   --build          build images (default: use existing images, e.g. from CI's bake step)
#   --no-up          do not start anything; test the Unit that is already running
#   --down           tear the Unit down with its volumes at the end (only if this run started it)
#   --logs-dir DIR   on failure, write each service's logs and `ps` to DIR
#
# Safety: refuses to seed into a database that has users other than the seed
# account (dev@local.host) and this script's own *@ci.invalid accounts, so it
# cannot be pointed at a real install by mistake. Without --no-up it also
# refuses to start if the Unit already has containers or a database volume.

# The single-quoted $VARS below are expanded inside the containers (SC2016);
# "A && ok || bad" is safe because ok/bad always return 0 (SC2015).
# shellcheck disable=SC2015,SC2016

set -euo pipefail
# A check that aborts the script (set -e) instead of calling bad() would otherwise
# end the run with no FAIL line; say where it happened.
trap 'rc=$?; echo "ABORTED: line $LINENO exited $rc: $BASH_COMMAND" >&2; [ -z "${GITHUB_ACTIONS:-}" ] || echo "::error title=security-integration aborted::line $LINENO: $BASH_COMMAND"' ERR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_DIR"

ENV_FILE=".env"; DO_BUILD=false; DO_UP=true; DO_DOWN=false; LOGS_DIR=""
while [ $# -gt 0 ]; do
    case "$1" in
        --env-file) ENV_FILE="$2"; shift 2 ;;
        --build) DO_BUILD=true; shift ;;
        --no-up) DO_UP=false; shift ;;
        --down) DO_DOWN=true; shift ;;
        --logs-dir) LOGS_DIR="$2"; shift 2 ;;
        -h|--help) sed -n '2,45p' "$0"; exit 0 ;;
        *) echo "Unknown option: $1" >&2; exit 2 ;;
    esac
done

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0; SKIP=0
ok()   { PASS=$((PASS + 1)); echo -e "${GREEN}PASS${NC} $*"; }
bad()  { FAIL=$((FAIL + 1)); echo -e "${RED}FAIL${NC} $*"; [ -z "${GITHUB_ACTIONS:-}" ] || echo "::error title=security-integration::$*"; }
skip() { SKIP=$((SKIP + 1)); echo -e "${YELLOW}SKIP${NC} $*"; }
info() { echo -e "${YELLOW}....${NC} $*"; }
die()  { echo -e "${RED}ABORT${NC} $*" >&2; exit 2; }

[ -f "$ENV_FILE" ] || die "$ENV_FILE not found (create one with scripts/ci/generate-ci-env.sh)."
command -v docker >/dev/null || die "docker not found."
command -v curl >/dev/null || die "curl not found."

env_value() { { grep -E "^$1=" "$ENV_FILE" || true; } | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }
UNIT="$(env_value ALLERAC_UNIT)"; UNIT="${UNIT:-allerac}"
[[ "$UNIT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die "Invalid ALLERAC_UNIT '$UNIT' in $ENV_FILE."
APP_PORT="$(env_value APP_PORT)"; APP_PORT="${APP_PORT:-8080}"
SECRET="$(env_value EXECUTOR_SECRET)"
[ "${#SECRET}" -ge 32 ] || die "EXECUTOR_SECRET in $ENV_FILE is missing or shorter than 32 characters."
BASE="http://127.0.0.1:${APP_PORT}"
STARTED=false

# Clean environment: only the env file decides project, files and profiles.
dc() {
    env -i PATH="$PATH" HOME="${HOME:-/root}" \
        ${DOCKER_HOST:+DOCKER_HOST="$DOCKER_HOST"} \
        ${DOCKER_CONTEXT:+DOCKER_CONTEXT="$DOCKER_CONTEXT"} \
        ${DOCKER_CONFIG:+DOCKER_CONFIG="$DOCKER_CONFIG"} \
        docker compose -p "$UNIT" -f docker-compose.yml --env-file "$ENV_FILE" "$@"
}
psql_q() { dc exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -qtA -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; }
http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$@" || true; }
wait_healthy() {
    local deadline=$((SECONDS + ${HEALTH_TIMEOUT:-240})) c s restarts
    for c in "$@"; do
        while :; do
            s="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} {{.RestartCount}}' "$c" 2>/dev/null || echo "missing 0")"
            restarts="${s##* }"; s="${s% *}"
            [ "$s" = "healthy" ] && break
            # A crash loop never becomes healthy: stop waiting after 3 restarts.
            if [ "${restarts:-0}" -ge 3 ] 2>/dev/null; then
                echo "  $c: crash loop ($restarts restarts). Last log lines:" >&2
                docker logs --tail 30 "$c" 2>&1 | sed 's/^/    /' >&2 || true
                return 1
            fi
            if [ "$s" = "exited" ] || [ "$s" = "dead" ] || [ "$SECONDS" -ge "$deadline" ]; then
                echo "  $c: $s" >&2; return 1
            fi
            sleep 3
        done
    done
}

collect_logs() {
    [ -n "$LOGS_DIR" ] || return 0
    mkdir -p "$LOGS_DIR"
    dc ps -a > "$LOGS_DIR/${UNIT}-ps.txt" 2>&1 || true
    local svc
    for svc in $(dc ps -a --services 2>/dev/null || true); do
        dc logs --no-color --timestamps "$svc" > "$LOGS_DIR/${UNIT}-${svc}.log" 2>&1 || true
    done
    echo "Logs written to $LOGS_DIR"
}
cleanup() {
    local rc=$?
    if [ "$rc" -ne 0 ] || [ "$FAIL" -gt 0 ]; then collect_logs; fi
    if [ "$DO_DOWN" = true ] && [ "$STARTED" = true ]; then
        local foreign
        foreign="$(docker ps -a --filter "label=com.docker.compose.project=${UNIT}" --format '{{.Names}}' | grep -v "^${UNIT}-" || true)"
        if [ -n "$foreign" ]; then
            echo "Not tearing down: unexpected containers in project ${UNIT}: $foreign" >&2
        else
            info "Tearing down Unit '$UNIT' (containers and volumes)..."
            dc down -v --remove-orphans >/dev/null 2>&1 || true
        fi
    fi
    exit "$rc"
}
trap cleanup EXIT

info "Unit: $UNIT   env file: $ENV_FILE   app: $BASE"

# ------------------------------------------------------------------
# 0. Start the core services
# ------------------------------------------------------------------
CORE=(db migrations executor app agent-worker)
if [ "$DO_UP" = true ]; then
    [ -z "$(docker ps -aq --filter "label=com.docker.compose.project=${UNIT}")" ] \
        || die "Unit '$UNIT' already has containers. Use --no-up to test it as is, or a throwaway Unit (see --help)."
    ! docker volume inspect "${UNIT}_db_data" >/dev/null 2>&1 \
        || die "Volume ${UNIT}_db_data already exists; refusing to seed test users into it."
    STARTED=true
    if [ "$DO_BUILD" = true ]; then
        info "Building ${CORE[*]}..."
        dc build executor app agent-worker
    fi
    info "Starting ${CORE[*]} (no Ollama, monitoring, n8n or Portainer)..."
    dc up -d --no-build "${CORE[@]}" || bad "docker compose up failed"
fi
if wait_healthy "${UNIT}-db" "${UNIT}-executor" "${UNIT}-app" "${UNIT}-agent-worker"; then
    ok "db, executor, app and agent-worker are healthy without Ollama"
else
    bad "core services did not become healthy"
    dc ps -a || true
    exit 1
fi

# ------------------------------------------------------------------
# 1. Seed throwaway users (refuse on a real database)
# ------------------------------------------------------------------
others="$(printf '%s\n' "SELECT count(*) FROM users WHERE email <> 'dev@local.host' AND email NOT LIKE '%@ci.invalid';" | psql_q)"
[ "$others" = "0" ] || die "The database of Unit '$UNIT' has $others real user(s); refusing to seed test accounts."
ADMIN_TOKEN="$(openssl rand -hex 32 2>/dev/null || od -An -tx1 -N32 /dev/urandom | tr -d ' \n')"
USER_TOKEN="$(openssl rand -hex 32 2>/dev/null || od -An -tx1 -N32 /dev/urandom | tr -d ' \n')"
seed="$(psql_q <<SQL
INSERT INTO users (email, name, is_admin, is_active) VALUES
  ('ci-admin@ci.invalid', 'CI Admin', true, true),
  ('ci-user@ci.invalid',  'CI User',  false, true)
ON CONFLICT (email) DO UPDATE SET is_admin = EXCLUDED.is_admin, is_active = true;
INSERT INTO user_sessions (user_id, token, expires_at)
  SELECT id, CASE WHEN is_admin THEN '${ADMIN_TOKEN}' ELSE '${USER_TOKEN}' END, NOW() + INTERVAL '1 hour'
  FROM users WHERE email IN ('ci-admin@ci.invalid', 'ci-user@ci.invalid');
SELECT id FROM users WHERE email = 'ci-admin@ci.invalid';
SQL
)"
ADMIN_ID="$(printf '%s\n' "$seed" | grep -E '^[0-9a-f-]{36}$' | tail -n 1)"
[ -n "$ADMIN_ID" ] || die "Seeding failed: $seed"
ok "seeded ci-admin@ci.invalid (admin) and ci-user@ci.invalid (non-admin) with sessions"
ADMIN_COOKIE="session_token=${ADMIN_TOKEN}"
USER_COOKIE="session_token=${USER_TOKEN}"
dc exec -T executor mkdir -p "/workspace/projects/${ADMIN_ID}"

# ------------------------------------------------------------------
# 2. Executor container hardening
# ------------------------------------------------------------------
EXE="${UNIT}-executor"
[ "$(dc exec -T executor id -u | tr -d '\r')" = "10001" ] && ok "executor runs as uid 10001" || bad "executor uid is not 10001"
status="$(dc exec -T executor cat /proc/1/status | tr -d '\r')"
printf '%s\n' "$status" | grep -Eq '^CapEff:[[:space:]]+0+$' && ok "executor server: CapEff is zero" || bad "executor server has effective capabilities: $(printf '%s\n' "$status" | grep CapEff)"
printf '%s\n' "$status" | grep -Eq '^NoNewPrivs:[[:space:]]+1$' && ok "executor server: NoNewPrivs 1" || bad "executor server: NoNewPrivs is not 1"
[ "$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' "$EXE")" = "true" ] && ok "executor rootfs is read-only (HostConfig)" || bad "executor rootfs is writable"
if dc exec -T executor sh -c 'touch /ci-ro-probe' >/dev/null 2>&1; then bad "executor could write to /"; else ok "executor cannot write to /"; fi
mounts="$(docker inspect -f '{{range .Mounts}}{{.Type}}|{{.Name}}|{{.Source}}|{{.Destination}}{{println}}{{end}}' "$EXE" | sed '/^$/d')"
unexpected="$(printf '%s\n' "$mounts" | while IFS='|' read -r type name src dst; do
    case "$type:$dst" in
        "volume:/workspace") [ "$name" = "${UNIT}_executor_workspace" ] || echo "$type $name -> $dst" ;;
        bind:*) case "$src" in
                    */infra/executor/workspace-ports|*/infra/executor/workspace-kill-port) ;;
                    *) echo "$type $src -> $dst" ;;
                esac ;;
        *) echo "$type ${name:-$src} -> $dst" ;;
    esac
done)"
[ -z "$unexpected" ] && ok "executor mounts: only ${UNIT}_executor_workspace and the two helper scripts" || bad "unexpected executor mounts: $unexpected"
sensitive="$(printf '%s\n' "$mounts" | awk -F'|' '$4 ~ /^\/(home|project|root)(\/|$)/ || $3 ~ /docker\.sock$/ || $4 ~ /docker\.sock$/')"
[ -z "$sensitive" ] && ok "no /home, /project, /root or Docker socket mount" || bad "executor mounts a sensitive path: $sensitive"
short_out="$(timeout 90 env -i PATH="$PATH" HOME="${HOME:-/root}" docker compose -p "$UNIT" -f docker-compose.yml --env-file "$ENV_FILE" \
    run --rm --no-deps -T -e EXECUTOR_SECRET=too-short executor 2>&1)" && short_rc=0 || short_rc=$?
if [ "$short_rc" -ne 0 ] && printf '%s' "$short_out" | grep -q 'FATAL'; then ok "executor refuses to start with a short secret"
else bad "executor started with a short secret (exit $short_rc): ${short_out:0:200}"; fi

# ------------------------------------------------------------------
# 3. Network exposure
# ------------------------------------------------------------------
exec_auth="$(docker exec "${UNIT}-app" node -e '
const call = h => fetch("http://executor:3001/execute",{method:"POST",headers:{"Content-Type":"application/json",...h},body:JSON.stringify({command:"id"})}).then(r=>r.status).catch(e=>"ERR:"+e.message);
(async()=>{ console.log([await call({}), await call({"x-executor-secret":"wrong-secret-wrong-secret-wrong-secret"}), await call({"x-executor-secret":process.env.EXECUTOR_SECRET})].join(" ")); })()' 2>&1 || true)"
[ "$exec_auth" = "401 401 200" ] && ok "/execute: 401 without secret, 401 with a wrong one, 200 with the right one" || bad "/execute auth from the app container: '$exec_auth' (want '401 401 200')"

public_bad="$(docker ps --filter "label=com.docker.compose.project=${UNIT}" --format '{{.Names}}|{{.Ports}}' | while IFS='|' read -r name ports; do
    printf '%s\n' "$ports" | tr ',' '\n' | sed 's/^ *//' | { grep -- '->' || true; } | while read -r p; do
        host="${p%%->*}"; target="${p##*->}"
        case "$target" in 3001/tcp) echo "$name publishes executor port 3001 ($p)"; continue ;; esac
        case "$host" in 127.0.0.1:*) continue ;; esac
        case "$name:$target" in
            "${UNIT}-app:8080/tcp"|"${UNIT}-ollama:11434/tcp"|"${UNIT}-docs:8000/tcp"|"${UNIT}-caddy:80/tcp"|"${UNIT}-caddy:443/tcp"|"${UNIT}-webhook:9000/tcp"|"${UNIT}-garmin-auth-worker:8787/tcp") ;;
            *) echo "$name $p" ;;
        esac
    done
done)"
[ -z "$public_bad" ] && ok "running containers: internal ports only on 127.0.0.1, 3001 not published" || bad "ports exposed beyond 127.0.0.1: $public_bad"

if command -v python3 >/dev/null; then
    profiles=(); while IFS= read -r p; do [ -n "$p" ] && profiles+=(--profile "$p"); done < <(dc config --profiles)
    cfg_err="$(mktemp)"
    cfg_json="$(dc "${profiles[@]}" config --format json 2>"$cfg_err")" || { bad "docker compose config failed: $(head -c 300 "$cfg_err")"; cfg_json=''; }
    rm -f "$cfg_err"
    if [ -n "$cfg_json" ]; then
    cfg_bad="$(printf '%s' "$cfg_json" | python3 -c '
import json, sys
allowed = {("app", "8080"), ("ollama", "11434"), ("docs", "8000"), ("caddy", "80"), ("caddy", "443"), ("webhook", "9000"), ("garmin-auth-worker", "8787")}
for name, svc in json.load(sys.stdin)["services"].items():
    for p in svc.get("ports", []):
        target = str(p.get("target"))
        if target == "3001":
            print(f"{name}: publishes 3001")
        elif p.get("host_ip") != "127.0.0.1" and (name, target) not in allowed:
            print(name + ": " + str(p.get("host_ip", "0.0.0.0")) + ":" + str(p.get("published")) + "->" + target)
')" || cfg_bad="could not parse the resolved config"
    [ -z "$cfg_bad" ] && ok "resolved config with all $(( ${#profiles[@]} / 2 )) profiles: internal ports bound to 127.0.0.1" || bad "config publishes internal ports beyond localhost: $cfg_bad"
    fi
else
    skip "python3 not available: config-level port check skipped"
fi

# ------------------------------------------------------------------
# 4. Shell access policy over HTTP
# ------------------------------------------------------------------
[ "$(http_code -H "Cookie: $ADMIN_COOKIE" "$BASE/workspace")" = "200" ] && ok "admin: GET /workspace -> 200" || bad "admin: GET /workspace did not return 200"
run_body='{"command":"id; echo HOME=$HOME; echo secret=[$EXECUTOR_SECRET]; env | grep -c EXECUTOR_SECRET; touch /ci-ro-probe"}'
resp="$(curl -s --max-time 60 -w '\n%{http_code}' -X POST "$BASE/api/workspace/run" -H "Cookie: $ADMIN_COOKIE" -H 'Content-Type: application/json' --data-binary "$run_body" || true)"
code="$(printf '%s' "$resp" | tail -n 1)"; body="$(printf '%s' "$resp" | sed '$d')"
[ "$code" = "200" ] && ok "admin: POST /api/workspace/run -> 200" || bad "admin: POST /api/workspace/run -> $code ${body:0:200}"
printf '%s' "$body" | grep -q 'uid=10001' && ok "admin command runs as uid 10001" || bad "admin command output has no uid=10001: ${body:0:200}"
printf '%s' "$body" | grep -q 'secret=\[\]' && printf '%s' "$body" | grep -qE '\\n0(\\n|")' && ! printf '%s' "$body" | grep -qF "$SECRET" \
    && ok "command cannot see EXECUTOR_SECRET" || bad "EXECUTOR_SECRET visible to commands: ${body:0:300}"
printf '%s' "$body" | grep -q 'Read-only file system' && ok "command cannot write to / (read-only rootfs)" || bad "command wrote to / or no read-only error: ${body:0:200}"

denied=0
while IFS='|' read -r method route data; do
    if [ -n "$data" ]; then
        c="$(http_code -X "$method" "$BASE$route" -H "Cookie: $USER_COOKIE" -H 'Content-Type: application/json' -d "$data")"
    else
        c="$(http_code -X "$method" "$BASE$route" -H "Cookie: $USER_COOKIE")"
    fi
    if [ "$c" = "403" ]; then denied=$((denied + 1)); else bad "non-admin: $method $route -> $c (want 403)"; fi
done <<'ROUTES'
POST|/api/workspace/run|{"command":"id"}
GET|/api/workspace/projects|
GET|/api/workspace/processes|
GET|/api/workspace/tree?path=|
GET|/api/workspace/file?path=ci.txt|
PUT|/api/workspace/file|{"path":"ci.txt","content":"x"}
POST|/api/workspace/kill|{"pid":1}
DELETE|/api/workspace/delete|{"path":"ci.txt"}
ROUTES
[ "$denied" = "8" ] && ok "non-admin: all 8 /api/workspace/* calls (7 routes) -> 403" || bad "non-admin: only $denied of 8 /api/workspace/* calls returned 403"
[ "$(http_code -H "Cookie: $USER_COOKIE" "$BASE/workspace")" = "404" ] && ok "non-admin: GET /workspace -> 404" || bad "non-admin: GET /workspace did not return 404"
[ "$(http_code "$BASE/api/workspace/projects")" = "401" ] && ok "no session: GET /api/workspace/projects -> 401" || bad "no session: /api/workspace/projects did not return 401"

# ------------------------------------------------------------------
# 4b. Control API key scopes (deny by default)
# ------------------------------------------------------------------
sha256_hex() { if command -v sha256sum >/dev/null; then printf '%s' "$1" | sha256sum | cut -d' ' -f1; else printf '%s' "$1" | shasum -a 256 | cut -d' ' -f1; fi; }
EMPTY_KEY="alr_live_$(openssl rand -hex 32 2>/dev/null || od -An -tx1 -N32 /dev/urandom | tr -d ' \n')"
SCOPED_KEY="alr_live_$(openssl rand -hex 32 2>/dev/null || od -An -tx1 -N32 /dev/urandom | tr -d ' \n')"
psql_q <<SQL >/dev/null
INSERT INTO control_api_keys (user_id, name, token_prefix, token_hash, scopes) VALUES
  ('${ADMIN_ID}', 'ci empty scopes',  '${EMPTY_KEY:0:24}',  '$(sha256_hex "$EMPTY_KEY")',  '{}'),
  ('${ADMIN_ID}', 'ci profile:read',  '${SCOPED_KEY:0:24}', '$(sha256_hex "$SCOPED_KEY")', '{profile:read}');
SQL
[ "$(http_code -H "Authorization: Bearer $EMPTY_KEY" "$BASE/api/v1/me")" = "403" ] && ok "API key with empty scopes: GET /api/v1/me -> 403" || bad "API key with empty scopes was not denied on GET /api/v1/me"
[ "$(http_code -H "Authorization: Bearer $SCOPED_KEY" "$BASE/api/v1/me")" = "200" ] && ok "API key with profile:read: GET /api/v1/me -> 200" || bad "API key with profile:read: GET /api/v1/me did not return 200"
[ "$(http_code -H "Authorization: Bearer $SCOPED_KEY" "$BASE/api/v1/tickets")" = "403" ] && ok "API key with profile:read: GET /api/v1/tickets -> 403" || bad "API key with profile:read was not denied on GET /api/v1/tickets"
[ "$(http_code -X POST "$BASE/api/v1/api-keys" -H "Cookie: $ADMIN_COOKIE" -H 'Content-Type: application/json' -d '{"name":"ci no scopes"}')" = "400" ] \
    && ok "admin: POST /api/v1/api-keys without scopes -> 400" || bad "admin: POST /api/v1/api-keys without scopes did not return 400"

# ------------------------------------------------------------------
# 5. Registration closed by default (real Next.js server actions)
# ------------------------------------------------------------------
reg_env="$(docker exec "${UNIT}-app" printenv ALLOW_REGISTRATION 2>/dev/null || true)"
[ "$reg_env" != "true" ] && ok "ALLOW_REGISTRATION is not 'true' in the app ('${reg_env}')" || bad "ALLOW_REGISTRATION=true in the app"
action_id() {
    docker exec "${UNIT}-app" node -e '
const n = require("/app/.next/server/server-reference-manifest.json").node || {};
for (const [id, e] of Object.entries(n)) {
  const w = (e.workers || {})["app/login/page"];
  if (w && w.exportedName === process.argv[1] && /actions\/auth/.test(w.filename || "")) { console.log(id); break; }
}' "$1" 2>/dev/null || true
}
call_action() {
    curl -s --max-time 30 -X POST "$BASE/login" -H "Next-Action: $1" -H 'Accept: text/x-component' \
        -H 'Content-Type: text/plain;charset=UTF-8' --data "$2" || true
}
first_run_id="$(action_id checkFirstRun)"; register_id="$(action_id register)"
if [ -n "$first_run_id" ] && [ -n "$register_id" ]; then
    out="$(call_action "$first_run_id" '[]')"
    printf '%s' "$out" | grep -q '"registrationOpen":false' && ok "checkFirstRun: registrationOpen=false (Create account hidden)" || bad "checkFirstRun did not report registrationOpen=false: ${out:0:200}"
    out="$(call_action "$register_id" '["ci-signup@ci.invalid","Password123!","CI Signup"]')"
    created="$(printf '%s\n' "SELECT count(*) FROM users WHERE email = 'ci-signup@ci.invalid';" | psql_q)"
    if printf '%s' "$out" | grep -q '"success":false' && [ "$created" = "0" ]; then ok "register server action refused; no user created"
    else bad "register server action: created=$created response=${out:0:200}"; fi
else
    skip "server action ids not found in the app's manifest (Next.js layout changed?); registration covered by Jest only"
fi

echo ""
echo "Result: $PASS passed, $FAIL failed, $SKIP skipped."
[ "$FAIL" -eq 0 ] || exit 1

#!/usr/bin/env bash
# Create a new Allerac Unit on this host: its own git worktree, pinned to its
# own long-lived branch (unit/<name>), and its own .env with fresh secrets and
# non-colliding host ports. Nothing is started and nothing is pushed.
#
#   scripts/units/new-unit.sh <name> --profile <profile> --hostname <host> [options]
#
# Options:
#   --profile P        openworld | sales | personal | all (required)
#   --hostname H       public hostname of the Unit, e.g. openworld.allerac.ai (required)
#   --branch B         git branch of the Unit (default unit/<name>)
#   --base REF         where a new branch starts (default origin/development)
#   --dir PATH         worktree path (default $ALLERAC_UNITS_DIR/<name>, i.e. ~/allerac-units/<name>)
#   --port-offset N    host ports = default port + N (default: lowest free N >= 1)
#   --full             full Unit (executor, monitoring, ...) instead of the lean public override
#   --with-ollama      keep the local Ollama (default for personal/all; public profiles
#                      default to no Ollama: a cloud provider, no model downloads)
#   --no-docker-check  skip the Docker project/volume check (tests, hosts without Docker)
#   --dry-run          print the plan and the generated .env (secrets masked); change nothing
#
# See docs/operations/multi-unit.md.
set -euo pipefail

die() { echo "error: $*" >&2; exit 1; }

REPO_DIR="${ALLERAC_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
UNITS_DIR="${ALLERAC_UNITS_DIR:-$HOME/allerac-units}"

NAME="${1:-}"
[ -n "$NAME" ] && [ "${NAME#-}" = "$NAME" ] || die "usage: new-unit.sh <name> --profile <profile> --hostname <host> [options]"
shift

PROFILE="" HOSTNAME_ARG="" BRANCH="" BASE="origin/development" DIR="" OFFSET="" FULL=0 DOCKER_CHECK=1 DRY_RUN=0 WITH_OLLAMA=
while [ $# -gt 0 ]; do
    case "$1" in
        --profile) PROFILE="${2:-}"; shift 2 ;;
        --hostname) HOSTNAME_ARG="${2:-}"; shift 2 ;;
        --branch) BRANCH="${2:-}"; shift 2 ;;
        --base) BASE="${2:-}"; shift 2 ;;
        --dir) DIR="${2:-}"; shift 2 ;;
        --port-offset) OFFSET="${2:-}"; shift 2 ;;
        --full) FULL=1; shift ;;
        --with-ollama) WITH_OLLAMA=1; shift ;;
        --no-docker-check) DOCKER_CHECK=0; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        *) die "unknown option: $1" ;;
    esac
done

# ── Validation ────────────────────────────────────────────────────────────────
[[ "$NAME" =~ ^[a-z0-9][a-z0-9_-]{0,30}$ ]] || die "invalid Unit name '$NAME' (lowercase letters, digits, '-', '_'; max 31 chars)"
# The primary Unit is 'allerac'; its scripts match containers by the 'allerac-' prefix.
case "$NAME" in allerac*) die "Unit names must not start with 'allerac' (reserved for the primary Unit)" ;; esac
case "$PROFILE" in openworld|sales|personal|all) ;; *) die "--profile must be one of: openworld, sales, personal, all" ;; esac
[[ "$HOSTNAME_ARG" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || die "--hostname must be a DNS name like openworld.allerac.ai"
BRANCH="${BRANCH:-unit/$NAME}"
if [ -z "$WITH_OLLAMA" ]; then
    case "$PROFILE" in openworld|sales) WITH_OLLAMA=0 ;; *) WITH_OLLAMA=1 ;; esac
fi
git -C "$REPO_DIR" check-ref-format --branch "$BRANCH" >/dev/null 2>&1 || die "invalid branch name '$BRANCH'"
DIR="${DIR:-$UNITS_DIR/$NAME}"
[ -e "$DIR" ] && die "$DIR already exists"
[ -f "$REPO_DIR/.env.unit.example" ] || die "$REPO_DIR/.env.unit.example not found"

# A Unit name must not be in use by any env file or Docker project on this host.
env_files() {
    local wt
    [ -f "$REPO_DIR/.env" ] && echo "$REPO_DIR/.env"
    for f in "$REPO_DIR"/.env.*; do
        case "$f" in *.example|*'.env.*') ;; *) [ -f "$f" ] && echo "$f" ;; esac
    done
    git -C "$REPO_DIR" worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p' | while read -r wt; do
        [ "$wt" != "$REPO_DIR" ] && [ -f "$wt/.env" ] && echo "$wt/.env"
    done
    return 0
}
env_value() { { grep -E "^$2=" "$1" 2>/dev/null || true; } | tail -n 1 | cut -d= -f2- | tr -d '"'"'"; }

while read -r f; do
    [ -n "$f" ] || continue
    unit="$(env_value "$f" ALLERAC_UNIT)"; unit="${unit:-allerac}"
    [ "$unit" = "$NAME" ] && die "Unit '$NAME' is already configured in $f"
done < <(env_files)

if [ "$DOCKER_CHECK" = 1 ]; then
    command -v docker >/dev/null 2>&1 || die "docker not found (use --no-docker-check to skip this check)"
    [ -z "$(docker ps -aq --filter "label=com.docker.compose.project=$NAME" 2>/dev/null)" ] \
        || die "a Docker Compose project named '$NAME' already exists"
    [ -z "$(docker volume ls -q --filter "name=^${NAME}_" 2>/dev/null)" ] \
        || die "Docker volumes named '${NAME}_*' already exist"
fi

if git -C "$REPO_DIR" worktree list --porcelain | grep -qx "branch refs/heads/$BRANCH"; then
    die "branch $BRANCH is already checked out in another worktree"
fi

# ── Ports ─────────────────────────────────────────────────────────────────────
# Every host port of the Unit is its default + offset, so Units never collide.
PORT_KEYS="APP_PORT:8080 OLLAMA_PORT:11434 DOCS_PORT:8000 N8N_PORT:5678 WEBHOOK_PORT:9999 NODE_EXPORTER_PORT:9100 PROMETHEUS_PORT:9090 LOKI_PORT:3100 PORTAINER_PORT:9000 GARMIN_WORKER_PORT:8787 CADDY_HTTP_PORT:8880 CADDY_HTTPS_PORT:8443"

used_ports() {
    local f k v
    while read -r f; do
        [ -n "$f" ] || continue
        for k in $PORT_KEYS; do
            v="$(env_value "$f" "${k%%:*}")"
            [ -n "$v" ] && echo "$v"
        done
        v="$(env_value "$f" EXECUTOR_DEV_PORT)"; [ -n "$v" ] && echo "$v"
        v="$(env_value "$f" EXECUTOR_DEV_PORT_RANGE)"
        if [[ "$v" =~ ^([0-9]+)-([0-9]+)$ ]]; then seq "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"; fi
    done < <(env_files)
    # Defaults of the primary Unit (its .env usually leaves them unset).
    for k in $PORT_KEYS; do echo "${k#*:}"; done
    echo 3000; seq 3002 3010
    if [ "${NEW_UNIT_SKIP_LISTEN_CHECK:-0}" != 1 ] && command -v ss >/dev/null 2>&1; then
        ss -ltnH 2>/dev/null | awk '{print $4}' | sed 's/.*://'
    fi
    return 0
}
USED=" $(used_ports | sort -un | tr '\n' ' ') "

ports_for_offset() {
    local n="$1" k
    for k in $PORT_KEYS; do echo "${k%%:*}=$(( ${k#*:} + n ))"; done
    echo "EXECUTOR_DEV_PORT=$(( 3000 + 20 * n ))"
    echo "EXECUTOR_DEV_PORT_RANGE=$(( 3002 + 20 * n ))-$(( 3010 + 20 * n ))"
}
offset_is_free() {
    local line port lo hi
    while read -r line; do
        port="${line#*=}"
        if [[ "$port" =~ ^([0-9]+)-([0-9]+)$ ]]; then lo="${BASH_REMATCH[1]}"; hi="${BASH_REMATCH[2]}"; else lo="$port"; hi="$port"; fi
        for ((p = lo; p <= hi; p++)); do
            [ "$p" -le 65535 ] || return 1
            case "$USED" in *" $p "*) return 1 ;; esac
        done
    done < <(ports_for_offset "$1")
    return 0
}

if [ -n "$OFFSET" ]; then
    [[ "$OFFSET" =~ ^[1-9][0-9]?$ ]] || die "--port-offset must be 1-99"
    offset_is_free "$OFFSET" || die "ports for offset $OFFSET are already used by another Unit or process"
else
    for n in $(seq 1 99); do offset_is_free "$n" && { OFFSET="$n"; break; }; done
    [ -n "$OFFSET" ] || die "no free port offset found"
fi

# ── .env ──────────────────────────────────────────────────────────────────────
secret() {
    if command -v openssl >/dev/null 2>&1; then openssl rand -hex "$1"
    else head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}

ENV_CONTENT="$(cat "$REPO_DIR/.env.unit.example")"
set_env() {
    local key="$1" value="$2"
    if printf '%s\n' "$ENV_CONTENT" | grep -qE "^#? ?${key}="; then
        ENV_CONTENT="$(printf '%s\n' "$ENV_CONTENT" | awk -v k="$key" -v v="$value" '
            !done && $0 ~ "^#? ?" k "=" { print k "=" v; done = 1; next } { print }')"
    else
        ENV_CONTENT="$(printf '%s\n%s=%s' "$ENV_CONTENT" "$key" "$value")"
    fi
}
drop_env() { ENV_CONTENT="$(printf '%s\n' "$ENV_CONTENT" | grep -vE "^$1=" || true)"; }

set_env ALLERAC_UNIT "$NAME"
set_env ALLERAC_ENV_FILE ".env"
set_env ALLERAC_PROFILE "$PROFILE"
set_env DEPLOY_BRANCH "$BRANCH"
COMPOSE_FILES="docker-compose.yml"
[ "$FULL" = 1 ] || COMPOSE_FILES="$COMPOSE_FILES:docker-compose.public.yml"
[ "$WITH_OLLAMA" = 1 ] || COMPOSE_FILES="$COMPOSE_FILES:docker-compose.no-ollama.yml"
if [ "$COMPOSE_FILES" = docker-compose.yml ]; then drop_env COMPOSE_FILE; else set_env COMPOSE_FILE "$COMPOSE_FILES"; fi
while read -r line; do set_env "${line%%=*}" "${line#*=}"; done < <(ports_for_offset "$OFFSET")
set_env APP_URL "https://$HOSTNAME_ARG"
set_env NEXT_PUBLIC_API_URL "https://$HOSTNAME_ARG"
set_env ENCRYPTION_KEY "$(secret 32)"
set_env TELEGRAM_TOKEN_ENCRYPTION_KEY "$(secret 32)"
set_env EXECUTOR_SECRET "$(secret 32)"
set_env POSTGRES_PASSWORD "$(secret 24)"
set_env N8N_ENCRYPTION_KEY "$(secret 32)"
set_env ALLOW_REGISTRATION false
if [ "$WITH_OLLAMA" = 0 ] || [ "$PROFILE" = openworld ] || [ "$PROFILE" = sales ]; then
    # No embedding backend, or nothing personal to embed in a public Unit.
    set_env MEMORY_INDEX_SWEEP_ENABLED false
    set_env NOTE_REINDEX_SWEEP_ENABLED false
fi
if [ "$WITH_OLLAMA" = 0 ]; then
    # Chat runs on a cloud provider: set the key here, or later in the Unit's
    # admin settings (Settings -> API keys), and pick the domain's model.
    set_env ANTHROPIC_API_KEY ""
fi

APP_PORT="$(ports_for_offset "$OFFSET" | sed -n 's/^APP_PORT=//p')"
masked() { printf '%s\n' "$ENV_CONTENT" | sed -E 's/^((ENCRYPTION_KEY|TELEGRAM_TOKEN_ENCRYPTION_KEY|EXECUTOR_SECRET|POSTGRES_PASSWORD|N8N_ENCRYPTION_KEY)=).+/\1<generated>/'; }

if git -C "$REPO_DIR" show-ref --verify --quiet "refs/heads/$BRANCH"; then
    BRANCH_PLAN="use the existing local branch $BRANCH"
elif git -C "$REPO_DIR" show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
    BRANCH_PLAN="track origin/$BRANCH"
else
    git -C "$REPO_DIR" rev-parse --verify --quiet "$BASE^{commit}" >/dev/null || die "base ref '$BASE' not found (git fetch first?)"
    BRANCH_PLAN="create $BRANCH from $BASE (local only; push it yourself)"
fi

echo "Unit:      $NAME (profile $PROFILE, $([ "$FULL" = 1 ] && echo full || echo lean public), $([ "$WITH_OLLAMA" = 1 ] && echo "local Ollama" || echo "no Ollama, cloud provider"))"
echo "Worktree:  $DIR"
echo "Branch:    $BRANCH_PLAN"
echo "Hostname:  https://$HOSTNAME_ARG -> http://localhost:$APP_PORT (port offset $OFFSET)"

if [ "$DRY_RUN" = 1 ]; then
    echo ""
    echo "--- .env (dry run, secrets masked) ---"
    masked
    exit 0
fi

# ── Create ────────────────────────────────────────────────────────────────────
mkdir -p "$(dirname "$DIR")"
if git -C "$REPO_DIR" show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git -C "$REPO_DIR" worktree add "$DIR" "$BRANCH"
elif git -C "$REPO_DIR" show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
    git -C "$REPO_DIR" worktree add --track -b "$BRANCH" "$DIR" "origin/$BRANCH"
else
    git -C "$REPO_DIR" worktree add -b "$BRANCH" "$DIR" "$BASE"
fi
( umask 077; printf '%s\n' "$ENV_CONTENT" > "$DIR/.env" )

cat <<NEXT

Created Unit '$NAME'. Next steps:
  1. Review $DIR/.env (back it up: it holds this Unit's only copy of its keys).
  2. Start it:     cd $DIR && docker compose up -d --build
  3. Check it:     curl -s http://localhost:$APP_PORT/api/v1/version
  4. Cloudflare Zero Trust -> your tunnel -> Public hostnames:
                   $HOSTNAME_ARG -> http://localhost:$APP_PORT
  5. Without Ollama: put the provider key in ANTHROPIC_API_KEY (or the Unit's
     admin settings) and choose the domain's model in Domains -> model.
  6. Move a public domain into it: scripts/units/export-domain.sh / import-domain.sh
  7. Publish the branch when ready: git -C $DIR push -u origin $BRANCH
NEXT

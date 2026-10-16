#!/usr/bin/env bash
# Tests for new-unit.sh against a throwaway git repository (no Docker needed).
#   bash scripts/units/new-unit.test.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_REPO="$(cd "$HERE/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
failures=0
ok()   { echo "ok   - $1"; }
fail() { echo "FAIL - $1"; failures=$((failures + 1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else fail "$1: expected '$2', got '$3'"; fi; }
refuses() { local name="$1"; shift; if run "$@" >/dev/null 2>&1; then fail "refuses $name"; else ok "refuses $name"; fi; }

REPO="$TMP/repo"
mkdir -p "$REPO/scripts/units/lib"
cp "$SRC_REPO/.env.unit.example" "$SRC_REPO/docker-compose.yml" "$REPO/"
cp "$HERE/new-unit.sh" "$REPO/scripts/units/"
git -C "$REPO" init -q -b development
git -C "$REPO" -c user.name=t -c user.email=t@t add -A
git -C "$REPO" -c user.name=t -c user.email=t@t commit -qm init
git -C "$REPO" update-ref refs/remotes/origin/development HEAD
printf 'APP_PORT=8080\n' > "$REPO/.env"

run() {
    ALLERAC_REPO_DIR="$REPO" ALLERAC_UNITS_DIR="$TMP/units" NEW_UNIT_SKIP_LISTEN_CHECK=1 \
        bash "$REPO/scripts/units/new-unit.sh" "$@" --no-docker-check
}
val() { grep -E "^$2=" "$1" | tail -n 1 | cut -d= -f2-; }

refuses "a name starting with allerac" allerac-web --profile sales --hostname a.example.com
refuses "an invalid name" "Open World" --profile sales --hostname a.example.com
refuses "an unknown profile" web --profile shop --hostname a.example.com
refuses "a bad hostname" web --profile sales --hostname "not a host"
refuses "a used port offset" web --profile sales --hostname a.example.com --port-offset 0

run openworld --profile openworld --hostname openworld.allerac.ai --dry-run > "$TMP/dry.txt"
check "dry run creates nothing" "no" "$([ -e "$TMP/units/openworld" ] && echo yes || echo no)"
grep -q "ENCRYPTION_KEY=<generated>" "$TMP/dry.txt" && ok "dry run masks secrets" || fail "dry run masks secrets"

run openworld --profile openworld --hostname openworld.allerac.ai > "$TMP/out.txt"
ENV1="$TMP/units/openworld/.env"
check "worktree on unit branch" "unit/openworld" "$(git -C "$TMP/units/openworld" rev-parse --abbrev-ref HEAD)"
check ".env is private" "600" "$(stat -c %a "$ENV1")"
check "update.sh pulls the Unit branch" "unit/openworld" "$(val "$ENV1" DEPLOY_BRANCH)"
check "Unit name" "openworld" "$(val "$ENV1" ALLERAC_UNIT)"
check "public Unit has no Ollama" "docker-compose.yml:docker-compose.public.yml:docker-compose.no-ollama.yml" "$(val "$ENV1" COMPOSE_FILE)"
check "first free offset" "8081" "$(val "$ENV1" APP_PORT)"
check "hostname" "https://openworld.allerac.ai" "$(val "$ENV1" APP_URL)"
check "sweeps off" "false" "$(val "$ENV1" MEMORY_INDEX_SWEEP_ENABLED)"
check "fresh 64-hex encryption key" "64" "$(val "$ENV1" ENCRYPTION_KEY | tr -d '\n' | wc -c | tr -d ' ')"
check "registration closed" "false" "$(val "$ENV1" ALLOW_REGISTRATION)"

refuses "a Unit name already in use" openworld --profile openworld --hostname x.example.com --dir "$TMP/other"

run alleracweb2 --profile sales --hostname alleracweb.allerac.ai >/dev/null 2>&1 && fail "names starting with allerac are reserved" || ok "names starting with allerac are reserved"
run web --profile sales --hostname alleracweb.allerac.ai --with-ollama > /dev/null
ENV2="$TMP/units/web/.env"
check "second Unit takes the next offset" "8082" "$(val "$ENV2" APP_PORT)"
check "--with-ollama keeps Ollama" "docker-compose.yml:docker-compose.public.yml" "$(val "$ENV2" COMPOSE_FILE)"
check "secrets differ between Units" "yes" "$([ "$(val "$ENV1" ENCRYPTION_KEY)" != "$(val "$ENV2" ENCRYPTION_KEY)" ] && echo yes || echo no)"
check "executor dev ports do not overlap" "3040|3042-3050" "$(val "$ENV2" EXECUTOR_DEV_PORT)|$(val "$ENV2" EXECUTOR_DEV_PORT_RANGE)"

run home2 --profile personal --hostname home2.example.com --full > /dev/null
check "personal full Unit keeps the default compose files" "" "$(val "$TMP/units/home2/.env" COMPOSE_FILE || true)"

echo ""
if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "all checks passed"

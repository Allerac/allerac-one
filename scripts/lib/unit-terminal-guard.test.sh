#!/usr/bin/env bash
# Tests for scripts/lib/unit-terminal-guard.sh. Run: bash scripts/lib/unit-terminal-guard.test.sh
# Also run by Jest (src/__tests__/scripts/unit-terminal-guard.test.ts).
set -euo pipefail

# shellcheck source=scripts/lib/unit-terminal-guard.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/unit-terminal-guard.sh"

failures=0
check() {
    local name="$1" expected="$2" actual="$3"
    if [ "$expected" = "$actual" ]; then
        echo "ok   - $name"
    else
        echo "FAIL - $name: expected '$expected', got '$actual'"
        failures=$((failures + 1))
    fi
}
# allowed | refused
verdict() { if allerac_terminal_profile_check "$@" >/dev/null; then echo allowed; else echo refused; fi; }

check "no terminal profile, public" allowed "$(verdict "local,webhook" "" "")"
check "empty profiles" allowed "$(verdict "" "" "")"
check "profile name only matches whole entries" allowed "$(verdict "terminals,myterminal" "" "")"
check "terminal on, UNIT_PUBLIC unset -> refused" refused "$(verdict "local,terminal" "" "")"
check "terminal on, UNIT_PUBLIC=true -> refused" refused "$(verdict "terminal" "true" "")"
check "terminal on, unknown UNIT_PUBLIC value -> refused" refused "$(verdict "terminal" "maybe" "")"
check "terminal on, UNIT_PUBLIC=false -> allowed" allowed "$(verdict "terminal" "false" "")"
check "UNIT_PUBLIC is case and space insensitive" allowed "$(verdict " local , terminal " " FALSE " "")"
check "UNIT_PUBLIC=0 / no / off -> allowed" "allowed allowed allowed" \
    "$(verdict terminal 0 "") $(verdict terminal no "") $(verdict terminal off "")"
check "lean Unit is public even with UNIT_PUBLIC=false" refused \
    "$(verdict "terminal" "false" "docker-compose.yml:docker-compose.public.yml")"
check "lean Unit with a path" refused "$(verdict "terminal" "false" "./docker-compose.yml:./docker-compose.public.yml")"
check "full Unit compose files with UNIT_PUBLIC=false" allowed "$(verdict "terminal" "false" "docker-compose.yml")"

msg="$(allerac_terminal_profile_check "terminal" "" "" || true)"
case "$msg" in *UNIT_PUBLIC=false*) check "message names UNIT_PUBLIC" ok ok ;; *) check "message names UNIT_PUBLIC" ok "$msg" ;; esac
msg="$(allerac_terminal_profile_check "terminal" "false" "docker-compose.yml:docker-compose.public.yml" || true)"
case "$msg" in *"lean Unit"*) check "lean Unit message" ok ok ;; *) check "lean Unit message" ok "$msg" ;; esac

check "caller IFS untouched" $' \t\n' "$IFS"

if [ "$failures" -gt 0 ]; then
    echo "$failures failure(s)"
    exit 1
fi
echo "all passed"

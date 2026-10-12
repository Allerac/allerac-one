#!/usr/bin/env bash
# Tests for scripts/lib/compose-profiles.sh. Run: bash scripts/lib/compose-profiles.test.sh
# Also run by Jest (src/__tests__/modules/compose-profiles-sync.test.ts).
set -euo pipefail

# shellcheck source=scripts/lib/compose-profiles.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/compose-profiles.sh"

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

# Module selection (mirrors resolveModuleSelection)
check "unset = all modules" "health,music,email,social,openworld,sales" "$(allerac_enabled_modules "" "")"
check "personal" "health,music,email,social" "$(allerac_enabled_modules personal "")"
check "profile is trimmed and case-insensitive" "openworld" "$(allerac_enabled_modules " OpenWorld " "")"
check "modules override profile" "music" "$(allerac_enabled_modules personal "music")"
check "blank modules = unset" "sales" "$(allerac_enabled_modules sales "  ")"
check "modules none" "" "$(allerac_enabled_modules personal none)"
check "modules all" "health,music,email,social,openworld,sales" "$(allerac_enabled_modules "" all)"
check "unknown module ignored" "health" "$(allerac_enabled_modules "" "robot, Health")"
check "unknown profile = all" "health,music,email,social,openworld,sales" "$(allerac_enabled_modules bogus "")"

# Module -> Compose profiles
check "personal -> health" "health" "$(allerac_module_compose_profiles personal "")"
check "default all -> health" "health" "$(allerac_module_compose_profiles "" "")"
check "openworld -> none" "" "$(allerac_module_compose_profiles openworld "")"
check "sales -> none" "" "$(allerac_module_compose_profiles sales "")"
check "list with health -> health" "health" "$(allerac_module_compose_profiles sales "music,health")"
check "list without health -> none" "" "$(allerac_module_compose_profiles personal "music,email")"

# Merge
check "merge dedupes and keeps order" "local,webhook,health" "$(allerac_merge_compose_profiles "local, webhook,," "health,local")"
check "merge empty" "" "$(allerac_merge_compose_profiles "" "")"

# Effective COMPOSE_PROFILES
check "file profiles merged with module profiles" "local,webhook,health" \
    "$(allerac_effective_compose_profiles 0 "" "local,webhook" personal "")"
check "health not duplicated" "health,local" "$(allerac_effective_compose_profiles 0 "" "health,local" personal "")"
check "explicit shell value wins" "local" "$(allerac_effective_compose_profiles 1 "local" "webhook" personal "")"
check "explicit empty shell value wins" "" "$(allerac_effective_compose_profiles 1 "" "webhook" personal "")"
check "openworld keeps file profiles only" "cloud" "$(allerac_effective_compose_profiles 0 "" "cloud" openworld "")"

# Works under the strict modes the callers use, with a caller-side IFS
check "caller IFS untouched" $' \t\n' "$IFS"

if [ "$failures" -gt 0 ]; then
    echo "$failures failure(s)"
    exit 1
fi
echo "all passed"

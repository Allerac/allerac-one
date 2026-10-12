#!/usr/bin/env bash
# Derive Docker Compose profiles from the Unit's module selection.
#
# Sourced by install.sh, update.sh and allerac.sh so that setting only
# ALLERAC_PROFILE (or ALLERAC_MODULES) is enough to start a module's services.
# Plain `docker compose up` does not run this: it still needs COMPOSE_PROFILES.
# See docs/operations/modules-and-profiles.md.
#
# These maps mirror the TypeScript source of truth and are kept in sync by
# src/__tests__/modules/compose-profiles-sync.test.ts:
#   - ALLERAC_PROFILE_MODULES  <-> ALLERAC_PROFILES in src/lib/runtime-config.ts
#   - ALLERAC_MODULE_COMPOSE_PROFILES <-> dockerProfile in src/modules/*/module.ts
#   - ALLERAC_ALL_MODULES <-> MODULES in src/modules/registry.ts

ALLERAC_ALL_MODULES="health,music,email,social,openworld,sales"

# profile=comma list of modules ("all" = every module)
ALLERAC_PROFILE_MODULES="all=all;personal=health,music,email,social;openworld=openworld;sales=sales"

# module=compose profile (only modules that have Docker services)
ALLERAC_MODULE_COMPOSE_PROFILES="health=health"

_allerac_lower_trim() {
    local v="$1"
    v="${v#"${v%%[![:space:]]*}"}"
    v="${v%"${v##*[![:space:]]}"}"
    printf '%s' "$v" | tr '[:upper:]' '[:lower:]'
}

# Lookup "key" in a "k=v;k=v" map. Prints the value; returns 1 when missing.
_allerac_map_get() {
    local key="$2" entry entries
    IFS=';' read -ra entries <<< "$1"
    for entry in "${entries[@]}"; do
        if [ "${entry%%=*}" = "$key" ]; then
            printf '%s' "${entry#*=}"
            return 0
        fi
    done
    return 1
}

# Merge comma lists, keeping first-seen order and dropping blanks/duplicates.
allerac_merge_compose_profiles() {
    local result="" list item items
    for list in "$@"; do
        IFS=',' read -ra items <<< "$list"
        for item in "${items[@]}"; do
            item="$(_allerac_lower_trim "$item")"
            [ -z "$item" ] && continue
            case ",$result," in *",$item,"*) continue ;; esac
            result="${result:+$result,}$item"
        done
    done
    printf '%s' "$result"
}

# Enabled modules for (ALLERAC_PROFILE, ALLERAC_MODULES), same rules as
# resolveModuleSelection: a non-blank ALLERAC_MODULES wins ("all"/"*", "none");
# otherwise the profile; unset or unknown profile = all modules.
allerac_enabled_modules() {
    local profile modules
    profile="$(_allerac_lower_trim "${1:-}")"
    modules="$(_allerac_lower_trim "${2:-}")"
    local list
    if [ -n "$modules" ]; then
        list="$modules"
    elif [ -n "$profile" ] && list="$(_allerac_map_get "$ALLERAC_PROFILE_MODULES" "$profile")"; then
        :
    else
        list="all"
    fi
    local result="" item items
    IFS=',' read -ra items <<< "$list"
    for item in "${items[@]}"; do
        item="$(_allerac_lower_trim "$item")"
        case "$item" in
            all|'*') result="$(allerac_merge_compose_profiles "$result" "$ALLERAC_ALL_MODULES")" ;;
            none|'') ;;
            *) case ",$ALLERAC_ALL_MODULES," in
                   *",$item,"*) result="$(allerac_merge_compose_profiles "$result" "$item")" ;;
               esac ;;
        esac
    done
    printf '%s' "$result"
}

# Compose profiles needed by the enabled modules.
allerac_module_compose_profiles() {
    local result="" module profile modules
    IFS=',' read -ra modules <<< "$(allerac_enabled_modules "${1:-}" "${2:-}")"
    for module in "${modules[@]}"; do
        if profile="$(_allerac_map_get "$ALLERAC_MODULE_COMPOSE_PROFILES" "$module")"; then
            result="$(allerac_merge_compose_profiles "$result" "$profile")"
        fi
    done
    printf '%s' "$result"
}

# Effective COMPOSE_PROFILES.
#   $1 "1" when COMPOSE_PROFILES is set in the calling shell (explicit: wins as is)
#   $2 that shell value
#   $3 COMPOSE_PROFILES from the Unit's env file (merged with module profiles)
#   $4 ALLERAC_PROFILE   $5 ALLERAC_MODULES
allerac_effective_compose_profiles() {
    if [ "${1:-0}" = "1" ]; then
        printf '%s' "${2:-}"
        return 0
    fi
    allerac_merge_compose_profiles "${3:-}" "$(allerac_module_compose_profiles "${4:-}" "${5:-}")"
}

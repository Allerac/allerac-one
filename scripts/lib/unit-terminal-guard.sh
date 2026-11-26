#!/usr/bin/env bash
# Guard for the Unit terminal Compose profile ("terminal"), sourced by
# install.sh, update.sh and allerac.sh. Tests: scripts/lib/unit-terminal-guard.test.sh
#
# The Unit terminal gives everyone granted access a shell-capable CLI session
# on the host's Docker network, so it is meant for private Units only (a local
# pilot). A Unit counts as public unless its env file explicitly says
# UNIT_PUBLIC=false:
#   - unset/empty/anything else -> public (the safe default: a Unit reachable
#     from the internet that never set the flag is refused, not trusted);
#   - a lean Unit (COMPOSE_FILE includes docker-compose.public.yml) is always
#     public, whatever UNIT_PUBLIC says.
# Do not set UNIT_PUBLIC=false on a Unit that is reachable from the internet
# (a public hostname, a tunnel or open ports).

# allerac_unit_is_public <UNIT_PUBLIC value> <COMPOSE_FILE value (colon separated)>
# Returns 0 when the Unit must be treated as public.
allerac_unit_is_public() {
    local flag="${1:-}" compose_files="${2:-}" file
    local IFS=':'
    for file in $compose_files; do
        case "$file" in
            docker-compose.public.yml|*/docker-compose.public.yml) return 0 ;;
        esac
    done
    flag="$(printf '%s' "$flag" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
    case "$flag" in
        false|0|no|off) return 1 ;;
        *) return 0 ;;
    esac
}

# allerac_terminal_profile_check <COMPOSE_PROFILES> <UNIT_PUBLIC> <COMPOSE_FILE>
# Returns 0 when the profiles are allowed. When the terminal profile is on in
# a public Unit, prints the reason on stdout and returns 1.
allerac_terminal_profile_check() {
    local profiles="${1:-}" unit_public="${2:-}" compose_files="${3:-}"
    profiles="$(printf '%s' "$profiles" | tr -d '[:space:]')"
    case ",${profiles}," in
        *,terminal,*) ;;
        *) return 0 ;;
    esac
    allerac_unit_is_public "$unit_public" "$compose_files" || return 0
    case ":${compose_files}:" in
        *docker-compose.public.yml*)
            printf '%s' "The terminal profile cannot be enabled on a lean Unit (COMPOSE_FILE includes docker-compose.public.yml). Remove 'terminal' from COMPOSE_PROFILES." ;;
        *)
            printf '%s' "The terminal profile is only allowed on a private Unit. This Unit is treated as public because UNIT_PUBLIC is not set to false in its env file. Remove 'terminal' from COMPOSE_PROFILES, or, only if this Unit is not reachable from the internet, set UNIT_PUBLIC=false. See infra/unit-terminal/README.md." ;;
    esac
    return 1
}

#!/usr/bin/env bash
# Shared helpers for scripts/units/*.sh: database connection and the skill
# fingerprint used to prove that skills were copied faithfully.

# Connection: --db-url URL (psql on this host) or --unit-dir DIR (the db
# container of the Unit whose checkout and .env live in DIR).
UNITS_DB_URL="${UNITS_DB_URL:-}"
UNITS_UNIT_DIR="${UNITS_UNIT_DIR:-}"

units_require_connection() {
    if [ -z "$UNITS_DB_URL" ] && [ -z "$UNITS_UNIT_DIR" ]; then
        echo "error: pass --db-url URL or --unit-dir DIR" >&2; exit 2
    fi
    if [ -n "$UNITS_DB_URL" ] && [ -n "$UNITS_UNIT_DIR" ]; then
        echo "error: pass only one of --db-url and --unit-dir" >&2; exit 2
    fi
    if [ -n "$UNITS_DB_URL" ]; then
        command -v psql >/dev/null 2>&1 || { echo "error: psql not found" >&2; exit 2; }
    else
        [ -f "$UNITS_UNIT_DIR/docker-compose.yml" ] || { echo "error: $UNITS_UNIT_DIR is not an Allerac checkout" >&2; exit 2; }
    fi
}

# Runs SQL from stdin. Output is unaligned tuples only, so callers can parse it.
units_psql() {
    if [ -n "$UNITS_DB_URL" ]; then
        psql "$UNITS_DB_URL" -X -q -At -v ON_ERROR_STOP=1
    else
        (cd "$UNITS_UNIT_DIR" && docker compose exec -T db sh -c \
            'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"')
    fi
}

# Everything that defines a skill's behaviour, plus its tool grants, hashed.
# Ids, owners, timestamps and counters are excluded on purpose: they differ
# between Units by design. Takes the skills alias as $1.
units_skill_fingerprint_sql() {
    local s="$1"
    cat <<SQL
md5(concat_ws(E'\x1f',
  ${s}.name, ${s}.display_name, ${s}.description, ${s}.content,
  coalesce(${s}.category, ''), coalesce(${s}.force_tool, ''),
  coalesce(${s}.auto_switch_rules::text, ''), coalesce(${s}.version, ''),
  coalesce(${s}.learning_enabled::text, ''), coalesce(${s}.memory_scope, ''),
  coalesce(${s}.rag_integration::text, ''), coalesce(${s}.is_system::text, ''),
  coalesce(${s}.source_file, ''),
  coalesce((SELECT string_agg(st.tool_name, ',' ORDER BY st.tool_name)
            FROM skill_tools st WHERE st.skill_id = ${s}.id), '')))
SQL
}

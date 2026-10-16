#!/usr/bin/env bash
# Export a public domain's bot from one Unit, so it can be moved into another
# Unit with import-domain.sh. Read-only on the source database.
#
#   scripts/units/export-domain.sh --domain openworld --account bot@example.com \
#       (--unit-dir ~/allerac-one | --db-url postgresql://...) [--out FILE] [--dry-run]
#
# Exported (JSON, one file):
#   - the service account (same id, email, password hash) and its non-secret
#     user settings;
#   - its domain access (by domain slug) and the domain row itself;
#   - its API keys (hash rows, not revoked), so existing widget keys keep working;
#   - the skills that define the bot: the domain's default skill, skills the
#     account owns or has enabled, each with its tool grants and a fingerprint;
#   - instructions (domain + learned), per-domain model settings and the
#     domain's rate-limit settings.
#
# NOT exported: conversation history, memories, documents, sessions, and every
# secret encrypted with the source Unit's keys (provider API keys, Telegram
# tokens). Re-enter those in the new Unit.
#
# --dry-run prints the summary without writing the file.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/db.sh"

DOMAIN="" ACCOUNT="" OUT="" DRY_RUN=0 ALLOW_ADMIN=0
while [ $# -gt 0 ]; do
    case "$1" in
        --domain) DOMAIN="${2:-}"; shift 2 ;;
        --account) ACCOUNT="${2:-}"; shift 2 ;;
        --unit-dir) UNITS_UNIT_DIR="${2:-}"; shift 2 ;;
        --db-url) UNITS_DB_URL="${2:-}"; shift 2 ;;
        --out) OUT="${2:-}"; shift 2 ;;
        --allow-admin) ALLOW_ADMIN=1; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        *) echo "error: unknown option $1" >&2; exit 2 ;;
    esac
done
[[ "$DOMAIN" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || { echo "error: --domain is required (a domain slug)" >&2; exit 2; }
[[ "$ACCOUNT" =~ ^[^[:space:]\'\\]+@[^[:space:]\'\\]+$ ]] || { echo "error: --account must be the service account's email" >&2; exit 2; }
units_require_connection
OUT="${OUT:-$DOMAIN-export-$(date +%Y%m%d-%H%M%S).json}"

FP="$(units_skill_fingerprint_sql s)"

# Preconditions first, with readable errors.
CHECK="$(units_psql <<SQL
\set email '$ACCOUNT'
\set domain '$DOMAIN'
SELECT coalesce((
  SELECT concat_ws('|', u.id, u.is_admin, u.is_active,
    EXISTS (SELECT 1 FROM user_domain_access a JOIN domains d ON d.id = a.domain_id
            WHERE a.user_id = u.id AND d.slug = :'domain'),
    (SELECT string_agg(d.slug, ',' ORDER BY d.slug) FROM user_domain_access a
       JOIN domains d ON d.id = a.domain_id WHERE a.user_id = u.id AND d.slug <> :'domain'))
  FROM users u WHERE lower(u.email) = lower(:'email')), 'missing');
SQL
)"
[ "$CHECK" != missing ] || { echo "error: no user with email $ACCOUNT" >&2; exit 1; }
IFS='|' read -r USER_ID IS_ADMIN IS_ACTIVE HAS_ACCESS OTHER_DOMAINS <<< "$CHECK"
if [ "$IS_ADMIN" = t ] && [ "$ALLOW_ADMIN" != 1 ]; then
    echo "error: $ACCOUNT is an admin. A public bot must run on a non-admin service account (--allow-admin to override)." >&2; exit 1
fi
[ "$HAS_ACCESS" = t ] || { echo "error: $ACCOUNT has no access to domain '$DOMAIN'" >&2; exit 1; }
[ -n "$OTHER_DOMAINS" ] && echo "warning: $ACCOUNT also has access to: $OTHER_DOMAINS (exported too)" >&2
[ "$IS_ACTIVE" = t ] || echo "warning: $ACCOUNT is not active" >&2

EXPORT_SQL="$(cat <<SQL
\set email '$ACCOUNT'
\set domain '$DOMAIN'
BEGIN TRANSACTION READ ONLY;
WITH u AS (SELECT * FROM users WHERE id = '$USER_ID'::uuid),
skill_ids AS (
  SELECT skill_id AS id FROM domain_skill_defaults WHERE domain_slug = :'domain' AND skill_id IS NOT NULL
  UNION SELECT skill_id FROM user_skills WHERE user_id = (SELECT id FROM u) AND skill_id IS NOT NULL
  UNION SELECT id FROM skills WHERE user_id = (SELECT id FROM u)
)
SELECT jsonb_pretty(jsonb_build_object(
  'format', 'allerac-domain-export/1',
  'exported_at', now(),
  'domain', :'domain',
  'user', (SELECT jsonb_build_object(
      'id', id, 'email', email, 'name', name, 'password_hash', password_hash,
      'password_hash_version', password_hash_version, 'is_admin', is_admin, 'is_active', is_active,
      'completed_onboarding_tour', completed_onboarding_tour, 'created_at', created_at) FROM u),
  'user_settings', (SELECT jsonb_build_object(
      'language', language, 'timezone', timezone, 'location', location, 'selected_model', selected_model,
      'system_message', system_message, 'onboarding_completed', onboarding_completed,
      'google_key_preference', google_key_preference, 'cli_domain_slug', cli_domain_slug, 'cli_model_id', cli_model_id,
      'encrypted_settings_not_copied', array_remove(ARRAY[
        CASE WHEN github_token IS NOT NULL THEN 'github_token' END,
        CASE WHEN tavily_api_key IS NOT NULL THEN 'tavily_api_key' END,
        CASE WHEN telegram_bot_token IS NOT NULL THEN 'telegram_bot_token' END,
        CASE WHEN google_api_key IS NOT NULL THEN 'google_api_key' END,
        CASE WHEN anthropic_api_key IS NOT NULL THEN 'anthropic_api_key' END,
        CASE WHEN openai_api_key IS NOT NULL THEN 'openai_api_key' END], NULL))
    FROM user_settings WHERE user_id = (SELECT id FROM u)),
  'domains', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'slug', d.slug, 'display_name', d.display_name, 'is_active', d.is_active, 'sort_order', d.sort_order)
      ORDER BY d.slug), '[]') FROM domains d
      WHERE d.slug = :'domain' OR d.id IN (SELECT domain_id FROM user_domain_access WHERE user_id = (SELECT id FROM u))),
  'domain_access', (SELECT coalesce(jsonb_agg(d.slug ORDER BY d.slug), '[]')
      FROM user_domain_access a JOIN domains d ON d.id = a.domain_id WHERE a.user_id = (SELECT id FROM u)),
  'api_keys', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'token_prefix', token_prefix, 'token_hash', token_hash, 'scopes', scopes,
      'expires_at', expires_at, 'created_at', created_at) ORDER BY created_at, id), '[]')
      FROM control_api_keys WHERE user_id = (SELECT id FROM u) AND revoked_at IS NULL),
  'model_settings', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'domain_slug', domain_slug, 'model_id', model_id, 'fallback_model_id', fallback_model_id,
      'temperature', temperature, 'max_tokens', max_tokens, 'local_only', local_only) ORDER BY domain_slug), '[]')
      FROM user_domain_model_settings WHERE user_id = (SELECT id FROM u)),
  'user_domain_instructions', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'domain_slug', domain_slug, 'content', content, 'revision', revision,
      'last_writer', last_writer, 'base_content', base_content, 'created_at', created_at, 'updated_at', updated_at)
      ORDER BY domain_slug), '[]')
      FROM user_domain_instructions WHERE user_id = (SELECT id FROM u)),
  'user_domain_instruction_versions', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'domain_slug', domain_slug, 'revision', revision, 'content', content, 'writer', writer,
      'created_at', created_at) ORDER BY domain_slug, revision), '[]')
      FROM user_domain_instruction_versions WHERE user_id = (SELECT id FROM u)),
  'domain_instructions', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'domain_slug', domain_slug, 'instruction', instruction, 'normalized_key', normalized_key,
      'source', source, 'status', status, 'evidence', evidence, 'created_at', created_at,
      'updated_at', updated_at, 'revoked_at', revoked_at) ORDER BY created_at, id), '[]')
      FROM domain_instructions WHERE user_id = (SELECT id FROM u)),
  'rate_limit', (SELECT jsonb_build_object(
      'domain_slug', domain_slug, 'daily_requests', daily_requests, 'daily_window_seconds', daily_window_seconds,
      'telegram_chat_id', telegram_chat_id, 'alert_thresholds_percent', alert_thresholds_percent,
      'telegram_bot_token_not_copied', telegram_bot_token IS NOT NULL)
      FROM domain_rate_limit_settings WHERE domain_slug = :'domain'),
  'skills', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'owned_by_account', s.user_id IS NOT DISTINCT FROM (SELECT id FROM u) AND s.user_id IS NOT NULL,
      'name', s.name, 'display_name', s.display_name, 'description', s.description, 'content', s.content,
      'category', s.category, 'learning_enabled', s.learning_enabled, 'memory_scope', s.memory_scope,
      'rag_integration', s.rag_integration, 'auto_switch_rules', s.auto_switch_rules, 'version', s.version,
      'license', s.license, 'verified', s.verified, 'shared', s.shared, 'force_tool', s.force_tool,
      'is_system', s.is_system, 'source_file', s.source_file,
      'tools', (SELECT coalesce(jsonb_agg(st.tool_name ORDER BY st.tool_name), '[]') FROM skill_tools st WHERE st.skill_id = s.id),
      'fingerprint', $FP) ORDER BY s.name, s.id), '[]')
      FROM skills s WHERE s.id IN (SELECT id FROM skill_ids)),
  'domain_skill_defaults', (SELECT coalesce(jsonb_agg(jsonb_build_object('domain_slug', domain_slug, 'skill_id', skill_id)), '[]')
      FROM domain_skill_defaults WHERE domain_slug = :'domain' AND skill_id IS NOT NULL),
  'user_skills', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'skill_id', skill_id, 'is_default', is_default, 'enabled', enabled, 'order_index', order_index)
      ORDER BY order_index, skill_id), '[]')
      FROM user_skills WHERE user_id = (SELECT id FROM u) AND skill_id IS NOT NULL)
));
COMMIT;
SQL
)"

JSON="$(printf '%s\n' "$EXPORT_SQL" | units_psql)"
[ -n "$JSON" ] || { echo "error: export returned nothing" >&2; exit 1; }

summary() {
    printf '%s' "$JSON" | node -e '
      let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
        const j = JSON.parse(s);
        console.log(`domain:            ${j.domain}`);
        console.log(`account:           ${j.user.email} (${j.user.id})`);
        console.log(`domain access:     ${j.domain_access.join(", ")}`);
        console.log(`api keys:          ${j.api_keys.length} (${j.api_keys.map(k => k.token_prefix).join(", ")})`);
        console.log(`skills:            ${j.skills.length}`);
        for (const k of j.skills) console.log(`  - ${k.name}${k.is_system ? " [system " + k.source_file + "]" : ""} tools=[${k.tools.join(",")}] fp=${k.fingerprint}`);
        console.log(`instructions:      ${j.user_domain_instructions.length} domain, ${j.domain_instructions.length} learned, ${j.user_domain_instruction_versions.length} versions`);
        console.log(`model settings:    ${j.model_settings.map(m => m.domain_slug + "=" + (m.model_id ?? "default")).join(", ") || "none"}`);
        console.log(`rate limit:        ${j.rate_limit ? (j.rate_limit.daily_requests ?? "default") + "/" + (j.rate_limit.daily_window_seconds ?? "default") + "s" : "none (global default)"}`);
        const notCopied = [...(j.user_settings?.encrypted_settings_not_copied ?? []), ...(j.rate_limit?.telegram_bot_token_not_copied ? ["rate-limit telegram_bot_token"] : [])];
        if (notCopied.length) console.log(`re-enter in target: ${notCopied.join(", ")}`);
      });'
}

if command -v node >/dev/null 2>&1; then summary; fi
if [ "$DRY_RUN" = 1 ]; then
    echo "(dry run: nothing written)"
    exit 0
fi
( umask 077; printf '%s\n' "$JSON" > "$OUT" )
echo "wrote $OUT"
echo "The file contains the account's password hash and API key hashes: keep it private and delete it after the import."

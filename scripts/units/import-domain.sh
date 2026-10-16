#!/usr/bin/env bash
# Import a domain bot exported by export-domain.sh into another Unit.
#
#   scripts/units/import-domain.sh FILE (--unit-dir ~/allerac-units/openworld | --db-url URL)
#       [--dry-run] [--verify-only]
#
# Run it after the target Unit's migrations have run (start the Unit once).
# Everything happens in one transaction and is verified before COMMIT:
#   - the service account keeps its id, email and password hash (non-admin);
#   - domain access is re-created by domain slug (domain ids differ per Unit);
#   - API key hash rows are copied as is, so existing keys keep working;
#   - skills are matched by source_file (system skills) or id, overwritten with
#     the exported definition and tool grants, and their ids remapped in
#     domain_skill_defaults and user_skills;
#   - instructions, model settings and rate-limit settings are copied;
#   - every skill's fingerprint (all behaviour fields + tool grants) must equal
#     the exported one, and every API key hash must be present, or nothing is
#     committed.
#
# --dry-run     run everything, print the report, then ROLLBACK.
# --verify-only change nothing; compare the target with the file. Run it again
#               after restarting the target app: the system skills loader
#               re-syncs system skills from that Unit's skills/*.md files, so a
#               mismatch then means the Unit branch's skill file differs from
#               the source Unit's database.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/db.sh"

FILE="" MODE=commit
while [ $# -gt 0 ]; do
    case "$1" in
        --unit-dir) UNITS_UNIT_DIR="${2:-}"; shift 2 ;;
        --db-url) UNITS_DB_URL="${2:-}"; shift 2 ;;
        --dry-run) MODE=dry-run; shift ;;
        --verify-only) MODE=verify; shift ;;
        -*) echo "error: unknown option $1" >&2; exit 2 ;;
        *) FILE="$1"; shift ;;
    esac
done
[ -f "$FILE" ] || { echo "error: export file not found: ${FILE:-<missing>}" >&2; exit 2; }
units_require_connection

B64="$(base64 < "$FILE" | tr -d '\n')"
FP="$(units_skill_fingerprint_sql s)"

# Verification shared by every mode. Raises on any mismatch.
VERIFY_SQL="$(cat <<SQL
DO \$verify\$
DECLARE
  doc jsonb := (SELECT doc FROM import_doc);
  uid uuid := (doc->'user'->>'id')::uuid;
  k jsonb; sk jsonb; tgt uuid; fp text; problems text[] := '{}'; n int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = uid AND lower(email) = lower(doc->'user'->>'email')) THEN
    problems := problems || format('account %s missing', doc->'user'->>'email');
  END IF;
  FOR k IN SELECT * FROM jsonb_array_elements(doc->'api_keys') LOOP
    IF NOT EXISTS (SELECT 1 FROM control_api_keys WHERE token_hash = k->>'token_hash' AND user_id = uid AND revoked_at IS NULL) THEN
      problems := problems || format('API key %s missing or revoked', k->>'token_prefix');
    END IF;
  END LOOP;
  FOR sk IN SELECT * FROM jsonb_array_elements(doc->'domain_access') LOOP
    IF NOT EXISTS (SELECT 1 FROM user_domain_access a JOIN domains d ON d.id = a.domain_id
                   WHERE a.user_id = uid AND d.slug = sk #>> '{}') THEN
      problems := problems || format('domain access %s missing', sk #>> '{}');
    END IF;
  END LOOP;
  FOR sk IN SELECT * FROM jsonb_array_elements(doc->'skills') LOOP
    tgt := NULL;
    -- File-backed system skills are identified by file name; every other skill
    -- (including migration-seeded system skills with fixed ids) by id.
    IF (sk->>'is_system')::boolean AND sk->>'source_file' IS NOT NULL THEN
      SELECT id INTO tgt FROM skills WHERE is_system = true AND source_file = sk->>'source_file';
    ELSE
      SELECT id INTO tgt FROM skills WHERE id = (sk->>'id')::uuid;
    END IF;
    IF tgt IS NULL THEN
      problems := problems || format('skill %s missing', sk->>'name');
      CONTINUE;
    END IF;
    SELECT $FP INTO fp FROM skills s WHERE s.id = tgt;
    IF fp IS DISTINCT FROM sk->>'fingerprint' THEN
      problems := problems || format('skill %s differs (target %s, export %s)', sk->>'name', fp, sk->>'fingerprint');
    ELSE
      n := n + 1;
    END IF;
  END LOOP;
  FOR sk IN SELECT * FROM jsonb_array_elements(doc->'domain_skill_defaults') LOOP
    IF NOT EXISTS (
      SELECT 1 FROM domain_skill_defaults dsd JOIN skills s ON s.id = dsd.skill_id
      JOIN jsonb_array_elements(doc->'skills') e ON (e->>'id')::uuid = (sk->>'skill_id')::uuid
      WHERE dsd.domain_slug = sk->>'domain_slug'
        AND (((e->>'is_system')::boolean AND e->>'source_file' IS NOT NULL AND s.is_system AND s.source_file = e->>'source_file')
             OR s.id = (e->>'id')::uuid)) THEN
      problems := problems || format('default skill of domain %s differs', sk->>'domain_slug');
    END IF;
  END LOOP;
  IF cardinality(problems) > 0 THEN
    RAISE EXCEPTION 'verification failed: %', array_to_string(problems, '; ');
  END IF;
  RAISE NOTICE 'verified: account, % API key(s), % domain access row(s), % skill(s) identical to the export',
    jsonb_array_length(doc->'api_keys'), jsonb_array_length(doc->'domain_access'), n;
END
\$verify\$;
SQL
)"

LOAD_SQL="$(cat <<SQL
\set b64 '$B64'
CREATE TEMP TABLE import_doc AS SELECT convert_from(decode(:'b64', 'base64'), 'UTF8')::jsonb AS doc;
DO \$check\$
BEGIN
  IF (SELECT doc->>'format' FROM import_doc) IS DISTINCT FROM 'allerac-domain-export/1' THEN
    RAISE EXCEPTION 'not an allerac-domain-export/1 file';
  END IF;
END
\$check\$;
SQL
)"

IMPORT_SQL="$(cat <<'SQL'
DO $import$
DECLARE
  doc jsonb := (SELECT doc FROM import_doc);
  u jsonb := doc->'user';
  uid uuid := (u->>'id')::uuid;
  r jsonb; tgt uuid; src uuid; owner uuid; existed boolean; action text;
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id = uid OR lower(email) = lower(u->>'email')) THEN
    RAISE EXCEPTION 'account % already exists in this Unit; nothing imported', u->>'email';
  END IF;
  IF EXISTS (SELECT 1 FROM control_api_keys k JOIN jsonb_array_elements(doc->'api_keys') e
             ON k.token_hash = e->>'token_hash' OR k.id = (e->>'id')::uuid) THEN
    RAISE EXCEPTION 'one of the API keys already exists in this Unit; nothing imported';
  END IF;

  -- Domains: created only when missing; an existing domain keeps its settings.
  FOR r IN SELECT * FROM jsonb_array_elements(doc->'domains') LOOP
    INSERT INTO domains (slug, display_name, is_active, sort_order)
    VALUES (r->>'slug', r->>'display_name', (r->>'is_active')::boolean, (r->>'sort_order')::int)
    ON CONFLICT (slug) DO NOTHING;
    IF FOUND THEN RAISE NOTICE 'domain %: created', r->>'slug'; END IF;
  END LOOP;

  INSERT INTO users (id, email, name, password_hash, password_hash_version, is_admin, is_active, completed_onboarding_tour, created_at)
  VALUES (uid, u->>'email', u->>'name', u->>'password_hash', (u->>'password_hash_version')::int,
          false, (u->>'is_active')::boolean, (u->>'completed_onboarding_tour')::boolean,
          (u->>'created_at')::timestamptz);
  -- A moved bot is a service account: never admin in the target, whatever the
  -- source (export --allow-admin only allows exporting such an account).
  IF coalesce((u->>'is_admin')::boolean, false) THEN
    RAISE NOTICE 'account %: created as NON-admin (it was admin in the source Unit; admin is never imported)', u->>'email';
  ELSE
    RAISE NOTICE 'account %: created (non-admin)', u->>'email';
  END IF;

  IF doc->'user_settings' IS NOT NULL AND jsonb_typeof(doc->'user_settings') = 'object' THEN
    r := doc->'user_settings';
    INSERT INTO user_settings (user_id, language, timezone, location, selected_model, system_message,
                               onboarding_completed, google_key_preference, cli_domain_slug, cli_model_id)
    VALUES (uid, r->>'language', r->>'timezone', r->>'location', r->>'selected_model', r->>'system_message',
            (r->>'onboarding_completed')::boolean, coalesce(r->>'google_key_preference', 'personal'),
            r->>'cli_domain_slug', r->>'cli_model_id');
    IF jsonb_array_length(coalesce(r->'encrypted_settings_not_copied', '[]')) > 0 THEN
      RAISE NOTICE 're-enter in this Unit (encrypted, not copied): %', r->'encrypted_settings_not_copied';
    END IF;
  END IF;

  -- Domain access by slug.
  FOR r IN SELECT * FROM jsonb_array_elements(doc->'domain_access') LOOP
    INSERT INTO user_domain_access (user_id, domain_id)
    SELECT uid, d.id FROM domains d WHERE d.slug = r #>> '{}';
    IF NOT FOUND THEN RAISE EXCEPTION 'domain % does not exist in this Unit', r #>> '{}'; END IF;
  END LOOP;

  INSERT INTO control_api_keys (id, user_id, name, token_prefix, token_hash, scopes, expires_at, created_at)
  SELECT (e->>'id')::uuid, uid, e->>'name', e->>'token_prefix', e->>'token_hash',
         ARRAY(SELECT jsonb_array_elements_text(e->'scopes')), (e->>'expires_at')::timestamptz,
         (e->>'created_at')::timestamptz
  FROM jsonb_array_elements(doc->'api_keys') e;
  RAISE NOTICE 'API keys: % copied', jsonb_array_length(doc->'api_keys');

  INSERT INTO user_domain_model_settings (user_id, domain_slug, model_id, fallback_model_id, temperature, max_tokens, local_only, created_at, updated_at)
  SELECT uid, e->>'domain_slug', e->>'model_id', e->>'fallback_model_id', (e->>'temperature')::numeric,
         (e->>'max_tokens')::int, coalesce((e->>'local_only')::boolean, false), NOW(), NOW()
  FROM jsonb_array_elements(doc->'model_settings') e;

  INSERT INTO user_domain_instructions (id, user_id, domain_slug, content, revision, last_writer, base_content, created_at, updated_at)
  SELECT (e->>'id')::uuid, uid, e->>'domain_slug', e->>'content', (e->>'revision')::bigint, e->>'last_writer',
         e->>'base_content', (e->>'created_at')::timestamptz, (e->>'updated_at')::timestamptz
  FROM jsonb_array_elements(doc->'user_domain_instructions') e;
  INSERT INTO user_domain_instruction_versions (id, user_id, domain_slug, revision, content, writer, created_at)
  SELECT (e->>'id')::uuid, uid, e->>'domain_slug', (e->>'revision')::bigint, e->>'content', e->>'writer',
         (e->>'created_at')::timestamptz
  FROM jsonb_array_elements(doc->'user_domain_instruction_versions') e;
  -- Learned instructions lose their link to conversations/memories (no history is copied).
  INSERT INTO domain_instructions (id, user_id, domain_slug, instruction, normalized_key, source, status, evidence, created_at, updated_at, revoked_at)
  SELECT (e->>'id')::uuid, uid, e->>'domain_slug', e->>'instruction', e->>'normalized_key', e->>'source',
         e->>'status', e->>'evidence', (e->>'created_at')::timestamptz, (e->>'updated_at')::timestamptz,
         (e->>'revoked_at')::timestamptz
  FROM jsonb_array_elements(doc->'domain_instructions') e;
  RAISE NOTICE 'instructions: % domain, % versions, % learned; model settings: %',
    jsonb_array_length(doc->'user_domain_instructions'), jsonb_array_length(doc->'user_domain_instruction_versions'),
    jsonb_array_length(doc->'domain_instructions'), jsonb_array_length(doc->'model_settings');

  IF jsonb_typeof(doc->'rate_limit') = 'object' THEN
    r := doc->'rate_limit';
    INSERT INTO domain_rate_limit_settings (domain_slug, daily_requests, daily_window_seconds, telegram_chat_id, alert_thresholds_percent)
    VALUES (r->>'domain_slug', (r->>'daily_requests')::int, (r->>'daily_window_seconds')::int, r->>'telegram_chat_id',
            ARRAY(SELECT jsonb_array_elements_text(r->'alert_thresholds_percent'))::int[])
    ON CONFLICT (domain_slug) DO UPDATE SET
      daily_requests = EXCLUDED.daily_requests, daily_window_seconds = EXCLUDED.daily_window_seconds,
      telegram_chat_id = EXCLUDED.telegram_chat_id, alert_thresholds_percent = EXCLUDED.alert_thresholds_percent,
      updated_at = NOW();
    RAISE NOTICE 'rate limit %: % per % s', r->>'domain_slug', coalesce(r->>'daily_requests', 'default'), coalesce(r->>'daily_window_seconds', 'default');
    IF (r->>'telegram_bot_token_not_copied')::boolean THEN
      RAISE NOTICE 're-enter the rate-limit alert Telegram bot token in this Unit (encrypted, not copied)';
    END IF;
  END IF;

  -- Skills: overwrite the target definition with the exported one, remap ids.
  CREATE TEMP TABLE skill_map (src uuid PRIMARY KEY, tgt uuid NOT NULL) ON COMMIT DROP;
  FOR r IN SELECT * FROM jsonb_array_elements(doc->'skills') LOOP
    src := (r->>'id')::uuid;
    tgt := NULL;
    IF (r->>'is_system')::boolean AND r->>'source_file' IS NOT NULL THEN
      SELECT id INTO tgt FROM skills WHERE is_system = true AND source_file = r->>'source_file';
    ELSE
      SELECT id INTO tgt FROM skills WHERE id = src;
    END IF;
    owner := CASE WHEN (r->>'owned_by_account')::boolean THEN uid END;
    existed := tgt IS NOT NULL;
    IF NOT existed THEN
      tgt := CASE WHEN EXISTS (SELECT 1 FROM skills WHERE id = src) THEN gen_random_uuid() ELSE src END;
      INSERT INTO skills (id, user_id, name, display_name, description, content, category, learning_enabled,
                          memory_scope, rag_integration, auto_switch_rules, version, license, verified, shared,
                          force_tool, is_system, source_file)
      VALUES (tgt, owner, r->>'name', r->>'display_name', r->>'description', r->>'content', r->>'category',
              (r->>'learning_enabled')::boolean, r->>'memory_scope', (r->>'rag_integration')::boolean,
              CASE WHEN jsonb_typeof(r->'auto_switch_rules') = 'null' THEN NULL ELSE r->'auto_switch_rules' END,
              r->>'version', r->>'license', (r->>'verified')::boolean, (r->>'shared')::boolean,
              r->>'force_tool', coalesce((r->>'is_system')::boolean, false), r->>'source_file');
      action := 'created';
    ELSE
      SELECT CASE WHEN md5(concat_ws(E'\x1f', s.name, s.display_name, s.description, s.content)) =
                       md5(concat_ws(E'\x1f', r->>'name', r->>'display_name', r->>'description', r->>'content'))
                  THEN 'updated' ELSE 'replaced (target text differed)' END
        INTO action FROM skills s WHERE s.id = tgt;
      UPDATE skills SET
        name = r->>'name', display_name = r->>'display_name', description = r->>'description',
        content = r->>'content', category = r->>'category', learning_enabled = (r->>'learning_enabled')::boolean,
        memory_scope = r->>'memory_scope', rag_integration = (r->>'rag_integration')::boolean,
        auto_switch_rules = CASE WHEN jsonb_typeof(r->'auto_switch_rules') = 'null' THEN NULL ELSE r->'auto_switch_rules' END,
        version = r->>'version', force_tool = r->>'force_tool', updated_at = NOW()
      WHERE id = tgt;
    END IF;
    DELETE FROM skill_tools WHERE skill_id = tgt;
    INSERT INTO skill_tools (skill_id, tool_name)
    SELECT tgt, t FROM jsonb_array_elements_text(r->'tools') t;
    INSERT INTO skill_map VALUES (src, tgt);
    RAISE NOTICE 'skill %: % (% tool grant(s))', r->>'name', action, jsonb_array_length(r->'tools');
    IF (r->>'is_system')::boolean AND r->>'source_file' IS NOT NULL AND existed AND action <> 'updated' THEN
      RAISE NOTICE '  % is a system skill: commit the exported text to this Unit branch''s skills/%, or the loader restores the file version on the next app start', r->>'name', r->>'source_file';
    END IF;
    IF NOT (r->>'is_system')::boolean AND owner IS NULL AND NOT existed THEN
      RAISE NOTICE '  % belonged to another account in the source Unit; imported without an owner', r->>'name';
    END IF;
  END LOOP;

  INSERT INTO domain_skill_defaults (domain_slug, skill_id)
  SELECT e->>'domain_slug', m.tgt FROM jsonb_array_elements(doc->'domain_skill_defaults') e
  JOIN skill_map m ON m.src = (e->>'skill_id')::uuid
  ON CONFLICT (domain_slug) DO UPDATE SET skill_id = EXCLUDED.skill_id, updated_at = NOW();

  INSERT INTO user_skills (user_id, skill_id, is_default, enabled, order_index)
  SELECT uid, m.tgt, (e->>'is_default')::boolean, (e->>'enabled')::boolean, (e->>'order_index')::int
  FROM jsonb_array_elements(doc->'user_skills') e
  JOIN skill_map m ON m.src = (e->>'skill_id')::uuid;
END
$import$;
SQL
)"

case "$MODE" in
    verify) SCRIPT="$LOAD_SQL
$VERIFY_SQL" ;;
    dry-run) SCRIPT="BEGIN;
$LOAD_SQL
$IMPORT_SQL
$VERIFY_SQL
ROLLBACK;" ;;
    commit) SCRIPT="BEGIN;
$LOAD_SQL
$IMPORT_SQL
$VERIFY_SQL
COMMIT;" ;;
esac

# NOTICE lines are the report; strip psql's prefixes. Exit with psql's status.
set +e
printf '%s\n' "$SCRIPT" | units_psql 2>&1 \
    | sed -E 's/^(psql:[^ ]+ )?(NOTICE|INFO):  /  /; s/^(psql:[^ ]+ )?ERROR:  /error: /'
status=${PIPESTATUS[1]}
set -e
if [ "$status" -ne 0 ]; then
    echo "import failed: nothing was changed" >&2
    exit "$status"
fi
case "$MODE" in
    dry-run) echo "(dry run: rolled back, nothing was changed)" ;;
    commit) echo "imported and verified. Restart the Unit's app, then run again with --verify-only." ;;
esac

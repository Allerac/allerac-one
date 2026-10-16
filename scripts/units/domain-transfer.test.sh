#!/usr/bin/env bash
# End-to-end test for export-domain.sh / import-domain.sh against a real
# PostgreSQL. Needs a server where it may create databases and a template
# database on which all migrations have run:
#
#   UNITS_TEST_PG=postgresql://postgres@127.0.0.1:5432 \
#   UNITS_TEST_TEMPLATE=allerac_migrated \
#   bash scripts/units/domain-transfer.test.sh
#
# It creates two throwaway databases (source and target Unit), seeds a public
# bot in the source, moves it, and checks that skills, tool grants, API key
# hashes, instructions and settings arrive identical, that secrets and history
# do not, and that the safety checks hold.
set -euo pipefail

: "${UNITS_TEST_PG:?set UNITS_TEST_PG to a postgres server URL (without database)}"
: "${UNITS_TEST_TEMPLATE:?set UNITS_TEST_TEMPLATE to a migrated database name}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUFFIX="$$"
SRC_DB="units_test_src_$SUFFIX"; DST_DB="units_test_dst_$SUFFIX"
SRC="$UNITS_TEST_PG/$SRC_DB"; DST="$UNITS_TEST_PG/$DST_DB"
TMP="$(mktemp -d)"
export UNITS_DB_URL=""

failures=0
ok()   { echo "ok   - $1"; }
fail() { echo "FAIL - $1"; failures=$((failures + 1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else fail "$1: expected '$2', got '$3'"; fi; }
q() { psql "$1" -X -q -At -v ON_ERROR_STOP=1 -c "$2"; }

cleanup() {
    psql "$UNITS_TEST_PG/postgres" -X -q -c "DROP DATABASE IF EXISTS $SRC_DB" -c "DROP DATABASE IF EXISTS $DST_DB" >/dev/null 2>&1 || true
    rm -rf "$TMP"
}
trap cleanup EXIT

psql "$UNITS_TEST_PG/postgres" -X -q -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE $SRC_DB TEMPLATE $UNITS_TEST_TEMPLATE" \
    -c "CREATE DATABASE $DST_DB TEMPLATE $UNITS_TEST_TEMPLATE" >/dev/null

SVC=11111111-1111-4111-8111-111111111111
ADMIN=22222222-2222-4222-8222-222222222222
SYS_SRC=33333333-3333-4333-8333-333333333333
SYS_DST=44444444-4444-4444-8444-444444444444
CUSTOM=55555555-5555-4555-8555-555555555555

# ── Seed the source Unit ──────────────────────────────────────────────────────
psql "$SRC" -X -q -v ON_ERROR_STOP=1 <<SQL
INSERT INTO users (id, email, name, password_hash, password_hash_version, is_admin, is_active)
VALUES ('$SVC', 'bot@openworld.test', 'OpenWorld Bot', '\$2b\$12\$hashhashhash', 2, false, true),
       ('$ADMIN', 'admin@example.test', 'Admin', 'x', 2, true, true);
INSERT INTO user_domain_access (user_id, domain_id) SELECT '$SVC', id FROM domains WHERE slug = 'openworld';
INSERT INTO user_settings (user_id, language, timezone, anthropic_api_key, google_key_preference)
VALUES ('$SVC', 'pt', 'America/Sao_Paulo', 'ENCRYPTED-ANTHROPIC-SECRET', 'personal');
INSERT INTO control_api_keys (id, user_id, name, token_prefix, token_hash, scopes)
VALUES (gen_random_uuid(), '$SVC', 'widget', 'alr_live_ab', repeat('a', 64), ARRAY['chat:write','chat:read']);
INSERT INTO control_api_keys (id, user_id, name, token_prefix, token_hash, scopes, revoked_at)
VALUES (gen_random_uuid(), '$SVC', 'old', 'alr_live_cd', repeat('c', 64), ARRAY['chat:write'], NOW());
-- File-backed system skill, edited in the DB after the last loader sync.
INSERT INTO skills (id, user_id, name, display_name, description, content, category, is_system, source_file, verified, shared, version, auto_switch_rules)
VALUES ('$SYS_SRC', NULL, 'openworld', 'OpenWorld', 'FAQ bot', E'You are OpenWorld''s FAQ assistant.\nAnswer in Portuguese.\n', 'general', true, 'openworld.md', true, true, '1.2.0', '{"keywords": ["importação", "frete"]}');
INSERT INTO skill_tools (skill_id, tool_name) VALUES ('$SYS_SRC', 'search_web');
INSERT INTO domain_skill_defaults (domain_slug, skill_id) VALUES ('openworld', '$SYS_SRC')
  ON CONFLICT (domain_slug) DO UPDATE SET skill_id = EXCLUDED.skill_id;
-- A custom skill owned by the bot account, and a migration-seeded system skill it enabled.
INSERT INTO skills (id, user_id, name, display_name, description, content, category, force_tool)
VALUES ('$CUSTOM', '$SVC', 'faq-pricing', 'FAQ pricing', 'Pricing answers', 'Quote only public prices.', 'sales', 'search_web');
INSERT INTO skill_tools (skill_id, tool_name) VALUES ('$CUSTOM', 'search_web'), ('$CUSTOM', 'get_today_info');
INSERT INTO user_skills (user_id, skill_id, is_default, enabled, order_index)
VALUES ('$SVC', '$CUSTOM', false, true, 1),
       ('$SVC', (SELECT id FROM skills WHERE name = 'learn' AND is_system LIMIT 1), false, true, 2);
INSERT INTO user_domain_model_settings (user_id, domain_slug, model_id, fallback_model_id, temperature, max_tokens, local_only)
VALUES ('$SVC', 'openworld', 'claude-haiku-4-5', NULL, 0.3, 1024, false);
INSERT INTO user_domain_instructions (user_id, domain_slug, content, revision, last_writer, base_content)
VALUES ('$SVC', 'openworld', 'Always mention the WhatsApp contact.', 3, 'user', 'Always mention the WhatsApp contact.');
INSERT INTO user_domain_instruction_versions (user_id, domain_slug, revision, content, writer)
VALUES ('$SVC', 'openworld', 3, 'Always mention the WhatsApp contact.', 'user');
INSERT INTO chat_conversations (id, user_id, title, domain_slug) VALUES ('66666666-6666-4666-8666-666666666666', '$SVC', 'visitor chat', 'openworld');
INSERT INTO domain_instructions (user_id, domain_slug, instruction, normalized_key, source, status, source_conversation_id)
VALUES ('$SVC', 'openworld', 'Prefer short answers.', 'prefer short answers', 'explicit', 'active', '66666666-6666-4666-8666-666666666666');
INSERT INTO domain_rate_limit_settings (domain_slug, daily_requests, daily_window_seconds, telegram_bot_token, telegram_chat_id, alert_thresholds_percent)
VALUES ('openworld', 500, 86400, 'ENCRYPTED-TELEGRAM-SECRET', '12345', '{50,80,95}');
SQL

# ── Target Unit: the loader already synced its own skills/openworld.md ───────
psql "$DST" -X -q -v ON_ERROR_STOP=1 <<SQL
INSERT INTO skills (id, user_id, name, display_name, description, content, category, is_system, source_file, verified, shared, version)
VALUES ('$SYS_DST', NULL, 'openworld', 'OpenWorld', 'FAQ bot', 'Old file content.', 'general', true, 'openworld.md', true, true, '1.0.0');
INSERT INTO domain_skill_defaults (domain_slug, skill_id) VALUES ('openworld', '$SYS_DST')
  ON CONFLICT (domain_slug) DO UPDATE SET skill_id = EXCLUDED.skill_id;
SQL

# ── Export ────────────────────────────────────────────────────────────────────
if bash "$HERE/export-domain.sh" --domain openworld --account admin@example.test --db-url "$SRC" --out "$TMP/x.json" >/dev/null 2>&1; then
    fail "export refuses an admin account"; else ok "export refuses an admin account"; fi
if bash "$HERE/export-domain.sh" --domain sales --account bot@openworld.test --db-url "$SRC" --out "$TMP/x.json" >/dev/null 2>&1; then
    fail "export refuses a domain the account cannot access"; else ok "export refuses a domain the account cannot access"; fi
bash "$HERE/export-domain.sh" --domain openworld --account bot@openworld.test --db-url "$SRC" --dry-run > "$TMP/dry.txt"
check "export dry run writes nothing" "0" "$(ls "$TMP"/*.json 2>/dev/null | wc -l | tr -d ' ')"
bash "$HERE/export-domain.sh" --domain openworld --account bot@openworld.test --db-url "$SRC" --out "$TMP/openworld.json" > "$TMP/export.txt"
EXPORT="$TMP/openworld.json"
check "export file is private" "600" "$(stat -c %a "$EXPORT")"
check "export has no encrypted secrets" "0" "$(grep -c 'ENCRYPTED-' "$EXPORT" || true)"
check "export has no conversation ids" "0" "$(grep -c '66666666-6666' "$EXPORT" || true)"
check "export keeps only active API keys" "1" "$(grep -c '"token_hash"' "$EXPORT")"
check "export lists three skills" "3" "$(grep -c '"fingerprint"' "$EXPORT")"

# ── Import ────────────────────────────────────────────────────────────────────
bash "$HERE/import-domain.sh" "$EXPORT" --db-url "$DST" --dry-run > "$TMP/import-dry.txt" 2>&1 \
    && ok "import dry run succeeds" || { fail "import dry run succeeds"; cat "$TMP/import-dry.txt"; }
check "dry run changes nothing" "0" "$(q "$DST" "SELECT count(*) FROM users WHERE id = '$SVC'")"
check "dry run leaves the target skill alone" "Old file content." "$(q "$DST" "SELECT content FROM skills WHERE id = '$SYS_DST'")"

bash "$HERE/import-domain.sh" "$EXPORT" --db-url "$DST" > "$TMP/import.txt" 2>&1 \
    && ok "import succeeds" || { fail "import succeeds"; cat "$TMP/import.txt"; }
grep -q "verified: account, 1 API key(s), 1 domain access row(s), 3 skill(s)" "$TMP/import.txt" \
    && ok "import reports verification" || fail "import reports verification"
grep -q "commit the exported text to this Unit branch's skills/openworld.md" "$TMP/import.txt" \
    && ok "import warns that the system skill file differs" || fail "import warns that the system skill file differs"

bash "$HERE/import-domain.sh" "$EXPORT" --db-url "$DST" --verify-only > "$TMP/verify.txt" 2>&1 \
    && ok "verify-only passes after import" || { fail "verify-only passes after import"; cat "$TMP/verify.txt"; }

# Independent comparison of everything that defines behaviour.
FP="$(. "$HERE/lib/db.sh"; units_skill_fingerprint_sql s)"
SKILLS_SQL="SELECT string_agg(s.name || '=' || $FP, ',' ORDER BY s.name) FROM skills s WHERE s.name IN ('openworld', 'faq-pricing', 'learn')"
check "skills and tool grants are identical" "$(q "$SRC" "$SKILLS_SQL")" "$(q "$DST" "$SKILLS_SQL")"
check "system skill matched by file, not duplicated" "1" "$(q "$DST" "SELECT count(*) FROM skills WHERE source_file = 'openworld.md'")"
check "domain default points at the imported skill" "$SYS_DST" "$(q "$DST" "SELECT skill_id FROM domain_skill_defaults WHERE domain_slug = 'openworld'")"
check "custom skill keeps id and owner" "$SVC" "$(q "$DST" "SELECT user_id FROM skills WHERE id = '$CUSTOM'")"
check "enabled skills of the account" "faq-pricing,learn" "$(q "$DST" "SELECT string_agg(s.name, ',' ORDER BY s.name) FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = '$SVC'")"
KEY_SQL="SELECT string_agg(token_hash || ':' || token_prefix || ':' || array_to_string(scopes, '+'), ',') FROM control_api_keys WHERE user_id = '$SVC' AND revoked_at IS NULL"
check "API key hash rows are identical" "$(q "$SRC" "$KEY_SQL")" "$(q "$DST" "$KEY_SQL")"
USER_SQL="SELECT concat_ws('|', id, email, password_hash, password_hash_version, is_admin) FROM users WHERE id = '$SVC'"
check "account is identical (id, email, password hash)" "$(q "$SRC" "$USER_SQL")" "$(q "$DST" "$USER_SQL")"
check "domain access remapped by slug" "openworld" "$(q "$DST" "SELECT string_agg(d.slug, ',') FROM user_domain_access a JOIN domains d ON d.id = a.domain_id WHERE a.user_id = '$SVC'")"
MODEL_SQL="SELECT concat_ws('|', domain_slug, model_id, temperature, max_tokens, local_only) FROM user_domain_model_settings WHERE user_id = '$SVC'"
check "model settings are identical" "$(q "$SRC" "$MODEL_SQL")" "$(q "$DST" "$MODEL_SQL")"
INSTR_SQL="SELECT concat_ws('|', (SELECT content || revision FROM user_domain_instructions WHERE user_id = '$SVC'), (SELECT string_agg(content, ',') FROM user_domain_instruction_versions WHERE user_id = '$SVC'), (SELECT string_agg(instruction || status, ',') FROM domain_instructions WHERE user_id = '$SVC'))"
check "instructions are identical" "$(q "$SRC" "$INSTR_SQL")" "$(q "$DST" "$INSTR_SQL")"
check "learned instruction lost its conversation link" "" "$(q "$DST" "SELECT source_conversation_id FROM domain_instructions WHERE user_id = '$SVC'")"
check "rate limit copied without its token" "500|86400|12345|{50,80,95}|" "$(q "$DST" "SELECT concat_ws('|', daily_requests, daily_window_seconds, telegram_chat_id, alert_thresholds_percent, coalesce(telegram_bot_token, '')) FROM domain_rate_limit_settings WHERE domain_slug = 'openworld'")"
check "settings copied without the provider key" "pt|America/Sao_Paulo|" "$(q "$DST" "SELECT concat_ws('|', language, timezone, coalesce(anthropic_api_key, '')) FROM user_settings WHERE user_id = '$SVC'")"
check "no conversation history" "0" "$(q "$DST" "SELECT count(*) FROM chat_conversations WHERE user_id = '$SVC'")"

# ── Safety checks ─────────────────────────────────────────────────────────────
if bash "$HERE/import-domain.sh" "$EXPORT" --db-url "$DST" > "$TMP/again.txt" 2>&1; then
    fail "a second import is refused"
else
    grep -q "already exists" "$TMP/again.txt" && ok "a second import is refused" || fail "a second import is refused (wrong error)"
fi
q "$DST" "UPDATE skills SET content = content || ' (edited)' WHERE id = '$CUSTOM'" >/dev/null
if bash "$HERE/import-domain.sh" "$EXPORT" --db-url "$DST" --verify-only > "$TMP/drift.txt" 2>&1; then
    fail "verify-only detects a changed skill"
else
    grep -q "skill faq-pricing differs" "$TMP/drift.txt" && ok "verify-only detects a changed skill" || fail "verify-only detects a changed skill (wrong error)"
fi
q "$DST" "DELETE FROM skill_tools WHERE skill_id = '$SYS_DST' AND tool_name = 'search_web'" >/dev/null
bash "$HERE/import-domain.sh" "$EXPORT" --db-url "$DST" --verify-only > "$TMP/drift2.txt" 2>&1 || true
grep -q "skill openworld differs" "$TMP/drift2.txt" && ok "verify-only detects a removed tool grant" || fail "verify-only detects a removed tool grant"

echo ""
if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "all checks passed"

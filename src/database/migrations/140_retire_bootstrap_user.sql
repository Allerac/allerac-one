-- Retire the legacy bootstrap account 'dev@local.host'.
--
-- init.sql used to insert it (no password, id 00000000-...-000) and migration
-- 034 then set is_admin = true on every existing user, so every install has an
-- admin account nobody created. It cannot sign in (no password, no Google id),
-- but it shows up as an admin and is copied into every new Unit.
--
-- New databases no longer get it. Existing ones: delete it when it owns
-- nothing; otherwise keep the row (its data stays reachable for an admin) but
-- make it a disabled non-admin with no sessions. Idempotent.
DO $$
DECLARE
  bootstrap CONSTANT uuid := '00000000-0000-0000-0000-000000000000';
  owned bigint := 0;
  n bigint;
  r record;
  -- Rows created automatically for every user, not data it owns.
  auto_tables CONSTANT regclass[] := ARRAY['user_sessions'::regclass] ||
    CASE WHEN to_regclass('credit_accounts') IS NULL THEN ARRAY[]::regclass[]
         ELSE ARRAY[to_regclass('credit_accounts')] END;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = bootstrap AND email = 'dev@local.host') THEN
    RETURN;
  END IF;

  -- Count rows in every table that references users(id), except auto rows.
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass
      AND NOT (c.conrelid = ANY (auto_tables))
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', r.tbl, r.col) INTO n USING bootstrap;
    owned := owned + n;
  END LOOP;

  IF owned = 0 THEN
    DELETE FROM user_sessions WHERE user_id = bootstrap;
    IF to_regclass('credit_accounts') IS NOT NULL THEN
      EXECUTE 'DELETE FROM credit_accounts WHERE user_id = $1' USING bootstrap;
    END IF;
    DELETE FROM users WHERE id = bootstrap;
  ELSE
    UPDATE users SET is_admin = false, is_active = false, password_hash = NULL WHERE id = bootstrap;
    DELETE FROM user_sessions WHERE user_id = bootstrap;
  END IF;
END $$;

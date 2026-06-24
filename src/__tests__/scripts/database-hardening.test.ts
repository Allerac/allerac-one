/** @jest-environment node */

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("database deployment hardening", () => {
  test("migration numbers are unique", () => {
    const migrationDir = path.join(root, "src/database/migrations");
    const files = fs.readdirSync(migrationDir).filter((file) => /^\d{3}_.+\.sql$/.test(file));
    const numbers = files.map((file) => file.slice(0, 3));

    expect(new Set(numbers).size).toBe(numbers.length);
  });

  test("migration application and tracking are atomic", () => {
    const runner = read("src/database/run-migrations.sh");

    expect(runner).toContain("-v ON_ERROR_STOP=1");
    expect(runner).toContain("--single-transaction");
    expect(runner).toContain("INSERT INTO _migrations");
  });

  test("schema equivalence smoke test covers fresh and legacy upgrade paths", () => {
    const smokeTest = read("scripts/schema-equivalence-smoke.sh");

    expect(smokeTest).toContain("schema_fresh");
    expect(smokeTest).toContain("schema_upgrade");
    expect(smokeTest).toContain("020_health_activities.sql");
    expect(smokeTest).toContain("pg_dump");
    expect(smokeTest).toContain("diff -u");
  });

  test("update backup happens before pull and migrations", () => {
    const updater = read("update.sh");
    const backup = updater.indexOf("backup pre-update");
    const pull = updater.indexOf('git pull origin "${DEPLOY_BRANCH:-main}"');
    const migrations = updater.indexOf("up --force-recreate migrations");

    expect(backup).toBeGreaterThan(-1);
    expect(pull).toBeGreaterThan(-1);
    expect(backup).toBeLessThan(pull);
    expect(pull).toBeLessThan(migrations);
  });

  test("update failures print exact rollback state for every destructive phase", () => {
    const updater = read("update.sh");

    expect(updater).toContain("PREVIOUS_COMMIT");
    expect(updater).toContain("PRE_UPDATE_BACKUP");
    expect(updater).toContain('fail_update "database migration"');
    expect(updater).toContain('fail_update "image build"');
    expect(updater).toContain('fail_update "service restart"');
    expect(updater).toContain('fail_update "health verification"');
    expect(updater).toContain("git checkout --detach");
    expect(updater).toContain("allerac.sh restore");
    expect(updater).toContain(".State.Health.Status");
  });

  test("restore validates input and preserves a recovery backup", () => {
    const cli = read("allerac.sh");

    expect(cli).toContain('gzip -t "$filepath"');
    expect(cli).toContain("PostgreSQL database dump");
    expect(cli).toContain('create_database_backup "pre-restore"');
    expect(cli).toContain("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    expect(cli).toContain("psql -v ON_ERROR_STOP=1");
  });

  test("web backup actions execute PostgreSQL tools without a shell", () => {
    const actions = read("src/app/actions/backup.ts");

    expect(actions).toContain("spawn(executable, args");
    expect(actions).not.toContain("promisify(exec)");
    expect(actions).toContain("POSTGRES_DUMP_HEADER");
    expect(actions).toContain("'ON_ERROR_STOP=1'");
  });
});

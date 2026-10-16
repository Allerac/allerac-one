/**
 * Runs the bash test suites of scripts/units. The database round trip
 * (export-domain.sh -> import-domain.sh) needs a PostgreSQL server and a
 * migrated template database, so it only runs when UNITS_TEST_PG and
 * UNITS_TEST_TEMPLATE are set.
 */
import { execFileSync } from 'child_process';
import path from 'path';

const dir = path.join(__dirname, '..', '..', '..', 'scripts', 'units');
const run = (script: string) =>
  execFileSync('bash', [path.join(dir, script)], { encoding: 'utf8', stdio: 'pipe', timeout: 120_000 });

describe('scripts/units', () => {
  test('new-unit.sh', () => {
    expect(run('new-unit.test.sh')).toContain('all checks passed');
  });

  const withDb = process.env.UNITS_TEST_PG && process.env.UNITS_TEST_TEMPLATE ? test : test.skip;
  withDb('export-domain.sh -> import-domain.sh round trip', () => {
    expect(run('domain-transfer.test.sh')).toContain('all checks passed');
  });
});

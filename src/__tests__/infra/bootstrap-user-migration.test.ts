import fs from 'fs';
import path from 'path';

const dbDir = path.join(__dirname, '..', '..', 'database');

describe('legacy dev@local.host bootstrap account', () => {
  test('init.sql no longer creates it', () => {
    const initSql = fs.readFileSync(path.join(dbDir, 'init.sql'), 'utf8');
    expect(initSql).not.toMatch(/INSERT INTO users[\s\S]{0,200}dev@local\.host/);
  });

  test('migration 140 deletes it or disables and demotes it', () => {
    const sql = fs.readFileSync(path.join(dbDir, 'migrations', '140_retire_bootstrap_user.sql'), 'utf8');
    expect(sql).toContain("email = 'dev@local.host'");
    expect(sql).toMatch(/DELETE FROM users WHERE id = bootstrap/);
    expect(sql).toMatch(/is_admin = false, is_active = false/);
  });
});

/** @jest-environment node */

// The terminal Compose profile is refused on public Units by
// scripts/lib/unit-terminal-guard.sh, wired into install.sh, update.sh and allerac.sh.

import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('the bash test suite passes', () => {
  expect(execFileSync('bash', [path.join(ROOT, 'scripts/lib/unit-terminal-guard.test.sh')], { encoding: 'utf8' })).toContain('all passed');
});

test.each(['install.sh', 'update.sh', 'allerac.sh'])('%s runs the guard', (file) => {
  const script = read(file);
  expect(script).toContain('scripts/lib/unit-terminal-guard.sh');
  expect(script).toContain('allerac_terminal_profile_check');
});

test('update.sh checks the guard before migrations and image builds', () => {
  const script = read('update.sh');
  const guard = script.indexOf('allerac_terminal_profile_check "$EFFECTIVE_PROFILES"');
  expect(guard).toBeGreaterThan(0);
  expect(guard).toBeLessThan(script.indexOf('Running database migrations'));
  expect(guard).toBeLessThan(script.indexOf('Rebuilding application images'));
});

describe('allerac.sh start', () => {
  let dir: string;
  let dockerLog: string;
  const run = (env: string) => {
    fs.writeFileSync(path.join(dir, '.env'), env);
    fs.writeFileSync(dockerLog, '');
    return spawnSync('bash', [path.join(ROOT, 'allerac.sh'), 'start'], {
      encoding: 'utf8',
      // A minimal environment, so no COMPOSE_PROFILES / UNIT_PUBLIC leaks in from the caller.
      env: { PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`, HOME: dir, INSTALL_DIR: dir, DOCKER_LOG: dockerLog } as unknown as NodeJS.ProcessEnv,
    });
  };
  const composeUpCalled = () => fs.readFileSync(dockerLog, 'utf8').includes('up -d');

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'allerac-guard-'));
    dockerLog = path.join(dir, 'docker.log');
    fs.mkdirSync(path.join(dir, 'scripts/lib'), { recursive: true });
    for (const lib of ['compose-profiles.sh', 'unit-terminal-guard.sh']) {
      fs.copyFileSync(path.join(ROOT, 'scripts/lib', lib), path.join(dir, 'scripts/lib', lib));
    }
    fs.writeFileSync(path.join(dir, 'docker-compose.yml'), 'services: {}\n');
    // A fake docker that only records its arguments.
    fs.mkdirSync(path.join(dir, 'bin'));
    fs.writeFileSync(path.join(dir, 'bin/docker'), '#!/usr/bin/env bash\necho "$*" >> "$DOCKER_LOG"\n', { mode: 0o755 });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('refuses the terminal profile when UNIT_PUBLIC is not false', () => {
    const result = run('COMPOSE_PROFILES=local,terminal\n');
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('UNIT_PUBLIC');
    expect(composeUpCalled()).toBe(false);
  });

  test('refuses the terminal profile on a lean Unit', () => {
    const result = run('COMPOSE_PROFILES=terminal\nUNIT_PUBLIC=false\nCOMPOSE_FILE=docker-compose.yml:docker-compose.public.yml\n');
    expect(result.status).toBe(1);
    expect(composeUpCalled()).toBe(false);
  });

  test('starts a private Unit with the terminal profile, and any Unit without it', () => {
    expect(run('COMPOSE_PROFILES=terminal\nUNIT_PUBLIC=false\n').status).toBe(0);
    expect(composeUpCalled()).toBe(true);
    expect(run('COMPOSE_PROFILES=local\n').status).toBe(0);
    expect(composeUpCalled()).toBe(true);
  });
});

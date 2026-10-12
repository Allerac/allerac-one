/** @jest-environment node */

// Keeps scripts/lib/compose-profiles.sh in sync with the TypeScript module
// manifests and profile presets, and runs its bash test suite.

import { execFileSync } from 'child_process';
import path from 'path';
import { ALLERAC_PROFILES } from '@/lib/runtime-config';
import { MODULES, MODULE_IDS } from '@/modules/registry';

const ROOT = path.resolve(__dirname, '../../..');
const HELPER = path.join(ROOT, 'scripts/lib/compose-profiles.sh');

function sh(script: string, ...args: string[]): string {
  return execFileSync('bash', ['-c', `. "${HELPER}"; ${script}`, 'test', ...args], { encoding: 'utf8' });
}

function parseMap(raw: string): Record<string, string[]> {
  return Object.fromEntries(raw.split(';').filter(Boolean).map((entry) => {
    const [key, value] = entry.split('=');
    return [key, value.split(',').filter(Boolean)];
  }));
}

describe('scripts/lib/compose-profiles.sh', () => {
  test('ALLERAC_ALL_MODULES matches the registry', () => {
    expect(sh('printf %s "$ALLERAC_ALL_MODULES"').split(',')).toEqual([...MODULE_IDS]);
  });

  test('ALLERAC_MODULE_COMPOSE_PROFILES matches manifest dockerProfile', () => {
    const expected = Object.fromEntries(
      MODULES.filter((m) => m.dockerProfile).map((m) => [m.id, [m.dockerProfile as string]]),
    );
    expect(parseMap(sh('printf %s "$ALLERAC_MODULE_COMPOSE_PROFILES"'))).toEqual(expected);
  });

  test('ALLERAC_PROFILE_MODULES matches ALLERAC_PROFILES', () => {
    const expected = Object.fromEntries(
      Object.entries(ALLERAC_PROFILES).map(([name, list]) => [name, list === '*' ? ['all'] : [...list]]),
    );
    expect(parseMap(sh('printf %s "$ALLERAC_PROFILE_MODULES"'))).toEqual(expected);
  });

  test.each(Object.keys(ALLERAC_PROFILES))('profile %s derives the dockerProfile of its modules', (profile) => {
    const list = ALLERAC_PROFILES[profile as keyof typeof ALLERAC_PROFILES];
    const ids = list === '*' ? MODULE_IDS : list;
    const expected = MODULES.filter((m) => ids.includes(m.id) && m.dockerProfile).map((m) => m.dockerProfile).join(',');
    expect(sh('allerac_module_compose_profiles "$1" ""', profile)).toBe(expected);
  });

  test('bash test suite passes', () => {
    expect(() => execFileSync('bash', [path.join(ROOT, 'scripts/lib/compose-profiles.test.sh')], { encoding: 'utf8' }))
      .not.toThrow();
  });
});

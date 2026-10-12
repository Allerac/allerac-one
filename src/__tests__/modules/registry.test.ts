/** @jest-environment node */

import { ALLERAC_PROFILES, resolveModuleSelection, validateRuntimeConfig } from '@/lib/runtime-config';
import {
  MODULES,
  MODULE_IDS,
  filterEnabledDomainSlugs,
  filterEnabledTools,
  getDisabledDomainSlugs,
  getDisabledToolNames,
  getEnabledModules,
  isDomainEnabled,
  isModuleEnabled,
  isToolEnabled,
} from '@/modules/registry';

const KNOWN = ['health', 'music', 'email', 'social', 'openworld', 'sales'];

describe('resolveModuleSelection', () => {
  test('defaults to every module (profile all) when nothing is set', () => {
    expect(resolveModuleSelection(KNOWN, {})).toEqual({
      enabled: KNOWN, source: 'default', profile: 'all', unknown: [],
    });
  });

  test('blank ALLERAC_MODULES counts as unset', () => {
    expect(resolveModuleSelection(KNOWN, { ALLERAC_MODULES: '  ' }).enabled).toEqual(KNOWN);
    expect(resolveModuleSelection(KNOWN, { ALLERAC_MODULES: '', ALLERAC_PROFILE: 'sales' }).enabled).toEqual(['sales']);
  });

  test.each([
    ['all', KNOWN],
    ['personal', ['health', 'music', 'email', 'social']],
    ['openworld', ['openworld']],
    ['sales', ['sales']],
    [' Personal ', ['health', 'music', 'email', 'social']],
  ])('profile %p', (profile, expected) => {
    const selection = resolveModuleSelection(KNOWN, { ALLERAC_PROFILE: profile });
    expect(selection.enabled).toEqual(expected);
    expect(selection.source).toBe('ALLERAC_PROFILE');
  });

  test('explicit ALLERAC_MODULES overrides ALLERAC_PROFILE', () => {
    const selection = resolveModuleSelection(KNOWN, { ALLERAC_PROFILE: 'personal', ALLERAC_MODULES: 'music, Sales' });
    expect(selection).toEqual({ enabled: ['music', 'sales'], source: 'ALLERAC_MODULES', profile: null, unknown: [] });
  });

  test('ALLERAC_MODULES supports all, * and none, and reports unknown ids', () => {
    expect(resolveModuleSelection(KNOWN, { ALLERAC_MODULES: 'all' }).enabled).toEqual(KNOWN);
    expect(resolveModuleSelection(KNOWN, { ALLERAC_MODULES: '*' }).enabled).toEqual(KNOWN);
    expect(resolveModuleSelection(KNOWN, { ALLERAC_MODULES: 'none' }).enabled).toEqual([]);
    expect(resolveModuleSelection(KNOWN, { ALLERAC_MODULES: 'health,robot' })).toMatchObject({
      enabled: ['health'], unknown: ['robot'],
    });
  });

  test('unknown profile fails open to all and is rejected by validateRuntimeConfig', () => {
    expect(resolveModuleSelection(KNOWN, { ALLERAC_PROFILE: 'bogus' })).toMatchObject({ enabled: KNOWN, unknown: ['bogus'] });
    const base = {
      DATABASE_URL: 'postgresql://x', ENCRYPTION_KEY: 'a'.repeat(64),
      TELEGRAM_TOKEN_ENCRYPTION_KEY: 'b'.repeat(64), EXECUTOR_URL: 'http://e', EXECUTOR_SECRET: 'c'.repeat(64),
    };
    expect(() => validateRuntimeConfig({ ...base, ALLERAC_PROFILE: 'bogus' })).toThrow(/ALLERAC_PROFILE must be one of/);
    expect(() => validateRuntimeConfig({ ...base, ALLERAC_PROFILE: 'personal' })).not.toThrow();
    expect(() => validateRuntimeConfig(base)).not.toThrow();
  });

  test('every profile only names registered modules', () => {
    for (const list of Object.values(ALLERAC_PROFILES)) {
      if (list === '*') continue;
      for (const id of list) expect(MODULE_IDS).toContain(id);
    }
  });
});

describe('module registry', () => {
  test('manifests are well formed and do not overlap', () => {
    expect([...MODULE_IDS].sort()).toEqual([...KNOWN].sort());
    const domains = MODULES.flatMap((m) => m.domains);
    const tools = MODULES.flatMap((m) => m.tools);
    expect(new Set(domains).size).toBe(domains.length);
    expect(new Set(tools).size).toBe(tools.length);
    expect(MODULES.find((m) => m.id === 'health')?.dockerProfile).toBe('health');
    for (const m of MODULES) {
      expect(['core', 'external', 'personal']).toContain(m.group);
      expect(m.nav.every((n) => m.domains.includes(n.key))).toBe(true);
    }
    expect(MODULES.filter((m) => m.group === 'external').map((m) => m.id).sort()).toEqual(['openworld', 'sales']);
  });

  test('default (nothing set) disables nothing', () => {
    expect(getEnabledModules({}).map((m) => m.id)).toEqual(MODULE_IDS);
    expect(getDisabledDomainSlugs({})).toEqual([]);
    expect(getDisabledToolNames({})).toEqual([]);
    const tools = [{ function: { name: 'get_health_summary' } }];
    expect(filterEnabledTools(tools, {})).toBe(tools);
    const slugs = ['chat', 'health'];
    expect(filterEnabledDomainSlugs(slugs, {})).toBe(slugs);
  });

  test('openworld profile disables personal modules and sales, keeps core', () => {
    const env = { ALLERAC_PROFILE: 'openworld' };
    expect(isModuleEnabled('openworld', env)).toBe(true);
    expect(isModuleEnabled('health', env)).toBe(false);
    expect(isDomainEnabled('openworld', env)).toBe(true);
    expect(isDomainEnabled('chat', env)).toBe(true);
    expect(isDomainEnabled('health', env)).toBe(false);
    expect(isDomainEnabled('sales', env)).toBe(false);
    expect(isToolEnabled('get_health_summary', env)).toBe(false);
    expect(isToolEnabled('send_email', env)).toBe(false);
    expect(isToolEnabled('search_web', env)).toBe(true);
    expect(filterEnabledDomainSlugs(['chat', 'health', 'music', 'openworld', 'notes'], env))
      .toEqual(['chat', 'openworld', 'notes']);
  });

  test('personal profile keeps personal modules and hides external ones', () => {
    const env = { ALLERAC_PROFILE: 'personal' };
    expect(getDisabledDomainSlugs(env).sort()).toEqual(['openworld', 'sales']);
    expect(getDisabledToolNames(env)).toEqual([]);
  });
});

/** @jest-environment node */

// Verifies that a disabled module's domains and tools disappear from the
// existing enable/disable paths, and that the default (profile "all") is
// identical to the behavior without the module registry.

jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('@/app/services/skills/skills.service', () => ({
  skillsService: { getSkillTools: jest.fn().mockResolvedValue([]) },
}));

import pool from '@/app/clients/db';

const mockedQuery = jest.mocked(pool.query) as unknown as jest.Mock;
const ORIGINAL_ENV = process.env;

function withEnv(env: Record<string, string>) {
  process.env = { ...ORIGINAL_ENV, ...env };
  delete process.env.ALLERAC_MODULES;
  delete process.env.ALLERAC_PROFILE;
  Object.assign(process.env, env);
}

function toolNames(tools: Array<{ function: { name: string } }>): string[] {
  return tools.map((t) => t.function.name);
}

function loadTools(): Array<{ function: { name: string } }> {
  let tools: Array<{ function: { name: string } }> = [];
  jest.isolateModules(() => {
    tools = jest.requireActual('@/app/tools/tools').TOOLS;
  });
  return tools;
}

beforeEach(() => mockedQuery.mockReset());
afterEach(() => { process.env = ORIGINAL_ENV; });

describe('TOOLS', () => {
  const MODULE_ENV = { HEALTH_WORKER_SECRET: 'x', SPOTIFY_CLIENT_ID: 'y' };

  test('default and explicit profile all offer the same tools as before', () => {
    withEnv(MODULE_ENV);
    const defaults = toolNames(loadTools());
    withEnv({ ...MODULE_ENV, ALLERAC_PROFILE: 'all' });
    expect(toolNames(loadTools())).toEqual(defaults);
    withEnv({ ...MODULE_ENV, ALLERAC_PROFILE: 'personal' });
    expect(toolNames(loadTools())).toEqual(defaults);
    expect(defaults).toEqual(expect.arrayContaining(['get_health_summary', 'get_top_tracks', 'list_emails', 'instagram_publish_post']));
  });

  test('disabled modules do not offer their tools', () => {
    withEnv({ ...MODULE_ENV, ALLERAC_PROFILE: 'openworld' });
    const names = toolNames(loadTools());
    for (const t of ['get_health_summary', 'get_top_tracks', 'list_emails', 'instagram_publish_post', 'update_social_form']) {
      expect(names).not.toContain(t);
    }
    expect(names).toEqual(expect.arrayContaining(['search_web', 'save_note', 'read_logs']));
  });
});

describe('resolveChatTools', () => {
  function loadResolver(): typeof import('@/app/services/chat/chat-tool-registry').resolveChatTools {
    let fn!: typeof import('@/app/services/chat/chat-tool-registry').resolveChatTools;
    jest.isolateModules(() => {
      fn = jest.requireActual('@/app/services/chat/chat-tool-registry').resolveChatTools;
    });
    return fn;
  }

  test('email domain tools are dropped when the email module is off', async () => {
    withEnv({});
    expect(toolNames(await loadResolver()(null, 'email'))).toContain('list_emails');
    withEnv({ ALLERAC_MODULES: 'health' });
    expect(toolNames(await loadResolver()(null, 'email'))).not.toContain('list_emails');
  });
});

describe('assertDomainAccess', () => {
  const { assertDomainAccess } = jest.requireActual('@/app/lib/domain-access-check') as typeof import('@/app/lib/domain-access-check');
  const admin = { id: 'a', is_admin: true };
  const user = { id: 'u', is_admin: false };

  test('default: admin passes without a query, users need a grant (unchanged)', async () => {
    withEnv({});
    await expect(assertDomainAccess(admin, 'health')).resolves.toBeUndefined();
    expect(mockedQuery).not.toHaveBeenCalled();
    mockedQuery.mockResolvedValueOnce({ rows: [{}] });
    await expect(assertDomainAccess(user, 'health')).resolves.toBeUndefined();
    mockedQuery.mockResolvedValueOnce({ rows: [] });
    await expect(assertDomainAccess(user, 'health')).rejects.toThrow('Domain access denied');
  });

  test('disabled module domain is denied for everyone, admins included', async () => {
    withEnv({ ALLERAC_PROFILE: 'sales' });
    await expect(assertDomainAccess(admin, 'health')).rejects.toThrow('Domain not available in this Unit');
    await expect(assertDomainAccess(user, 'openworld')).rejects.toThrow('Domain not available in this Unit');
    expect(mockedQuery).not.toHaveBeenCalled();
    await expect(assertDomainAccess(admin, 'sales')).resolves.toBeUndefined();
    await expect(assertDomainAccess(admin, 'chat')).resolves.toBeUndefined();
  });
});

describe('DomainService.listAccessible and AuthService', () => {
  const rows = ['chat', 'health', 'music', 'sales', 'openworld'].map((slug) => ({ slug, display_name: slug, is_active: true }));

  test('hides disabled module domains from the hub/taskbar list; default keeps all', async () => {
    const { domainService } = jest.requireActual('@/app/services/domains/domain.service') as typeof import('@/app/services/domains/domain.service');
    withEnv({});
    mockedQuery.mockResolvedValueOnce({ rows });
    expect((await domainService.listAccessible({ userId: 'a', isAdmin: true })).map((d) => d.slug))
      .toEqual(['chat', 'health', 'music', 'sales', 'openworld']);
    withEnv({ ALLERAC_PROFILE: 'personal' });
    mockedQuery.mockResolvedValueOnce({ rows });
    expect((await domainService.listAccessible({ userId: 'a', isAdmin: true })).map((d) => d.slug))
      .toEqual(['chat', 'health', 'music']);
  });

  test('canAccessDomain and getFirstDomainSlug respect disabled modules', async () => {
    const { AuthService } = jest.requireActual('@/app/services/auth/auth.service') as typeof import('@/app/services/auth/auth.service');
    const auth = new AuthService();
    withEnv({ ALLERAC_PROFILE: 'openworld' });
    await expect(auth.canAccessDomain('a', true, 'health')).resolves.toBe(false);
    await expect(auth.canAccessDomain('a', true, 'openworld')).resolves.toBe(true);
    mockedQuery.mockResolvedValueOnce({ rows: [{ slug: 'chat' }] });
    await expect(auth.getFirstDomainSlug('u')).resolves.toBe('chat');
    expect(mockedQuery.mock.calls[0][1]).toEqual(['u', expect.arrayContaining(['health', 'music', 'email', 'social', 'sales'])]);

    withEnv({});
    mockedQuery.mockReset();
    mockedQuery.mockResolvedValueOnce({ rows: [{ slug: 'health' }] });
    await expect(auth.getFirstDomainSlug('u')).resolves.toBe('health');
    expect(mockedQuery.mock.calls[0][1]).toEqual(['u']);
    await expect(auth.canAccessDomain('a', true, 'health')).resolves.toBe(true);
  });
});

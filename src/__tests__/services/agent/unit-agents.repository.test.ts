/** @jest-environment node */
const mockQuery = jest.fn();
jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: (...args: unknown[]) => mockQuery(...args) } }));
jest.mock('@/federation/unit-profile.repository', () => ({
  loadUnitProfile: jest.fn().mockResolvedValue({
    name: 'napols', displayName: 'Napols', emoji: null, role: 'personal', description: null,
    tags: [], agentDescriptions: {}, identityInPublicDomains: false, instructions: 'Be brief.',
  }),
}));
jest.mock('@/app/services/agent/agent-tool-settings.repository', () => ({
  loadAgentToolSettings: jest.fn().mockResolvedValue({ modules: {}, tools: {}, skills: {} }),
}));

import {
  UnitAgentError,
  archiveUnitAgent,
  clearUnitAgentsCache,
  createUnitAgent,
  listUnitAgents,
  loadAgent,
  updateUnitAgent,
} from '@/app/services/agent/unit-agents.repository';

const dbRow = (patch: Record<string, unknown> = {}) => ({
  id: 'id-doctor', slug: 'doctor', display_name: 'Doctor', emoji: '🩺', avatar_url: null, role: 'health',
  description: null, instructions: null, is_default: false, enabled: true, sort_order: 0, tool_settings: {},
  memory_mode: 'isolated', can_call: [], model_id: null, model_provider: null, cloud_allowed: false,
  default_skill_id: null, federation_exposed: false, template: 'doctor', archived_at: null,
  created_at: '2026-11-27T10:00:00Z', updated_at: '2026-11-27T10:00:00Z', ...patch,
});
const defaultRow = dbRow({ id: 'id-chat', slug: 'chat', display_name: null, role: null, is_default: true, cloud_allowed: true, template: null });

describe('unit agents repository', () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  beforeEach(() => { mockQuery.mockReset(); clearUnitAgentsCache(); });
  afterAll(() => consoleError.mockRestore());

  it('falls back to the profile default bot when the table is missing', async () => {
    mockQuery.mockRejectedValueOnce(Object.assign(new Error('relation "unit_agents" does not exist'), { code: '42P01' }));
    const agents = await listUnitAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({ slug: 'chat', isDefault: true, displayName: 'Napols', instructions: 'Be brief.' });
  });

  it('adds the default bot when its row is missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [dbRow()] });
    expect((await listUnitAgents()).map((agent) => agent.slug)).toEqual(['chat', 'doctor']);
  });

  it('hides archived bots unless asked, and caches reads', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [defaultRow, dbRow({ archived_at: '2026-11-27T11:00:00Z' })] });
    expect((await listUnitAgents()).map((agent) => agent.slug)).toEqual(['chat']);
    expect((await listUnitAgents({ includeArchived: true })).map((agent) => agent.slug)).toEqual(['chat', 'doctor']);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('loadAgent returns the bot, or the default bot for unknown, disabled or archived slugs', async () => {
    mockQuery.mockResolvedValue({ rows: [defaultRow, dbRow(), dbRow({ slug: 'off', enabled: false }), dbRow({ slug: 'old', archived_at: '2026-11-27T11:00:00Z' })] });
    expect((await loadAgent('doctor')).slug).toBe('doctor');
    expect((await loadAgent('doctor')).cloudAllowed).toBe(false);
    for (const slug of ['missing', 'off', 'old', null, undefined]) {
      expect((await loadAgent(slug)).slug).toBe('chat');
    }
  });

  it('rejects slugs used by a domain', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    await expect(createUnitAgent({ slug: 'robots', displayName: 'Robots' }, 'admin')).rejects.toMatchObject({ code: 'slug_reserved' });
  });

  it('maps a unique violation to slug_taken', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // domains
      .mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));
    await expect(createUnitAgent({ slug: 'doctor', displayName: 'Doctor' }, 'admin')).rejects.toMatchObject({ code: 'slug_taken' });
  });

  it('rejects canCall entries that are not bots', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // domains
      .mockResolvedValueOnce({ rows: [{ slug: 'agenda' }] }); // known bots
    await expect(createUnitAgent({ slug: 'doctor', displayName: 'Doctor', canCall: ['agenda', 'ghost'] }, 'admin'))
      .rejects.toMatchObject({ code: 'unknown_bot', details: { missing: ['ghost'] } });
  });

  it('locks profile-owned fields of the default bot', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [defaultRow] });
    const attempt = updateUnitAgent('chat', { instructions: 'x' }, 'admin');
    await expect(attempt).rejects.toBeInstanceOf(UnitAgentError);
    await expect(attempt).rejects.toMatchObject({ code: 'default_agent_locked', details: { fields: ['instructions'] } });
  });

  it('updates only the given columns', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [defaultRow, dbRow()] }) // current rows
      .mockResolvedValueOnce({ rows: [] }) // UPDATE
      .mockResolvedValueOnce({ rows: [defaultRow, dbRow({ role: 'gp' })] }); // reload
    const agent = await updateUnitAgent('doctor', { role: 'gp', sortOrder: 3 }, 'admin');
    const [sql, params] = mockQuery.mock.calls[1];
    expect(sql).toContain('role = $3');
    expect(sql).toContain('sort_order = $4');
    expect(sql).not.toContain('display_name');
    expect(params).toEqual(['doctor', 'admin', 'gp', 3]);
    expect(agent.role).toBe('gp');
  });

  it('never archives the default bot', async () => {
    await expect(archiveUnitAgent('chat', 'admin')).rejects.toMatchObject({ code: 'default_agent_locked' });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

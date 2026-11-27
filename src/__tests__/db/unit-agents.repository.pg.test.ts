/**
 * @jest-environment node
 *
 * Bot registry (`unit_agents`, migration 158) on a real, migrated Postgres.
 * Enabled with RUN_PG_TESTS=1 and DATABASE_URL.
 */
import pool from '@/app/clients/db';
import {
  archiveUnitAgent,
  clearUnitAgentsCache,
  createUnitAgent,
  getUnitAgent,
  listUnitAgents,
  loadAgent,
  unarchiveUnitAgent,
  updateUnitAgent,
} from '@/app/services/agent/unit-agents.repository';
import { clearUnitProfileCache } from '@/federation/unit-profile.repository';
import { clearAgentToolSettingsCache } from '@/app/services/agent/agent-tool-settings.repository';

const enabled = process.env.RUN_PG_TESTS === '1' && !!process.env.DATABASE_URL;
const describePg = enabled ? describe : describe.skip;

const PREFIX = 'pgtest-bot-';

describePg('unit agents repository against Postgres', () => {
  beforeEach(() => {
    clearUnitAgentsCache();
    clearUnitProfileCache();
    clearAgentToolSettingsCache();
  });

  afterAll(async () => {
    await pool.query('DELETE FROM unit_agents WHERE slug LIKE $1', [`${PREFIX}%`]);
    await pool.end();
  });

  it('seeds exactly one default bot, inheriting the Unit identity', async () => {
    const defaults = await pool.query('SELECT slug, display_name, instructions FROM unit_agents WHERE is_default');
    expect(defaults.rows).toEqual([{ slug: 'chat', display_name: null, instructions: null }]);
    const agents = await listUnitAgents();
    expect(agents[0]).toMatchObject({ slug: 'chat', isDefault: true });
    expect(agents[0].displayName).toBeTruthy();
  });

  it('enforces one default bot and keeps it active at the DB level', async () => {
    await expect(pool.query(`INSERT INTO unit_agents (slug, display_name, is_default) VALUES ($1, 'X', TRUE)`, [`${PREFIX}second`]))
      .rejects.toMatchObject({ code: '23505' });
    await expect(pool.query(`UPDATE unit_agents SET enabled = FALSE WHERE is_default`)).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(`INSERT INTO unit_agents (slug) VALUES ($1)`, [`${PREFIX}noname`])).rejects.toMatchObject({ code: '23514' });
  });

  it('creates, updates, archives and restores a bot', async () => {
    const slug = `${PREFIX}doctor`;
    const created = await createUnitAgent({
      slug, displayName: 'Doctor', emoji: '🩺', instructions: 'Ask about symptoms.',
      cloudAllowed: false, toolSettings: { modules: { health: true } },
    }, null);
    expect(created).toMatchObject({ slug, displayName: 'Doctor', memoryMode: 'isolated', cloudAllowed: false, federationExposed: false });
    await expect(createUnitAgent({ slug, displayName: 'Again' }, null)).rejects.toMatchObject({ code: 'slug_taken' });

    const updated = await updateUnitAgent(slug, { role: 'health', sortOrder: 2 }, null);
    expect(updated).toMatchObject({ role: 'health', sortOrder: 2, instructions: 'Ask about symptoms.' });

    await archiveUnitAgent(slug, null);
    expect((await listUnitAgents()).some((agent) => agent.slug === slug)).toBe(false);
    expect((await loadAgent(slug)).slug).toBe('chat');
    expect((await getUnitAgent(slug))?.archivedAt).toBeTruthy();

    await unarchiveUnitAgent(slug, null);
    expect((await loadAgent(slug)).slug).toBe(slug);
  });

  it('rejects slugs owned by a domain', async () => {
    const domain = await pool.query('SELECT slug FROM domains LIMIT 1');
    if (!domain.rows.length) return;
    await expect(createUnitAgent({ slug: domain.rows[0].slug, displayName: 'X' }, null)).rejects.toMatchObject({ code: 'slug_reserved' });
  });

  it('refuses profile-owned edits and archiving on the default bot', async () => {
    await expect(updateUnitAgent('chat', { displayName: 'X' }, null)).rejects.toMatchObject({ code: 'default_agent_locked' });
    await expect(archiveUnitAgent('chat', null)).rejects.toMatchObject({ code: 'default_agent_locked' });
  });
});

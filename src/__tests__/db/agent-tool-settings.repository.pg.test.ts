/**
 * @jest-environment node
 *
 * unit_profile.agent_tool_settings round trip on a real, migrated Postgres
 * (migration 151). Enabled with RUN_PG_TESTS=1 and DATABASE_URL.
 */
import pool from '@/app/clients/db';
import {
  clearAgentToolSettingsCache,
  loadAgentToolSettings,
  saveAgentToolSettings,
} from '@/app/services/agent/agent-tool-settings.repository';
import { clearUnitProfileCache, loadUnitProfile, saveUnitProfile } from '@/federation/unit-profile.repository';
import { toPeerProfile } from '@/federation/unit-profile';

const enabled = process.env.RUN_PG_TESTS === '1' && !!process.env.DATABASE_URL;
const describePg = enabled ? describe : describe.skip;

describePg('agent tool settings repository against Postgres', () => {
  let before: unknown;

  beforeAll(async () => {
    before = (await pool.query('SELECT agent_tool_settings FROM unit_profile WHERE id = 1')).rows[0]?.agent_tool_settings;
  });

  afterAll(async () => {
    await pool.query('UPDATE unit_profile SET agent_tool_settings = $1::jsonb WHERE id = 1', [JSON.stringify(before ?? {})]);
    await pool.end();
  });

  it('merges toggles, survives profile saves and is never part of the peer profile', async () => {
    await saveAgentToolSettings({ modules: { music: true } }, null as unknown as string);
    await saveAgentToolSettings({ tools: { send_email: false } }, null as unknown as string);
    clearAgentToolSettingsCache();
    expect(await loadAgentToolSettings()).toEqual({ modules: { music: true }, tools: { send_email: false }, skills: {} });

    await saveUnitProfile({ role: 'research' }, null as unknown as string);
    clearAgentToolSettingsCache();
    clearUnitProfileCache();
    expect((await loadAgentToolSettings()).modules).toEqual({ music: true });
    expect(JSON.stringify(toPeerProfile(await loadUnitProfile()))).not.toContain('send_email');
  });
});

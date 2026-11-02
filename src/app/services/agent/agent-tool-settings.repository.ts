/** DB access for the agent tool settings (unit_profile.agent_tool_settings, migration 151). */
import pool from '@/app/clients/db';
import {
  EMPTY_AGENT_TOOL_SETTINGS,
  normalizeAgentToolSettings,
  type AgentToolSettings,
  type AgentToolSettingsInput,
} from './agent-tool-settings';

const CACHE_MS = 30_000;
let cache: { at: number; settings: AgentToolSettings } | null = null;

/** Test hook: drops the 30s cache. */
export function clearAgentToolSettingsCache(): void {
  cache = null;
}

/** Stored settings, normalized. Never throws: a missing column means defaults. */
export async function loadAgentToolSettings(): Promise<AgentToolSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.settings;
  try {
    const result = await pool.query('SELECT agent_tool_settings FROM unit_profile WHERE id = 1');
    const settings = normalizeAgentToolSettings(result.rows[0]?.agent_tool_settings ?? {});
    cache = { at: Date.now(), settings };
    return settings;
  } catch (error) {
    console.error('[AgentToolSettings] load failed:', error instanceof Error ? error.message : error);
    return EMPTY_AGENT_TOOL_SETTINGS;
  }
}

/** Merges the input into the stored settings (per key) and saves them. */
export async function saveAgentToolSettings(input: AgentToolSettingsInput, userId: string): Promise<AgentToolSettings> {
  clearAgentToolSettingsCache();
  const current = await loadAgentToolSettings();
  const merged = normalizeAgentToolSettings({
    modules: { ...current.modules, ...input.modules },
    tools: { ...current.tools, ...input.tools },
    skills: { ...current.skills, ...input.skills },
  });
  const result = await pool.query(
    `INSERT INTO unit_profile (id, agent_tool_settings, updated_at, updated_by)
     VALUES (1, $1::jsonb, NOW(), $2)
     ON CONFLICT (id) DO UPDATE SET
       agent_tool_settings = EXCLUDED.agent_tool_settings,
       updated_at = NOW(), updated_by = EXCLUDED.updated_by
     RETURNING agent_tool_settings`,
    [JSON.stringify(merged), userId],
  );
  const settings = normalizeAgentToolSettings(result.rows[0]?.agent_tool_settings ?? merged);
  cache = { at: Date.now(), settings };
  return settings;
}

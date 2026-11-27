/**
 * DB access for the bot registry (`unit_agents`, migration 158), with a short
 * cache like `unit-profile.repository.ts`.
 *
 * Reads never throw: if the table is missing (migration not applied) or the
 * query fails, the default bot is built from the Unit profile, so chat keeps
 * working on mixed versions and rollbacks.
 */
import pool from '@/app/clients/db';
import { loadUnitProfile } from '@/federation/unit-profile.repository';
import { loadAgentToolSettings } from './agent-tool-settings.repository';
import { normalizeAgentToolSettings } from './agent-tool-settings';
import {
  DEFAULT_AGENT_SLUG,
  MEMORY_MODES,
  defaultAgentFromProfile,
  lockedDefaultAgentFields,
  resolveUnitAgent,
  slugProblem,
  sortUnitAgents,
  toolSettingsFromDb,
  type CreateUnitAgentInput,
  type MemoryMode,
  type UnitAgent,
  type UnitAgentRow,
  type UpdateUnitAgentInput,
} from './unit-agents';

const CACHE_MS = 30_000;
let cache: { at: number; rows: UnitAgentRow[] | null } | null = null;

/** Raised for invalid bot management requests. `code` maps to an API error. */
export class UnitAgentError extends Error {
  constructor(
    public readonly code: 'slug_taken' | 'slug_reserved' | 'invalid_slug' | 'not_found' | 'default_agent_locked' | 'unknown_bot',
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'UnitAgentError';
  }
}

const iso = (value: unknown): string | null => (value ? new Date(value as string).toISOString() : null);

function fromDb(row: Record<string, unknown>): UnitAgentRow {
  const memoryMode = row.memory_mode as string;
  return {
    id: row.id as string,
    slug: row.slug as string,
    displayName: (row.display_name as string | null) ?? null,
    emoji: (row.emoji as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    role: (row.role as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    instructions: (row.instructions as string | null) ?? null,
    isDefault: row.is_default === true,
    enabled: row.enabled !== false,
    sortOrder: Number(row.sort_order ?? 0),
    toolSettings: toolSettingsFromDb(row.tool_settings),
    memoryMode: (MEMORY_MODES as readonly string[]).includes(memoryMode) ? memoryMode as MemoryMode : 'isolated',
    // Missing before migration 159: a bot then keeps its memories private.
    shareMemoriesByDefault: row.share_memories_by_default === true,
    canCall: (row.can_call as string[] | null) ?? [],
    modelId: (row.model_id as string | null) ?? null,
    modelProvider: (row.model_provider as string | null) ?? null,
    cloudAllowed: row.cloud_allowed !== false,
    defaultSkillId: (row.default_skill_id as string | null) ?? null,
    federationExposed: row.federation_exposed === true,
    template: (row.template as string | null) ?? null,
    archivedAt: iso(row.archived_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/** Test hook: drops the 30s cache. */
export function clearUnitAgentsCache(): void {
  cache = null;
}

/** All stored rows (archived included), or null when the table cannot be read. */
async function loadRows(): Promise<UnitAgentRow[] | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  try {
    const result = await pool.query('SELECT * FROM unit_agents');
    const rows = result.rows.map(fromDb);
    cache = { at: Date.now(), rows };
    return rows;
  } catch (error) {
    // Table missing (migration not applied yet) must never break chat.
    console.error('[UnitAgents] load failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

async function resolveAll(rows: UnitAgentRow[] | null): Promise<UnitAgent[]> {
  const [profile, unitToolSettings] = await Promise.all([loadUnitProfile(), loadAgentToolSettings()]);
  const stored = rows ?? [];
  const agents = stored.map((row) => resolveUnitAgent(row, profile, unitToolSettings));
  if (!stored.some((row) => row.isDefault)) agents.push(defaultAgentFromProfile(profile, unitToolSettings));
  return agents;
}

/** Bots of this Unit, default first. Archived bots only when asked. Never throws. */
export async function listUnitAgents(options: { includeArchived?: boolean } = {}): Promise<UnitAgent[]> {
  const agents = await resolveAll(await loadRows());
  return sortUnitAgents(options.includeArchived ? agents : agents.filter((agent) => !agent.archivedAt));
}

/** One bot by slug (archived included), or null. The default bot always resolves. Never throws. */
export async function getUnitAgent(slug: string): Promise<UnitAgent | null> {
  const agents = await resolveAll(await loadRows());
  return agents.find((agent) => agent.slug === slug) ?? null;
}

/** The bot a turn runs as: the slug's bot when active, else the default bot. Never throws. */
export async function loadAgent(slug: string | null | undefined): Promise<UnitAgent> {
  const agents = await resolveAll(await loadRows());
  const wanted = slug ? agents.find((agent) => agent.slug === slug) : undefined;
  if (wanted && wanted.enabled && !wanted.archivedAt) return wanted;
  return agents.find((agent) => agent.isDefault) as UnitAgent;
}

async function assertSlugAvailable(slug: string): Promise<void> {
  const problem = slugProblem(slug);
  if (problem === 'invalid_format') throw new UnitAgentError('invalid_slug', `Invalid bot slug: ${slug}`);
  if (problem === 'reserved') throw new UnitAgentError('slug_reserved', `Bot slug is reserved: ${slug}`);
  const domain = await pool.query('SELECT 1 FROM domains WHERE slug = $1', [slug]);
  if (domain.rows.length) throw new UnitAgentError('slug_reserved', `Bot slug is used by a domain: ${slug}`);
}

async function assertKnownBots(slugs: string[] | undefined, self: string): Promise<void> {
  if (!slugs?.length) return;
  const unique = [...new Set(slugs)];
  if (unique.includes(self)) throw new UnitAgentError('unknown_bot', 'A bot cannot call itself');
  const result = await pool.query('SELECT slug FROM unit_agents WHERE slug = ANY($1::text[])', [unique]);
  const known = new Set(result.rows.map((row: { slug: string }) => row.slug));
  const missing = unique.filter((slug) => !known.has(slug));
  if (missing.length) throw new UnitAgentError('unknown_bot', 'canCall lists unknown bots', { missing });
}

const nullable = (value: string | null | undefined): string | null => (value?.trim() ? value.trim() : null);

/** Creates a bot. Admin check is the caller's job (API route). */
export async function createUnitAgent(input: CreateUnitAgentInput, userId: string | null): Promise<UnitAgent> {
  await assertSlugAvailable(input.slug);
  await assertKnownBots(input.canCall, input.slug);
  try {
    await pool.query(
      `INSERT INTO unit_agents (slug, display_name, emoji, avatar_url, role, description, instructions,
         enabled, sort_order, tool_settings, memory_mode, can_call, model_id, model_provider,
         cloud_allowed, default_skill_id, federation_exposed, template, updated_by, share_memories_by_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [
        input.slug, input.displayName.trim(), nullable(input.emoji), nullable(input.avatarUrl),
        nullable(input.role), nullable(input.description), nullable(input.instructions),
        input.enabled ?? true, input.sortOrder ?? 0,
        JSON.stringify(normalizeAgentToolSettings(input.toolSettings ?? {})),
        input.memoryMode ?? 'isolated', [...new Set(input.canCall ?? [])],
        nullable(input.modelId), nullable(input.modelProvider), input.cloudAllowed ?? true,
        input.defaultSkillId ?? null, input.federationExposed ?? false, input.template ?? null, userId,
        input.shareMemoriesByDefault ?? false,
      ],
    );
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new UnitAgentError('slug_taken', `Bot slug already exists: ${input.slug}`);
    }
    throw error;
  }
  clearUnitAgentsCache();
  return (await getUnitAgent(input.slug)) as UnitAgent;
}

type Column = { column: string; value: unknown; cast?: string };

function updateColumns(input: UpdateUnitAgentInput): Column[] {
  const columns: Column[] = [];
  const set = (column: string, value: unknown, cast?: string) => columns.push({ column, value, cast });
  if (input.displayName !== undefined) set('display_name', input.displayName.trim());
  if (input.emoji !== undefined) set('emoji', nullable(input.emoji));
  if (input.avatarUrl !== undefined) set('avatar_url', nullable(input.avatarUrl));
  if (input.role !== undefined) set('role', nullable(input.role));
  if (input.description !== undefined) set('description', nullable(input.description));
  if (input.instructions !== undefined) set('instructions', nullable(input.instructions));
  if (input.enabled !== undefined) set('enabled', input.enabled);
  if (input.sortOrder !== undefined) set('sort_order', input.sortOrder);
  if (input.memoryMode !== undefined) set('memory_mode', input.memoryMode);
  if (input.shareMemoriesByDefault !== undefined) set('share_memories_by_default', input.shareMemoriesByDefault);
  if (input.canCall !== undefined) set('can_call', [...new Set(input.canCall)], 'text[]');
  if (input.modelId !== undefined) set('model_id', nullable(input.modelId));
  if (input.modelProvider !== undefined) set('model_provider', nullable(input.modelProvider));
  if (input.cloudAllowed !== undefined) set('cloud_allowed', input.cloudAllowed);
  if (input.defaultSkillId !== undefined) set('default_skill_id', input.defaultSkillId);
  if (input.federationExposed !== undefined) set('federation_exposed', input.federationExposed);
  return columns;
}

/**
 * Updates a bot. Tool settings merge per key (like the Unit agent settings).
 * On the default bot, identity, instructions, tool settings and `enabled` are
 * locked: they live on `unit_profile`.
 */
export async function updateUnitAgent(slug: string, input: UpdateUnitAgentInput, userId: string | null): Promise<UnitAgent> {
  clearUnitAgentsCache();
  const current = (await loadRows())?.find((row) => row.slug === slug);
  if (!current) throw new UnitAgentError('not_found', `Bot not found: ${slug}`);
  if (current.isDefault) {
    const locked = lockedDefaultAgentFields(input);
    if (locked.length) {
      throw new UnitAgentError('default_agent_locked', 'These fields of the default bot are edited in the Unit profile', { fields: locked });
    }
  }
  await assertKnownBots(input.canCall, slug);

  const columns = updateColumns(input);
  if (input.toolSettings !== undefined) {
    const merged = normalizeAgentToolSettings({
      modules: { ...current.toolSettings.modules, ...input.toolSettings.modules },
      tools: { ...current.toolSettings.tools, ...input.toolSettings.tools },
      skills: { ...current.toolSettings.skills, ...input.toolSettings.skills },
    });
    columns.push({ column: 'tool_settings', value: JSON.stringify(merged), cast: 'jsonb' });
  }
  const values = columns.map((entry) => entry.value);
  const assignments = columns.map((entry, index) => `${entry.column} = $${index + 3}${entry.cast ? `::${entry.cast}` : ''}`);
  await pool.query(
    `UPDATE unit_agents SET ${[...assignments, 'updated_at = NOW()', 'updated_by = $2'].join(', ')} WHERE slug = $1`,
    [slug, userId, ...values],
  );
  clearUnitAgentsCache();
  return (await getUnitAgent(slug)) as UnitAgent;
}

/** Archives a bot (never deletes, so history is kept). The default bot cannot be archived. */
export async function archiveUnitAgent(slug: string, userId: string | null): Promise<UnitAgent> {
  if (slug === DEFAULT_AGENT_SLUG) throw new UnitAgentError('default_agent_locked', 'The default bot cannot be archived');
  const result = await pool.query(
    `UPDATE unit_agents SET archived_at = COALESCE(archived_at, NOW()), updated_at = NOW(), updated_by = $2
     WHERE slug = $1 AND NOT is_default RETURNING slug`,
    [slug, userId],
  );
  if (!result.rows.length) throw new UnitAgentError('not_found', `Bot not found: ${slug}`);
  clearUnitAgentsCache();
  return (await getUnitAgent(slug)) as UnitAgent;
}

/** Restores an archived bot. */
export async function unarchiveUnitAgent(slug: string, userId: string | null): Promise<UnitAgent> {
  const result = await pool.query(
    `UPDATE unit_agents SET archived_at = NULL, updated_at = NOW(), updated_by = $2
     WHERE slug = $1 RETURNING slug`,
    [slug, userId],
  );
  if (!result.rows.length) throw new UnitAgentError('not_found', `Bot not found: ${slug}`);
  clearUnitAgentsCache();
  return (await getUnitAgent(slug)) as UnitAgent;
}

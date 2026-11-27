/**
 * Bot registry (multi-bot per Unit, PR 1): the bots that live inside this
 * Unit, stored in `unit_agents` (migration 158).
 *
 * A bot's slug is the key the existing `domain_slug` columns already carry.
 * The default bot (slug `chat`) is the Unit's existing single agent: its
 * identity, instructions and tool settings are resolved from `unit_profile`,
 * never copied, so the two cannot drift.
 *
 * Pure and DB-free. See docs/roadmap/multi-bot-per-unit.md.
 */
import { z } from 'zod';
import type { UnitProfile } from '@/federation/unit-profile';
import {
  agentToolSettingsInputSchema,
  normalizeAgentToolSettings,
  type AgentToolSettings,
} from './agent-tool-settings';

export const DEFAULT_AGENT_SLUG = 'chat';
export const MAX_AGENT_INSTRUCTIONS_CHARS = 8_000;
export const MEMORY_MODES = ['isolated', 'none'] as const;
export type MemoryMode = (typeof MEMORY_MODES)[number];

export const AGENT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Slugs a bot may never take: every legacy domain slug (they already own rows
 * in `domain_slug` columns and per-domain routes), top-level app routes, and
 * words the agents UI uses in `/agents/self/<slug>`. The repository also
 * rejects any slug present in the `domains` table at creation time.
 */
export const RESERVED_AGENT_SLUGS: ReadonlySet<string> = new Set([
  // default bot and agents UI
  'chat', 'agent', 'agents', 'self', 'new', 'edit', 'settings', 'default', 'all', 'none',
  // legacy domains (migrations 034-082 and later)
  'alleracweb', 'benchmark', 'bridge', 'channels', 'code', 'design', 'email', 'health', 'jobs',
  'learn', 'memory', 'music', 'notes', 'openworld', 'robot-assistant', 'sales', 'search',
  'social', 'space', 'tickets',
  // top-level app routes
  'admin', 'api', 'cli', 'connections', 'docs', 'domains', 'hub', 'join', 'login', 'logs',
  'reset-password', 'terminal', 'workspace',
]);

export type SlugProblem = 'invalid_format' | 'reserved';

/** Null when the slug may be used for a new bot. */
export function slugProblem(slug: string): SlugProblem | null {
  if (!AGENT_SLUG_PATTERN.test(slug)) return 'invalid_format';
  if (RESERVED_AGENT_SLUGS.has(slug)) return 'reserved';
  return null;
}

/** A stored `unit_agents` row, camel-cased. Identity fields are raw (may be null on the default bot). */
export interface UnitAgentRow {
  id: string;
  slug: string;
  displayName: string | null;
  emoji: string | null;
  avatarUrl: string | null;
  role: string | null;
  description: string | null;
  instructions: string | null;
  isDefault: boolean;
  enabled: boolean;
  sortOrder: number;
  toolSettings: AgentToolSettings;
  memoryMode: MemoryMode;
  canCall: string[];
  modelId: string | null;
  modelProvider: string | null;
  cloudAllowed: boolean;
  defaultSkillId: string | null;
  federationExposed: boolean;
  template: string | null;
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** An effective bot: identity resolved (from the Unit profile for the default bot). */
export interface UnitAgent extends Omit<UnitAgentRow, 'displayName'> {
  displayName: string;
}

const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/**
 * The default bot built from the Unit profile alone. Used when its row is
 * missing or the table is not migrated yet, so chat never breaks.
 */
export function defaultAgentFromProfile(profile: UnitProfile, toolSettings: AgentToolSettings): UnitAgent {
  return {
    id: '',
    slug: DEFAULT_AGENT_SLUG,
    displayName: profile.displayName,
    emoji: profile.emoji,
    avatarUrl: null,
    role: profile.role,
    description: profile.description,
    instructions: profile.instructions,
    isDefault: true,
    enabled: true,
    sortOrder: 0,
    toolSettings,
    memoryMode: 'isolated',
    canCall: [],
    modelId: null,
    modelProvider: null,
    cloudAllowed: true,
    defaultSkillId: null,
    federationExposed: false,
    template: null,
    archivedAt: null,
    createdAt: null,
    updatedAt: null,
  };
}

/**
 * Effective bot from its row. The default bot takes identity, instructions
 * and tool settings from the Unit profile; its row only adds management
 * fields (id, order, model, timestamps).
 */
export function resolveUnitAgent(
  row: UnitAgentRow,
  profile: UnitProfile,
  unitToolSettings: AgentToolSettings,
): UnitAgent {
  if (row.isDefault) {
    const base = defaultAgentFromProfile(profile, unitToolSettings);
    return {
      ...row,
      displayName: base.displayName,
      emoji: base.emoji,
      role: base.role,
      description: base.description,
      instructions: base.instructions,
      toolSettings: base.toolSettings,
      enabled: true,
      archivedAt: null,
    };
  }
  return { ...row, displayName: clean(row.displayName) ?? row.slug };
}

/** Active bots first by sort order, then by creation; the default bot always leads. */
export function sortUnitAgents<T extends Pick<UnitAgent, 'isDefault' | 'sortOrder' | 'createdAt' | 'slug'>>(agents: T[]): T[] {
  return [...agents].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    const at = a.createdAt ?? '';
    const bt = b.createdAt ?? '';
    if (at !== bt) return at < bt ? -1 : 1;
    return a.slug.localeCompare(b.slug);
  });
}

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const slugSchema = z.string().regex(AGENT_SLUG_PATTERN);

/** Fields every bot may set. The default bot only accepts the management subset (see below). */
const editableFields = {
  displayName: z.string().trim().min(1).max(100).optional(),
  emoji: optionalText(16),
  avatarUrl: z.string().trim().url().max(2000).nullable().optional(),
  role: optionalText(200),
  description: optionalText(1000),
  instructions: optionalText(MAX_AGENT_INSTRUCTIONS_CHARS),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().min(-10_000).max(10_000).optional(),
  toolSettings: agentToolSettingsInputSchema.optional(),
  memoryMode: z.enum(MEMORY_MODES).optional(),
  canCall: z.array(slugSchema).max(50).optional(),
  modelId: optionalText(200),
  modelProvider: optionalText(50),
  cloudAllowed: z.boolean().optional(),
  defaultSkillId: z.string().uuid().nullable().optional(),
  federationExposed: z.boolean().optional(),
};

export const createUnitAgentSchema = z.object({
  slug: slugSchema,
  ...editableFields,
  displayName: z.string().trim().min(1).max(100),
  template: z.string().regex(AGENT_SLUG_PATTERN).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  const problem = slugProblem(value.slug);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['slug'], message: problem });
  if (value.canCall?.includes(value.slug)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['canCall'], message: 'A bot cannot call itself' });
  }
});
export type CreateUnitAgentInput = z.infer<typeof createUnitAgentSchema>;

/** Slug is immutable: it is not part of the update input. */
export const updateUnitAgentSchema = z.object(editableFields).strict();
export type UpdateUnitAgentInput = z.infer<typeof updateUnitAgentSchema>;

/**
 * Fields of the default bot that live on `unit_profile` (edited in the Unit
 * profile / Agent settings) or that must stay fixed (enabled).
 */
export const DEFAULT_AGENT_LOCKED_FIELDS = [
  'displayName', 'emoji', 'avatarUrl', 'role', 'description', 'instructions', 'toolSettings', 'enabled',
] as const satisfies readonly (keyof UpdateUnitAgentInput)[];

/** Locked fields an update tries to change on the default bot (empty when the update is allowed). */
export function lockedDefaultAgentFields(input: UpdateUnitAgentInput): string[] {
  return DEFAULT_AGENT_LOCKED_FIELDS.filter((field) => input[field] !== undefined);
}

/** Normalizes the stored JSONB tool settings of a bot. */
export function toolSettingsFromDb(value: unknown): AgentToolSettings {
  return normalizeAgentToolSettings(value ?? {});
}

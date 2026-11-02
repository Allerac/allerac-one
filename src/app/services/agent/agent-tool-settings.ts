/**
 * Agent tool settings (simplification phase 3a): which capabilities the
 * local `chat` agent gets. A capability is either an optional module (capped
 * by ALLERAC_MODULES / ALLERAC_PROFILE) or a core feature (notes, memory,
 * jobs, tickets). Each one owns tools and skills that can also be turned off
 * one by one.
 *
 * Pure and DB-free. Local only: settings are never sent to paired Units.
 */
import { z } from 'zod';
import { getEnabledModules } from '@/modules/registry';

type Env = Record<string, string | undefined>;

export interface AgentCapability {
  id: string;
  label: string;
  kind: 'module' | 'core';
  /** Tool names (LLM function names) owned by the capability. */
  tools: string[];
  /** Skill names (skills.name) owned by the capability. */
  skills: string[];
  defaultEnabled: boolean;
}

export interface AgentToolSettings {
  modules: Record<string, boolean>;
  tools: Record<string, boolean>;
  skills: Record<string, boolean>;
}

export const EMPTY_AGENT_TOOL_SETTINGS: AgentToolSettings = { modules: {}, tools: {}, skills: {} };

/**
 * Modules with many tools (or write access to third-party accounts) start
 * off, to keep the prompt small. The owner turns them on in Settings.
 */
export const HEAVY_MODULE_IDS = ['music', 'social'];

/** Core capabilities. Their tools used to be offered only in their own domain. */
export const CORE_CAPABILITIES: readonly AgentCapability[] = [
  {
    id: 'notes', label: 'Notes', kind: 'core', defaultEnabled: true, skills: ['notes'],
    tools: ['save_note', 'query_vault', 'list_notes', 'delete_note', 'update_note', 'get_note', 'list_children'],
  },
  {
    id: 'memory', label: 'Memory management', kind: 'core', defaultEnabled: true, skills: ['memory'],
    tools: ['search_memory', 'delete_memory'],
  },
  {
    id: 'jobs', label: 'Scheduled jobs', kind: 'core', defaultEnabled: true, skills: [],
    tools: ['list_jobs', 'create_job', 'update_job', 'delete_job', 'toggle_job'],
  },
  {
    id: 'tickets', label: 'Tickets', kind: 'core', defaultEnabled: false, skills: ['tickets'],
    tools: ['list_tickets', 'create_ticket', 'update_ticket_status', 'get_ticket'],
  },
];

const KEY = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const toggles = z.record(z.string().regex(KEY), z.boolean()).optional();

export const agentToolSettingsInputSchema = z.object({
  modules: toggles,
  tools: toggles,
  skills: toggles,
}).strict();
export type AgentToolSettingsInput = z.infer<typeof agentToolSettingsInputSchema>;

function skillName(file: string): string {
  return file.replace(/\.md$/, '');
}

/** Capabilities this Unit can offer: core plus personal modules enabled by ALLERAC_MODULES. */
export function listAgentCapabilities(env: Env = process.env): AgentCapability[] {
  const modules = getEnabledModules(env)
    .filter((module) => module.group === 'personal' && module.tools.length > 0)
    .map((module): AgentCapability => ({
      id: module.id,
      label: module.nav[0]?.name ?? module.id,
      kind: 'module',
      tools: [...module.tools],
      skills: module.skills.map(skillName),
      defaultEnabled: !HEAVY_MODULE_IDS.includes(module.id),
    }));
  return [...modules, ...CORE_CAPABILITIES];
}

/** Drops unknown keys and non-boolean values (e.g. from an old or edited DB row). */
export function normalizeAgentToolSettings(raw: unknown, env: Env = process.env): AgentToolSettings {
  const capabilities = listAgentCapabilities(env);
  const known = {
    modules: new Set(capabilities.map((c) => c.id)),
    tools: new Set(capabilities.flatMap((c) => c.tools)),
    skills: new Set(capabilities.flatMap((c) => c.skills)),
  };
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const pick = (key: keyof AgentToolSettings): Record<string, boolean> => {
    const value = source[key];
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([name, enabled]) => known[key].has(name) && typeof enabled === 'boolean')) as Record<string, boolean>;
  };
  return { modules: pick('modules'), tools: pick('tools'), skills: pick('skills') };
}

export function isCapabilityEnabled(capability: AgentCapability, settings: AgentToolSettings): boolean {
  return settings.modules[capability.id] ?? capability.defaultEnabled;
}

export interface ResolvedAgentToolAccess {
  /** Tools the agent may use (capability on and tool not turned off). */
  enabledTools: Set<string>;
  /** Tools owned by a capability that are off (capability or tool toggle). */
  disabledTools: Set<string>;
  /** Skills owned by a capability that are off. */
  disabledSkills: Set<string>;
}

export function resolveAgentToolAccess(settings: AgentToolSettings, env: Env = process.env): ResolvedAgentToolAccess {
  const enabledTools = new Set<string>();
  const disabledTools = new Set<string>();
  const disabledSkills = new Set<string>();
  for (const capability of listAgentCapabilities(env)) {
    const on = isCapabilityEnabled(capability, settings);
    for (const tool of capability.tools) {
      if (on && settings.tools[tool] !== false) enabledTools.add(tool);
      else disabledTools.add(tool);
    }
    for (const skill of capability.skills) {
      if (!on || settings.skills[skill] === false) disabledSkills.add(skill);
    }
  }
  // Tools of modules turned off by ALLERAC_MODULES are already absent from the registry.
  return { enabledTools, disabledTools, disabledSkills };
}

/** Settings plus the catalog, for the admin UI. */
export function describeAgentToolSettings(settings: AgentToolSettings, env: Env = process.env) {
  return {
    settings,
    capabilities: listAgentCapabilities(env).map((capability) => ({
      ...capability,
      enabled: isCapabilityEnabled(capability, settings),
    })),
  };
}

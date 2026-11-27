import { skillsService } from '@/app/services/skills/skills.service';
import { EMAIL_TOOL_DEFINITIONS } from '@/app/tools/email.tool';
import { GITHUB_TOOL_NAMES } from '@/app/tools/github.tool.definitions';
import { LOGS_TOOL_NAMES } from '@/app/tools/logs.tool.definitions';
import {
  BOT_CREATE_MEMORY_TOOL_DEFINITION,
  CREATE_MEMORY_TOOL_DEFINITION,
  MEMORY_DOMAIN_TOOL_DEFINITIONS,
  RECALL_MEMORY_TOOL_DEFINITION,
  SEARCH_KNOWLEDGE_TOOL_DEFINITION,
} from '@/app/tools/memory.tool.definitions';
import { JOBS_TOOL_DEFINITIONS, SCHEDULE_TASK_TOOL_DEFINITION } from '@/app/tools/jobs.tool';
import { NOTES_TOOL_DEFINITIONS } from '@/app/tools/notes.tool';
import { TICKETS_TOOL_DEFINITIONS } from '@/app/tools/tickets.tool';
import { TOOLS } from '@/app/tools/tools';
import { filterEnabledTools } from '@/modules/registry';
import { LEARN_INSTRUCTION_TOOL_DEFINITION } from '@/app/tools/instructions.tool.definitions';
import { SHELL_TOOL_NAMES, withoutShellTools } from '@/app/lib/shell-policy';
import { FEDERATION_TOOL_DEFINITIONS, FEDERATION_TOOL_NAMES } from '@/app/tools/federation.tool.definitions';
import { ASK_AGENT_TOOL_DEFINITION, MANAGER_TOOL_NAMES } from '@/app/tools/manager.tool.definitions';
import { resolveAgentToolAccess, type AgentToolSettings } from '@/app/services/agent/agent-tool-settings';
import { loadAgentToolSettings } from '@/app/services/agent/agent-tool-settings.repository';

/** Domain of the local agent: it gets the tools of every enabled capability (phase 3a). */
export const AGENT_DOMAIN = 'chat';

export { GITHUB_TOOL_NAMES };
export { LOGS_TOOL_NAMES };

export const NOTE_TOOL_NAMES = ['save_note', 'query_vault', 'list_notes', 'delete_note', 'update_note', 'get_note', 'list_children'];
export const EMAIL_TOOL_NAMES = ['list_emails', 'read_email', 'send_email'];
export const JOB_TOOL_NAMES = ['list_jobs', 'create_job', 'update_job', 'delete_job', 'toggle_job'];
export const SCHEDULE_TASK_TOOL_NAME = 'schedule_task';
export const LEARN_INSTRUCTION_TOOL_NAME = 'learn_instruction';
export const TICKET_TOOL_NAMES = ['list_tickets', 'create_ticket', 'update_ticket_status', 'get_ticket'];
export const MEMORY_TOOL_NAMES = ['recall_memory', 'search_memory', 'create_memory', 'delete_memory', 'search_knowledge'];

const DOMAIN_TOOL_NAMES = [
  ...NOTE_TOOL_NAMES,
  ...EMAIL_TOOL_NAMES,
  ...JOB_TOOL_NAMES,
  ...TICKET_TOOL_NAMES,
];

// Public-facing domains (reached by a service account with no personal data
// access, e.g. the website (allerac.ai) chat widget) that must not get the personal
// notes vault, even though every other domain does by default below. Also
// used outside this file (e.g. the messages route) to apply extra abuse
// limits — anonymous website visitors get less trust than logged-in users.
export { PUBLIC_DOMAINS } from './public-domains';
import { PUBLIC_DOMAINS } from './public-domains';

// Domains that must get literally zero tools, not just the domain/personal
// ones withheld from every PUBLIC_DOMAINS entry below. Deliberately NOT
// implemented via an empty skill_tools list for the domain's skill — an
// empty list means "unrestricted" (falls through to the full general-
// purpose TOOLS array, including execute_shell), not "no tools". See
// docs/domains/expose-agent-to-website.md ("Tool scoping is deny-by-default
// in intent, not in code").
//
// openworld used to be here (FAQ-answering only), but now has search_web
// explicitly granted via skill_tools (migration 130_openworld_search_web_tool.sql)
// so it can look up current foreign-trade news — still no create_ticket/lead-capture
// equivalent; visitors are told to reach out via WhatsApp/e-mail directly instead
// (see skills/openworld.md).
export const NO_TOOL_DOMAINS: string[] = [];

// Tools that must never be reachable from a PUBLIC_DOMAINS conversation, no
// matter who owns the calling account or what the domain's skill_tools say:
// executor-backed shell tools, GitHub write/read with the system token, and
// the process-wide log buffer. Guards against the "admin bypass trap"
// (docs/domains/expose-agent-to-website.md): an admin-owned bot key, or an
// empty skill_tools list falling through to TOOLS, must not hand a website
// visitor a shell or repo access.
export const PUBLIC_DOMAIN_FORBIDDEN_TOOL_NAMES = [
  ...SHELL_TOOL_NAMES,
  ...GITHUB_TOOL_NAMES,
  ...LOGS_TOOL_NAMES,
  ...FEDERATION_TOOL_NAMES,
  ...MANAGER_TOOL_NAMES,
];

export { FEDERATION_TOOL_NAMES, MANAGER_TOOL_NAMES };

/**
 * 'federated': the request comes from a paired Unit (federation P3). The peer
 * must not get shell/GitHub/logs, must not durably change this Unit (memory,
 * instructions, schedules), and must not call other Units through us.
 *
 * 'consult': the Manager (default agent) consults a bot (multi-bot PR 7). The
 * bot keeps its own capabilities but only the read tools below: it answers,
 * and never saves, sends, schedules or calls anyone.
 */
export type ChatToolPolicy = 'default' | 'federated' | 'consult';

export const FEDERATED_FORBIDDEN_TOOL_NAMES = [
  ...PUBLIC_DOMAIN_FORBIDDEN_TOOL_NAMES,
  'create_memory',
  'delete_memory',
  'schedule_task',
  'learn_instruction',
];

/** Allowlist (fails closed): a tool missing here is not offered to a consulted bot. */
export const CONSULT_ALLOWED_TOOL_NAMES = [
  'get_today_info', 'search_web', 'read_url',
  'recall_memory', 'search_memory', 'search_knowledge',
  'query_vault', 'list_notes', 'get_note', 'list_children',
  'list_emails', 'read_email',
  'list_jobs', 'list_tickets', 'get_ticket',
  'get_health_summary', 'get_health_metrics', 'get_daily_snapshot', 'get_recent_activities',
  'get_activity_detail', 'get_garmin_status',
  'get_spotify_status', 'get_top_tracks', 'get_listening_stats', 'get_playlists', 'get_playlist_tracks',
  'get_music_recommendations',
  'instagram_get_profile', 'instagram_get_recent_posts',
];

export function isToolForbiddenByPolicy(toolName: string, policy: ChatToolPolicy | undefined): boolean {
  if (policy === 'consult') return !CONSULT_ALLOWED_TOOL_NAMES.includes(toolName);
  return policy === 'federated'
    && (FEDERATED_FORBIDDEN_TOOL_NAMES.includes(toolName) || MANAGER_TOOL_NAMES.includes(toolName));
}

/**
 * The Manager tools (`ask_agent`) go to the default agent of an admin only:
 * never to a bot, a legacy domain, a public domain or a federated/consult turn.
 * The caller also checks ALLERAC_BOTS and that runnable bots exist.
 */
export function canUseManagerTools(params: {
  isAdmin: boolean;
  domain: string | null | undefined;
  policy?: ChatToolPolicy;
}): boolean {
  return params.isAdmin
    && (params.domain ?? AGENT_DOMAIN) === AGENT_DOMAIN
    && (params.policy === undefined || params.policy === 'default');
}

/** Federation tools are admin-only and never offered to public domains or federated requests. */
export function canUseFederationTools(params: {
  isAdmin: boolean;
  domain: string | null | undefined;
  policy?: ChatToolPolicy;
}): boolean {
  const domain = params.domain ?? 'chat';
  return params.isAdmin
    && (params.policy === undefined || params.policy === 'default')
    && !PUBLIC_DOMAINS.includes(domain)
    && !NO_TOOL_DOMAINS.includes(domain);
}

export function isToolForbiddenInDomain(toolName: string, domain: string | null | undefined): boolean {
  return PUBLIC_DOMAINS.includes(domain ?? '') && PUBLIC_DOMAIN_FORBIDDEN_TOOL_NAMES.includes(toolName);
}

export interface ResolveChatToolsOptions {
  /**
   * Whether executor-backed tools (execute_shell, edit_file) may be offered.
   * Fails closed: callers must pass `true` explicitly, after checking
   * `isShellAllowedFor(user)`.
   */
  allowShell?: boolean;
  /** Tool policy; 'federated' strips tools a paired Unit must not reach. */
  toolPolicy?: ChatToolPolicy;
  /** Offer federation tools (caller checked admin + active peers). Fails closed. */
  allowFederation?: boolean;
  /**
   * Agent tool settings for the `chat` agent. Loaded from the DB when omitted.
   * Ignored by every other domain.
   */
  agentToolSettings?: AgentToolSettings;
  /**
   * The domain is a non-default bot (multi-bot PR 2). It is assembled like
   * the `chat` agent, with `agentToolSettings` (the bot's explicit settings,
   * required) and never with federation tools.
   */
  bot?: boolean;
  /**
   * Offer the Manager tools (`ask_agent`, multi-bot PR 7) to the default
   * agent. The caller checked `canUseManagerTools`, ALLERAC_BOTS and that
   * bots exist. Fails closed; ignored for bots and every other domain.
   */
  allowManager?: boolean;
}

function applyPolicy<T extends { function: { name: string } }>(tools: T[], policy: ChatToolPolicy | undefined): T[] {
  return policy === 'federated' || policy === 'consult'
    ? tools.filter((tool) => !isToolForbiddenByPolicy(tool.function.name, policy))
    : tools;
}

export async function resolveChatTools(
  skillId: string | null | undefined,
  domain: string,
  options: ResolveChatToolsOptions = {},
): Promise<any[]> {
  // alleracweb is deliberately text-only. Check the domain before querying its
  // skill: missing tool rows must not fall through to the unrestricted base
  // registry below.
  if (domain === 'alleracweb') {
    return [];
  }

  if (NO_TOOL_DOMAINS.includes(domain)) {
    return [];
  }

  let tools: any[] = TOOLS;
  let skillRestricted: string[] | null = null;

  if (skillId) {
    const allowedToolNames = await skillsService.getSkillTools(skillId);
    if (allowedToolNames.length > 0) {
      tools = TOOLS.filter((tool) => allowedToolNames.includes(tool.function.name));
      skillRestricted = allowedToolNames;
    }
  }

  if (options.allowShell !== true) {
    tools = withoutShellTools(tools);
  }
  if (PUBLIC_DOMAINS.includes(domain)) {
    tools = tools.filter((tool) => !isToolForbiddenInDomain(tool.function.name, domain));
  }

  if (options.bot === true) {
    if (!options.agentToolSettings) throw new Error('Bot tool assembly needs the bot tool settings');
    const resolved = filterEnabledTools(resolveAgentTools(tools, options.agentToolSettings, skillRestricted, {
      ...options,
      allowFederation: false,
    }));
    return applyPolicy(resolved, options.toolPolicy);
  }

  if (domain === AGENT_DOMAIN) {
    const settings = options.agentToolSettings ?? await loadAgentToolSettings();
    const resolved = filterEnabledTools(resolveAgentTools(tools, settings, skillRestricted, options));
    const manager = options.allowManager === true && canUseManagerTools({ isAdmin: true, domain, policy: options.toolPolicy })
      ? [ASK_AGENT_TOOL_DEFINITION]
      : [];
    return applyPolicy([...resolved, ...manager], options.toolPolicy);
  }

  const resolved = filterEnabledTools([
    ...tools.filter((tool) => !DOMAIN_TOOL_NAMES.includes(tool.function.name)
      && !['recall_memory', 'create_memory', 'search_knowledge'].includes(tool.function.name)),
    // Memory, scheduling, and self-instruction tools are otherwise unconditional across every
    // domain — withheld here for public-facing domains (no personal memory/automation access,
    // and learn_instruction in particular would let a visitor durably alter the agent's behavior).
    ...(PUBLIC_DOMAINS.includes(domain) ? [] : [
      RECALL_MEMORY_TOOL_DEFINITION,
      SEARCH_KNOWLEDGE_TOOL_DEFINITION,
      CREATE_MEMORY_TOOL_DEFINITION,
      SCHEDULE_TASK_TOOL_DEFINITION,
      LEARN_INSTRUCTION_TOOL_DEFINITION,
      ...NOTES_TOOL_DEFINITIONS,
    ]),
    ...(domain === 'memory' ? MEMORY_DOMAIN_TOOL_DEFINITIONS : []),
    ...(domain === 'email' ? EMAIL_TOOL_DEFINITIONS : []),
    ...(domain === 'jobs' ? JOBS_TOOL_DEFINITIONS : []),
    ...(domain === 'tickets' ? TICKETS_TOOL_DEFINITIONS : []),
    ...(options.allowFederation === true && !PUBLIC_DOMAINS.includes(domain) && options.toolPolicy !== 'federated'
      ? FEDERATION_TOOL_DEFINITIONS
      : []),
  ]);

  return applyPolicy(resolved, options.toolPolicy);
}

type ToolDefinition = { function: { name: string } };

/**
 * Tool assembly for the `chat` agent: the general tools (already filtered by
 * the active skill and shell policy), plus the tools of every capability that
 * is on in the agent settings. Module tools are already capped by
 * ALLERAC_MODULES. When the active skill lists its tools, capability tools
 * outside that list are left out too, to keep the prompt small.
 */
function resolveAgentTools<T extends ToolDefinition>(
  baseTools: T[],
  settings: AgentToolSettings,
  skillRestricted: string[] | null,
  options: ResolveChatToolsOptions,
): ToolDefinition[] {
  const access = resolveAgentToolAccess(settings);
  // Notes were offered in every private domain regardless of the skill; keep that.
  const offered = (name: string) => access.enabledTools.has(name)
    && (skillRestricted === null || skillRestricted.includes(name) || NOTE_TOOL_NAMES.includes(name));
  const capabilityTools = [
    ...NOTES_TOOL_DEFINITIONS,
    ...MEMORY_DOMAIN_TOOL_DEFINITIONS,
    ...EMAIL_TOOL_DEFINITIONS,
    ...JOBS_TOOL_DEFINITIONS,
    ...TICKETS_TOOL_DEFINITIONS,
  ];
  // A paired Unit keeps the reach it had before phase 3a: notes only, never
  // email, job management, tickets or memory management of this Unit.
  const peerCapabilityTools = options.toolPolicy === 'federated' ? NOTES_TOOL_DEFINITIONS : capabilityTools;
  const capabilityNames = new Set(capabilityTools.map((tool) => tool.function.name));
  const alwaysOn = [
    RECALL_MEMORY_TOOL_DEFINITION,
    SEARCH_KNOWLEDGE_TOOL_DEFINITION,
    options.bot === true ? BOT_CREATE_MEMORY_TOOL_DEFINITION : CREATE_MEMORY_TOOL_DEFINITION,
    SCHEDULE_TASK_TOOL_DEFINITION,
    LEARN_INSTRUCTION_TOOL_DEFINITION,
  ];
  const alwaysOnNames = new Set(alwaysOn.map((tool) => tool.function.name));

  const general = baseTools.filter((tool) => {
    const name = tool.function.name;
    if (alwaysOnNames.has(name) || capabilityNames.has(name) || DOMAIN_TOOL_NAMES.includes(name)) return false;
    // Module tools living in TOOLS (health, music, social): drop them when their capability is off.
    return !access.disabledTools.has(name);
  });
  const seen = new Set<string>();
  const extra = peerCapabilityTools.filter((tool) => {
    const name = tool.function.name;
    if (seen.has(name) || !offered(name)) return false;
    seen.add(name);
    return true;
  });

  return [
    ...general,
    ...alwaysOn,
    ...extra,
    ...(options.allowFederation === true && options.toolPolicy !== 'federated' ? FEDERATION_TOOL_DEFINITIONS : []),
  ];
}

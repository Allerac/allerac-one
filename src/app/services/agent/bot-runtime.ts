/**
 * Bot-aware chat runtime (multi-bot per Unit, PR 2).
 *
 * Turns a request slug into the bot a chat turn runs as, and derives what
 * that bot may do: tool settings (explicit opt-in), soul identity and model.
 * Everything is behind `ALLERAC_BOTS=true`; with the flag off, or for the
 * default bot (`chat`), callers keep their existing code path untouched.
 *
 * See docs/roadmap/multi-bot-per-unit.md.
 */
import type { SoulIdentity } from '@/app/config/allerac-soul';
import { MODELS } from '@/app/services/llm/models';
import type { UnitProfile } from '@/federation/unit-profile';
import { PUBLIC_DOMAINS } from '@/app/services/chat/public-domains';
import {
  isCapabilityEnabled,
  listAgentCapabilities,
  type AgentToolSettings,
} from './agent-tool-settings';
import { DEFAULT_AGENT_SLUG, type UnitAgent } from './unit-agents';

type Env = Record<string, string | undefined>;

/** Feature flag. Public Units never turn it on (their profiles leave it unset). */
export function botsEnabled(env: Env = process.env): boolean {
  return env.ALLERAC_BOTS === 'true';
}

/** Whether `slug` should be looked up as a non-default bot at all. */
export function isCandidateBotSlug(slug: string | null | undefined, env: Env = process.env): slug is string {
  return botsEnabled(env) && !!slug && slug !== DEFAULT_AGENT_SLUG && !PUBLIC_DOMAINS.includes(slug);
}

/** A non-default bot that can take a turn right now. */
export function isRunnableBot(agent: UnitAgent | null | undefined): agent is UnitAgent {
  return !!agent && !agent.isDefault && agent.enabled && !agent.archivedAt;
}

/**
 * A bot sees only the capabilities the owner checked for it: every
 * capability missing from its settings counts as off, whatever the Unit-wide
 * default is. The default bot keeps the Unit's defaults (it does not go
 * through this).
 */
export function explicitBotToolSettings(settings: AgentToolSettings, env: Env = process.env): AgentToolSettings {
  const modules: Record<string, boolean> = {};
  for (const capability of listAgentCapabilities(env)) {
    modules[capability.id] = settings.modules[capability.id] === true;
  }
  return { modules, tools: { ...settings.tools }, skills: { ...settings.skills } };
}

/** Capability ids that are on for a bot (used for capability-aware soul guidance). */
export function enabledBotCapabilities(settings: AgentToolSettings, env: Env = process.env): string[] {
  const explicit = explicitBotToolSettings(settings, env);
  return listAgentCapabilities(env)
    .filter((capability) => isCapabilityEnabled(capability, explicit))
    .map((capability) => capability.id);
}

/**
 * Soul identity of a bot. The bot speaks as itself and names the Unit it
 * belongs to. Siblings are listed only for bots in its `canCall` allowlist.
 */
export function botSoulIdentity(
  bot: UnitAgent,
  profile: UnitProfile,
  siblings: UnitAgent[] = [],
  env: Env = process.env,
): SoulIdentity {
  const allowed = new Set(bot.canCall);
  return {
    displayName: bot.displayName,
    role: bot.role,
    description: bot.description,
    instructions: bot.instructions,
    unitDisplayName: profile.displayName,
    capabilities: enabledBotCapabilities(bot.toolSettings, env),
    siblings: siblings
      .filter((sibling) => allowed.has(sibling.slug) && isRunnableBot(sibling))
      .map((sibling) => ({ name: sibling.displayName, role: sibling.role })),
  };
}

export class BotModelError extends Error {
  constructor(public readonly code: 'unknown_model' | 'cloud_not_allowed', message: string) {
    super(message);
    this.name = 'BotModelError';
  }
}

export interface BotModelChoice {
  modelId: string;
  provider: string;
}

/**
 * The model a bot turn uses: the bot's own model when set, otherwise the
 * already-resolved one. A bot with `cloudAllowed = false` never runs on a
 * cloud provider: the turn fails instead of silently sending the prompt out.
 */
export function resolveBotModel(bot: UnitAgent, resolved: BotModelChoice): BotModelChoice {
  let choice = resolved;
  if (bot.modelId) {
    const model = MODELS.find((entry) => entry.id === bot.modelId);
    if (!model) throw new BotModelError('unknown_model', `Model ${bot.modelId} configured for ${bot.displayName} is not available`);
    choice = { modelId: model.id, provider: model.provider };
  }
  if (!bot.cloudAllowed && choice.provider !== 'ollama') {
    throw new BotModelError('cloud_not_allowed', `${bot.displayName} only runs on local models. Pick a local model for it in its settings.`);
  }
  return choice;
}

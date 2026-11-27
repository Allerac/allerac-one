/**
 * Allerac Soul — base system prompt + domain-specific addenda.
 *
 * Use buildSoul(domainSlug) to get the right prompt for a given domain.
 * ALLERAC_SOUL is the lean base — safe to use when domain is unknown (agents, workers).
 */

export const ALLERAC_SOUL = `You are Allerac, a private AI assistant. You run on the user's own infrastructure — their data never leaves their control.

Be helpful, direct, and honest. Lead with the answer, add context only when it helps. Use markdown (code blocks, lists, headers) when it improves readability — skip it for simple replies.

## Using your tools

You have tools — use them instead of giving instructions to the user.

- **At the start of every conversation**: call \`get_today_info\` to know the current date and time before answering anything time-sensitive.
- When asked about current information — weather, news, prices, recent events: use \`search_web\`. Synthesize from multiple sources — provide details and context, don't just summarize.
- When asked about health or fitness: use the health tools.
- When the user states a durable preference, correction, recurring constraint, or standing rule: call \`learn_instruction\` immediately. Do not use it for one-off requests or temporary facts.
- For everything else (questions, summaries, analysis, translation, math, explanations): answer directly in the chat.

If unsure about a fact, say so rather than guessing. Adapt your tone and language to the user.`;

const PUBLIC_AGENT_SOUL = `You are Allerac, an AI assistant speaking with a visitor on a public website.

Be helpful, direct, and honest. Lead with the answer and add context only when it helps. Never claim to have saved, scheduled, retrieved, or changed anything unless a capability supplied in this conversation actually completed that action. If a capability is unavailable, say so plainly.`;

const ALLERAC_CODE_ADDENDUM = `## Shell environment

You have access to a real Linux shell via \`execute_shell\`. Use it instead of explaining commands to the user.

- Run anything: reading files, creating projects, installing packages, running scripts
- When reading a directory, use find with type filters: find /path -type f \\( -name '*.ts' -o -name '*.md' \\) | xargs -I {} sh -c 'echo "=== {} ==="; cat "{}"'
- Write files with heredoc: cat > file.js << 'EOF' ... EOF — never use echo with single quotes for multi-line content
- Use npm init + npm install instead of npx scaffolding tools
- If a command fails, read the error and fix it automatically — don't ask the user
- Projects go in /workspace/projects/. Always mkdir -p the folder first.
- **The executor is sandboxed.** Servers you start are NOT accessible from the user's browser. After creating a project, tell the user the file path and how to run it locally.`;

/**
 * Unit identity & role (federation P3.5), already resolved by the caller.
 * Callers pass it only when it applies to the domain (public domains need the
 * admin opt-in), so buildSoul stays synchronous and DB-free.
 */
export interface SoulIdentity {
  displayName: string;
  role?: string | null;
  description?: string | null;
  /** Short description of the current domain's agent, when set by the admin. */
  agentDescription?: string | null;
  /** Owner-written agent instructions (unit_profile.instructions); local only. */
  instructions?: string | null;
  /**
   * Display labels of active paired Units (e.g. "Santos (santos)"). Only set
   * when federation tools are offered (admin, private domains); never rendered
   * in public domains.
   */
  pairedUnits?: string[];
  /**
   * Set only for a non-default bot (multi-bot PR 2): the Unit's display name.
   * The bot then introduces itself as one of the Unit's assistants.
   */
  unitDisplayName?: string;
  /**
   * Capability ids that are on for this bot. When set, tool guidance for an
   * absent capability (e.g. health) is left out. Undefined keeps today's text.
   */
  capabilities?: string[];
  /** Other bots of the Unit this bot may point the user to (its `canCall` list). */
  siblings?: Array<{ name: string; role?: string | null }>;
  /**
   * Set only for the default agent when it is the Manager (multi-bot PR 7,
   * ask_agent offered): the bots it can consult.
   */
  managedBots?: Array<{ id: string; name: string; emoji?: string | null; role?: string | null }>;
}

const HEALTH_GUIDANCE_LINE = '- When asked about health or fitness: use the health tools.\n';

const ALLERAC_OPENING = 'You are Allerac, a private AI assistant.';
const PUBLIC_OPENING = 'You are Allerac, an AI assistant speaking with a visitor on a public website.';

function pairedUnitsLine(identity: SoulIdentity): string {
  const units = (identity.pairedUnits ?? []).filter(Boolean).slice(0, 10);
  if (units.length === 0) return '';
  return ` Paired Allerac Units you can contact: ${units.join(', ')}. When the user mentions one of them by name, it means that Unit: use list_peer_agents to see its role and agents, and ask_peer_agent to consult it.`;
}

function managerLine(identity: SoulIdentity): string {
  const bots = (identity.managedBots ?? []).slice(0, 20);
  if (bots.length === 0) return '';
  const list = bots.map((bot) => {
    const name = bot.emoji ? `${bot.emoji} ${bot.name}` : bot.name;
    return `${name} (id "${bot.id}"${bot.role ? `, takes care of ${bot.role}` : ''})`;
  }).join('; ');
  return ` You are also the manager of this Unit's assistants: ${list}. When a question falls in one of their roles, consult it with ask_agent (one call per assistant, combine their answers when several apply) and say which assistant answered. The assistants never talk to each other; everything goes through you. The user can also talk to any of them directly.`;
}

function identityLines(identity: SoulIdentity): string {
  const lines: string[] = [];
  if (identity.role) lines.push(`Role: you take care of ${identity.role}.`);
  if (identity.description) lines.push(identity.description);
  if (identity.agentDescription) lines.push(`In this conversation: ${identity.agentDescription}`);
  lines.push(identity.role
    ? `When asked who you are, say you are ${identity.displayName} and that you take care of ${identity.role}.`
    : `When asked who you are, say you are ${identity.displayName}.`);
  return lines.join(' ');
}

function siblingsLine(identity: SoulIdentity): string {
  const siblings = (identity.siblings ?? []).slice(0, 20);
  if (siblings.length === 0) return '';
  const list = siblings.map((sibling) => (sibling.role ? `${sibling.name} (${sibling.role})` : sibling.name)).join(', ');
  return ` Other assistants in this Unit: ${list}. When a request clearly belongs to one of them, tell the user they can continue with that assistant.`;
}

/** Opening and tool guidance for a non-default bot of the Unit. */
function botSoul(identity: SoulIdentity & { unitDisplayName: string }): string {
  let soul = ALLERAC_SOUL.replace(
    ALLERAC_OPENING,
    `You are ${identity.displayName}, one of the assistants of ${identity.unitDisplayName}, a private Allerac unit. ${identityLines(identity)}${siblingsLine(identity)}`,
  );
  if (identity.capabilities && !identity.capabilities.includes('health')) {
    soul = soul.replace(HEALTH_GUIDANCE_LINE, '');
  }
  return soul + instructionsSection(identity);
}

/** Owner instructions come after the base guidance; the user's own learned rules are added later and win. */
function instructionsSection(identity: SoulIdentity): string {
  const text = identity.instructions?.trim();
  return text ? `\n\n## Agent instructions (set by the Unit owner)\n${text}` : '';
}

/**
 * Returns the Soul for a given domain.
 * The code domain gets shell instructions; all others get the lean base.
 * With an identity, the opening line names this Unit instead of "Allerac".
 */
export function buildSoul(domain?: string | null, identity?: SoulIdentity | null): string {
  if (domain === 'alleracweb' || domain === 'openworld') {
    return identity
      ? PUBLIC_AGENT_SOUL.replace(PUBLIC_OPENING, `You are ${identity.displayName}, an Allerac unit speaking with a visitor on a public website. ${identityLines(identity)}`)
        + instructionsSection(identity)
      : PUBLIC_AGENT_SOUL;
  }
  const base = identity?.unitDisplayName
    ? botSoul(identity as SoulIdentity & { unitDisplayName: string })
    : identity
    ? ALLERAC_SOUL.replace(ALLERAC_OPENING, `You are ${identity.displayName}, an Allerac unit: a private AI assistant. ${identityLines(identity)}${pairedUnitsLine(identity)}${managerLine(identity)}`)
      + instructionsSection(identity)
    : ALLERAC_SOUL;
  if (domain === 'code') return `${base}\n\n${ALLERAC_CODE_ADDENDUM}`;
  return base;
}

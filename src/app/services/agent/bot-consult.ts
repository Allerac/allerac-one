/**
 * Manager consults (multi-bot PR 7, docs/roadmap/multi-bot-per-unit.md 2.5).
 *
 * The default agent asks one bot a question (tool `ask_agent`). The bot runs
 * its normal turn (its soul, tools, memory scope and model) with the
 * read-only 'consult' policy, in a hand-off conversation that never feeds
 * memory. Only the answer text comes back. Bots never get this tool, so a
 * consulted bot cannot consult anyone (depth 1 by construction).
 */
import type { User } from '@/app/services/auth/auth.service';
import { DEFAULT_AGENT_SLUG, type UnitAgent } from './unit-agents';
import { BotModelError, isRunnableBot, resolveBotModel } from './bot-runtime';

export const MAX_CONSULT_QUESTION_CHARS = 4_000;
export const MAX_CONSULT_ANSWER_CHARS = 8_000;
export const MAX_CONSULTS_PER_TURN = 3;
/** Local models can be slow; one consult is a whole bot turn. */
export const DEFAULT_CONSULT_TIMEOUT_MS = 120_000;

export function consultTimeoutMs(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.ALLERAC_BOT_CONSULT_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 5_000 && value <= 600_000 ? value : DEFAULT_CONSULT_TIMEOUT_MS;
}

export interface ConsultRecord {
  userId: string;
  callerSlug: string;
  callerConversationId: string | null;
  targetSlug: string;
  handoffConversationId: string | null;
  question: string;
  status: 'ok' | 'error' | 'timeout';
  errorCode: string | null;
  durationMs: number;
}

export interface BotConsultStore {
  /** Hand-off conversation of the latest consult from this caller conversation to this bot, if it still exists. */
  latestHandoff(userId: string, callerConversationId: string, targetSlug: string): Promise<string | null>;
  createHandoff(userId: string, bot: UnitAgent, title: string): Promise<string>;
  record(row: ConsultRecord): Promise<void>;
}

export interface ConsultRunInput {
  user: User;
  conversationId: string;
  bot: UnitAgent;
  message: string;
  modelId: string;
  provider: string;
  locale: string;
  timeZone?: string;
}

export interface BotConsultDeps {
  getBot(slug: string): Promise<UnitAgent | null>;
  listBots(): Promise<UnitAgent[]>;
  store: BotConsultStore;
  /** Runs the bot turn with the 'consult' policy; `empty` when the model said nothing. */
  run(input: ConsultRunInput): Promise<{ content: string; empty: boolean }>;
  timeoutMs?: number;
  now?: () => number;
}

export interface ConsultContext {
  user: User;
  /** The Manager's conversation; hand-off continuity is keyed by it. */
  callerConversationId: string | null;
  /** The model the Manager runs on; the bot's own model and cloud rule apply on top. */
  model: { modelId: string; provider: string };
  locale: string;
  timeZone?: string;
  /** Shared across the tool calls of one Manager turn (per-turn cap). */
  turn: { consults: number };
  managerName?: string;
}

export type ConsultResult =
  | { agent: string; name: string; answer: string; truncated: boolean; continueHref: string }
  | { agent?: string; error: string; availableAgents?: Array<{ id: string; name: string; role: string | null }> };

class ConsultTimeout extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ConsultTimeout()), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Bots the Manager can consult: enabled, not archived, not the default agent. */
export function consultableBots(bots: UnitAgent[]): UnitAgent[] {
  return bots.filter((bot) => !bot.isDefault && bot.slug !== DEFAULT_AGENT_SLUG && isRunnableBot(bot));
}

export function consultPrompt(question: string, managerName: string): string {
  return `${managerName} (the Unit's main assistant) asks you this on behalf of the user. `
    + 'Answer directly and completely; in this reply you can read but not save, send or schedule anything.\n\n'
    + question;
}

export async function askAgent(
  args: { agent?: unknown; question?: unknown },
  ctx: ConsultContext,
  deps: BotConsultDeps,
): Promise<ConsultResult> {
  const slug = typeof args.agent === 'string' ? args.agent.trim().toLowerCase() : '';
  const question = typeof args.question === 'string' ? args.question.trim() : '';
  if (!slug || !question) return { error: 'agent and question are required.' };
  if (question.length > MAX_CONSULT_QUESTION_CHARS) {
    return { agent: slug, error: `Question is too long (max ${MAX_CONSULT_QUESTION_CHARS} characters).` };
  }

  const bot = slug === DEFAULT_AGENT_SLUG ? null : await deps.getBot(slug);
  if (!bot || bot.isDefault || !isRunnableBot(bot)) {
    const available = consultableBots(await deps.listBots());
    return {
      agent: slug,
      error: `No bot "${slug}" to consult.`,
      availableAgents: available.map((item) => ({ id: item.slug, name: item.displayName, role: item.role })),
    };
  }
  if (ctx.turn.consults >= MAX_CONSULTS_PER_TURN) {
    return { agent: slug, error: `At most ${MAX_CONSULTS_PER_TURN} consults per reply. Answer with what you have.` };
  }
  ctx.turn.consults += 1;

  const now = deps.now ?? Date.now;
  const started = now();
  const record = (row: Pick<ConsultRecord, 'status' | 'errorCode' | 'handoffConversationId'>) => deps.store.record({
    userId: ctx.user.id,
    callerSlug: DEFAULT_AGENT_SLUG,
    callerConversationId: ctx.callerConversationId,
    targetSlug: bot.slug,
    question,
    durationMs: Math.max(0, now() - started),
    ...row,
  }).catch((error) => console.error('[BotConsult] Audit failed:', error));

  let model;
  try {
    model = resolveBotModel(bot, ctx.model);
  } catch (error) {
    if (!(error instanceof BotModelError)) throw error;
    await record({ status: 'error', errorCode: error.code, handoffConversationId: null });
    return { agent: bot.slug, error: error.message };
  }

  let handoffId: string | null = null;
  try {
    handoffId = ctx.callerConversationId
      ? await deps.store.latestHandoff(ctx.user.id, ctx.callerConversationId, bot.slug)
      : null;
    handoffId ??= await deps.store.createHandoff(ctx.user.id, bot, `${ctx.managerName ?? 'Manager'} · ${bot.displayName}`);
    const result = await withTimeout(deps.run({
      user: ctx.user,
      conversationId: handoffId,
      bot,
      message: consultPrompt(question, ctx.managerName ?? 'The Manager'),
      modelId: model.modelId,
      provider: model.provider,
      locale: ctx.locale,
      timeZone: ctx.timeZone,
    }), deps.timeoutMs ?? consultTimeoutMs());
    await record({ status: 'ok', errorCode: result.empty ? 'empty_reply' : null, handoffConversationId: handoffId });
    const answer = result.empty ? '' : result.content;
    return {
      agent: bot.slug,
      name: bot.displayName,
      answer: answer.slice(0, MAX_CONSULT_ANSWER_CHARS) || `${bot.displayName} gave no answer.`,
      truncated: answer.length > MAX_CONSULT_ANSWER_CHARS,
      continueHref: `/agents/self/${bot.slug}`,
    };
  } catch (error) {
    const timedOut = error instanceof ConsultTimeout;
    if (!timedOut) console.error('[BotConsult] Consult failed:', error);
    await record({ status: timedOut ? 'timeout' : 'error', errorCode: timedOut ? 'timeout' : 'exception', handoffConversationId: handoffId });
    return { agent: bot.slug, error: timedOut ? `${bot.displayName} took too long to answer.` : `${bot.displayName} could not answer.` };
  }
}

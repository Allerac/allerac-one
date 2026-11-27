/**
 * Resolves the bot a chat request targets (multi-bot PR 2). Kept apart from
 * the pure `bot-runtime.ts` because it reads the registry.
 */
import { getUnitAgent } from './unit-agents.repository';
import { isCandidateBotSlug, isRunnableBot } from './bot-runtime';
import type { UnitAgent } from './unit-agents';

export type BotRequest =
  /** Not a bot (flag off, default bot, public or legacy domain): the existing path applies. */
  | { kind: 'none' }
  | { kind: 'bot'; bot: UnitAgent }
  /** A bot exists under this slug but is archived or disabled. */
  | { kind: 'unavailable'; slug: string }
  /** A bot exists, but only admins may talk to bots for now. */
  | { kind: 'forbidden'; slug: string };

export async function resolveBotRequest(
  user: { is_admin?: boolean | null },
  slug: string | null | undefined,
): Promise<BotRequest> {
  if (!isCandidateBotSlug(slug)) return { kind: 'none' };
  const agent = await getUnitAgent(slug);
  if (!agent || agent.isDefault) return { kind: 'none' };
  if (user.is_admin !== true) return { kind: 'forbidden', slug };
  if (!isRunnableBot(agent)) return { kind: 'unavailable', slug };
  return { kind: 'bot', bot: agent };
}

/** JSON error for a request that cannot run as a bot, or null when it can (or is not a bot). */
export function botRequestErrorResponse(request: BotRequest): Response | null {
  if (request.kind === 'forbidden') return Response.json({ error: 'Forbidden' }, { status: 403 });
  if (request.kind === 'unavailable') return Response.json({ error: 'This bot is archived or disabled' }, { status: 409 });
  return null;
}

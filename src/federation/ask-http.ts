import type { AskResultState } from './ask-dedupe';
import { ASYNC_POLL_AFTER_MS } from './ask-dedupe';
import type { AskResult } from './agents.service';

/**
 * Wire shapes of the async ask endpoints (federation P4c), shared by the route
 * handlers and the in-memory multi-Unit fakes so tests exercise the same bodies.
 */
export interface AskHttpReply {
  data: Record<string, unknown>;
  status: 200 | 202;
}

/** POST /api/v1/federation/agents/:agent/ask?async=1 */
export function asyncAskReply(outcome: { status: 'done'; result: AskResult } | { status: 'pending' }, key: string): AskHttpReply {
  if (outcome.status === 'done') return { data: { status: 'done', ...outcome.result }, status: 200 };
  return { data: { status: 'pending', key, poll_after_ms: ASYNC_POLL_AFTER_MS }, status: 202 };
}

/** GET /api/v1/federation/asks/:key */
export function askResultReply(state: AskResultState, key: string): AskHttpReply {
  if (state.status === 'done') return { data: { status: 'done', ...state.response }, status: 200 };
  if (state.status === 'pending') return { data: { status: 'pending', key, poll_after_ms: ASYNC_POLL_AFTER_MS }, status: 202 };
  return { data: { status: 'failed', error_code: state.errorCode }, status: 200 };
}

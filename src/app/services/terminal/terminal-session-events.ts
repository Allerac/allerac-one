import pool from '@/app/clients/db';
import type { TerminalProvider } from '@/app/terminal/providers';

/**
 * Session lifecycle history of the Unit terminal. Records who started,
 * reconnected or stopped a session and how it ended — never input or output.
 */
export type TerminalSessionEvent = 'started' | 'reconnected' | 'stopped' | 'exited' | 'idle_timeout';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RETENTION_DAYS = 90;
// Every open tab keeps polling an ended session; remember which ends were written.
const observedEnds = new Set<string>();

export async function recordTerminalEvent(input: { provider: TerminalProvider; sessionId: unknown; userId: string | null; event: TerminalSessionEvent; exitCode?: unknown }): Promise<void> {
  if (typeof input.sessionId !== 'string' || !UUID.test(input.sessionId)) return;
  const exitCode = Number.isInteger(input.exitCode) ? input.exitCode : null;
  try {
    // The partial unique index keeps one end event per session.
    await pool.query(
      `INSERT INTO terminal_session_events (provider, session_id, user_id, event, exit_code)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [input.provider, input.sessionId, input.userId, input.event, exitCode],
    );
  } catch (error) {
    // History must never break the terminal itself.
    console.error('[terminal] failed to record session event:', error instanceof Error ? error.message : error);
  }
}

/** Records an end the terminal service reports (CLI exit or idle timeout). Stops are recorded by the stop request. */
export async function recordObservedEnd(provider: TerminalProvider, payload: unknown): Promise<void> {
  if (!payload || typeof payload !== 'object') return;
  const value = payload as { id?: unknown; sessionId?: unknown; endReason?: unknown; exitCode?: unknown };
  const sessionId = value.sessionId ?? value.id;
  if (value.endReason !== 'exited' && value.endReason !== 'idle_timeout') return;
  if (typeof sessionId !== 'string' || observedEnds.has(sessionId)) return;
  observedEnds.add(sessionId);
  if (observedEnds.size > 1000) observedEnds.delete(observedEnds.values().next().value as string);
  await recordTerminalEvent({ provider, sessionId, userId: null, event: value.endReason, exitCode: value.exitCode });
}

export interface TerminalSessionEventRow {
  id: string;
  provider: TerminalProvider;
  sessionId: string;
  event: TerminalSessionEvent;
  exitCode: number | null;
  userEmail: string | null;
  userName: string | null;
  createdAt: string;
}

export async function listTerminalSessionEvents(limit = 100): Promise<TerminalSessionEventRow[]> {
  await pool.query(`DELETE FROM terminal_session_events WHERE created_at < NOW() - make_interval(days => $1)`, [RETENTION_DAYS]);
  const result = await pool.query(
    `SELECT e.id, e.provider, e.session_id, e.event, e.exit_code, e.created_at, u.email, u.name
     FROM terminal_session_events e
     LEFT JOIN users u ON u.id = e.user_id
     ORDER BY e.created_at DESC
     LIMIT $1`,
    [Math.min(Math.max(limit, 1), 500)],
  );
  return result.rows.map(row => ({
    id: row.id,
    provider: row.provider,
    sessionId: row.session_id,
    event: row.event,
    exitCode: row.exit_code,
    userEmail: row.email,
    userName: row.name,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

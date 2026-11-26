import { authenticationErrorResponse, ForbiddenError, requireCurrentUser } from '@/app/lib/auth-session';
import { listTerminalSessionEvents } from '@/app/services/terminal/terminal-session-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Admin-only session lifecycle history of the Unit terminal (no input or output). */
export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!user.is_admin) throw new ForbiddenError('Only admins can see the terminal history');
    return Response.json({ events: await listTerminalSessionEvents(100) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    // `code` is translated by the client (terminal.errors.history_unavailable).
    return authenticationErrorResponse(error) || Response.json({ error: 'Unable to load the terminal history.', code: 'history_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

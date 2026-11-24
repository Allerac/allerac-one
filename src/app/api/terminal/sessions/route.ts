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
    return authenticationErrorResponse(error) || Response.json({ error: 'Não foi possível carregar o histórico do terminal.' }, { status: 503 });
  }
}

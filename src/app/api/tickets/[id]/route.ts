/**
 * /api/tickets/[id]
 *
 * GET    /api/tickets/:id  — ticket detail + events
 * PATCH  /api/tickets/:id  — update status, assignment, resolution
 * DELETE /api/tickets/:id  — cancel ticket
 */

import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { AuthService } from '@/app/services/auth/auth.service';
import { ticketService } from '@/app/services/tickets/ticket.service';

const authService = new AuthService();

async function getUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return authService.validateSession(sessionToken);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const ticket = await ticketService.getById(id, user.id);
    if (!ticket) return Response.json({ error: 'Not found' }, { status: 404 });

    const events = await ticketService.getEvents(id);
    return Response.json({ ticket, events });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[TicketRoute] GET error:', error);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { status, resolutionNotes, resolvedByType, assignedToType, contextPatch } = body;

    const ticket = await ticketService.update(id, user.id, {
      status,
      resolutionNotes,
      resolvedByType,
      assignedToType,
      contextPatch,
    });

    if (!ticket) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json({ ticket });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[TicketRoute] PATCH error:', error);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const ticket = await ticketService.update(id, user.id, { status: 'cancelled' });

    if (!ticket) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json({ cancelled: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[TicketRoute] DELETE error:', error);
    return Response.json({ error: message }, { status: 500 });
  }
}

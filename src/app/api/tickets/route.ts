/**
 * /api/tickets
 *
 * GET  /api/tickets              — list tickets (filters: status, type, priorityLevel, limit, offset)
 * POST /api/tickets              — create a ticket
 */

import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { AuthService } from '@/app/services/auth/auth.service';
import { ticketService, TicketStatus, TicketType } from '@/app/services/tickets/ticket.service';
import type { PriorityLevel } from '@/app/services/tickets/priority.service';

const authService = new AuthService();

async function getUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return authService.validateSession(sessionToken);
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const user = await getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = request.nextUrl;
    const status        = searchParams.get('status')        as TicketStatus | null;
    const type          = searchParams.get('type')          as TicketType | null;
    const priorityLevel = searchParams.get('priorityLevel') as PriorityLevel | null;
    const limit         = searchParams.get('limit')  ? parseInt(searchParams.get('limit')!)  : undefined;
    const offset        = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined;

    const tickets = await ticketService.list({
      userId: user.id,
      ...(status        && { status }),
      ...(type          && { type }),
      ...(priorityLevel && { priorityLevel }),
      limit,
      offset,
    });

    return Response.json({ tickets });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[TicketsRoute] GET error:', error);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { title, description, type, explicitUrgency, tags, context } = body;

    if (!title?.trim()) return Response.json({ error: 'title is required' }, { status: 400 });

    const ticket = await ticketService.create({
      userId: user.id,
      title,
      description,
      type,
      explicitUrgency,
      tags,
      context: { ...context, source: 'ui' },
    });

    return Response.json({ ticket }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[TicketsRoute] POST error:', error);
    return Response.json({ error: message }, { status: 500 });
  }
}

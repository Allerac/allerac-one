import { z } from 'zod';
import { ticketService } from '@/app/services/tickets/ticket.service';
import { requireApiDomainUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import { ticketDto, ticketEventDto } from '../../_lib/tickets';

const updateTicketSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'cancelled']).optional(),
  resolutionNotes: z.string().optional(),
  resolvedByType: z.enum(['user', 'agent']).optional(),
  assignedToType: z.enum(['user', 'agent']).nullable().optional(),
  contextPatch: z.record(z.unknown()).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const user = await requireApiDomainUser('tickets:read', 'tickets');
    const { id } = await params;

    const ticket = await ticketService.getById(id, user.id);
    if (!ticket) return apiError('not_found', 'Ticket not found', 404);

    const events = await ticketService.getEvents(id, user.id);
    return apiData({
      ticket: ticketDto(ticket),
      events: events.map(ticketEventDto),
    });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/tickets/:id failed', error);
  }
}

export async function PATCH(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const user = await requireApiDomainUser('tickets:write', 'tickets');
    const { id } = await params;
    const parsed = updateTicketSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid ticket update payload', 400, parsed.error.flatten());
    }

    const ticket = await ticketService.update(id, user.id, parsed.data);
    if (!ticket) return apiError('not_found', 'Ticket not found', 404);

    return apiData({ ticket: ticketDto(ticket) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('PATCH /api/v1/tickets/:id failed', error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const user = await requireApiDomainUser('tickets:write', 'tickets');
    const { id } = await params;

    const deleted = await ticketService.delete(id, user.id);
    if (!deleted) return apiError('not_found', 'Ticket not found', 404);

    return apiData({ deleted: true });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('DELETE /api/v1/tickets/:id failed', error);
  }
}


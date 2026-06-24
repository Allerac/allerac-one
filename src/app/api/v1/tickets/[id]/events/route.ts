import { ticketService } from '@/app/services/tickets/ticket.service';
import { requireApiDomainUser } from '../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../_lib/responses';
import { ticketEventDto } from '../../../_lib/tickets';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const user = await requireApiDomainUser('tickets:read', 'tickets', request);
    const { id } = await params;

    const ticket = await ticketService.getById(id, user.id);
    if (!ticket) return apiError('not_found', 'Ticket not found', 404);

    const events = await ticketService.getEvents(id, user.id);
    return apiData({ events: events.map(ticketEventDto) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/tickets/:id/events failed', error);
  }
}

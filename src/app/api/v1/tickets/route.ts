import { z } from 'zod';
import { ticketService } from '@/app/services/tickets/ticket.service';
import { requireApiDomainUser } from '../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../_lib/responses';
import { ticketDto } from '../_lib/tickets';

const listQuerySchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'cancelled']).optional(),
  type: z.enum(['task', 'bug', 'improvement', 'question']).optional(),
  priorityLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const createTicketSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional(),
  type: z.enum(['task', 'bug', 'improvement', 'question']).optional(),
  explicitUrgency: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  tags: z.array(z.string()).optional(),
  context: z.record(z.unknown()).optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiDomainUser('tickets:read', 'tickets');
    const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid ticket filters', 400, parsed.error.flatten());
    }

    const tickets = await ticketService.list({
      userId: user.id,
      ...parsed.data,
    });

    return apiData({ tickets: tickets.map(ticketDto) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/tickets failed', error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiDomainUser('tickets:write', 'tickets');
    const parsed = createTicketSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid ticket payload', 400, parsed.error.flatten());
    }

    const ticket = await ticketService.create({
      userId: user.id,
      ...parsed.data,
      context: { ...parsed.data.context, source: 'control_api' },
    });

    return apiData({ ticket: ticketDto(ticket) }, { status: 201 });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/tickets failed', error);
  }
}

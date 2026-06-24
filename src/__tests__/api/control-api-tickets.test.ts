/** @jest-environment node */

import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { ticketService } from '@/app/services/tickets/ticket.service';
import { GET as getMe } from '@/app/api/v1/me/route';
import { GET as listTickets, POST as createTicket } from '@/app/api/v1/tickets/route';
import {
  DELETE as deleteTicket,
  GET as getTicket,
  PATCH as updateTicket,
} from '@/app/api/v1/tickets/[id]/route';

jest.mock('@/app/lib/auth-session', () => {
  class MockUnauthorizedError extends Error {}
  class MockForbiddenError extends Error {}
  return {
    UnauthorizedError: MockUnauthorizedError,
    ForbiddenError: MockForbiddenError,
    requireCurrentUser: jest.fn(),
    assertDomainAccess: jest.fn(),
  };
});

jest.mock('@/app/services/tickets/ticket.service', () => ({
  ticketService: {
    list: jest.fn(),
    create: jest.fn(),
    getById: jest.fn(),
    getEvents: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockRequireCurrentUser = jest.mocked(requireCurrentUser);
const mockTicketService = jest.mocked(ticketService);

const user = {
  id: 'user-id',
  email: 'user@example.com',
  name: 'User',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

const ticket = {
  id: 'ticket-id',
  number: 7,
  userId: user.id,
  title: 'Fix caption generation',
  description: 'Caption endpoint fails on PNG uploads',
  type: 'bug',
  status: 'open',
  createdAt: new Date('2026-06-24T00:00:00.000Z'),
  updatedAt: new Date('2026-06-24T00:00:00.000Z'),
  resolvedAt: null,
  cancelledAt: null,
  priorityScore: 65,
  priorityLevel: 'high',
  priorityFactors: { explicitUrgency: 'high' },
  createdByType: 'user',
  createdByRunId: null,
  assignedToType: null,
  resolvedByType: null,
  resolvedByRunId: null,
  resolutionNotes: null,
  tags: ['api'],
  context: { source: 'test' },
} as const;

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function routeParams(id = 'ticket-id') {
  return { params: Promise.resolve({ id }) };
}

describe('Control API v1 tickets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue(user);
  });

  it('returns the current API user from the browser session', async () => {
    const response = await getMe();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          isAdmin: false,
          authMode: 'session',
        },
      },
    });
  });

  it('returns a stable 401 error envelope when unauthenticated', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());

    const response = await listTickets(new Request('http://localhost/api/v1/tickets') as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: 'unauthorized',
        message: 'Unauthorized',
      },
    });
    expect(mockTicketService.list).not.toHaveBeenCalled();
  });

  it('lists tickets owned by the current user', async () => {
    mockTicketService.list.mockResolvedValueOnce([ticket as never]);

    const response = await listTickets(new Request(
      'http://localhost/api/v1/tickets?status=open&type=bug&limit=10'
    ) as never);

    expect(response.status).toBe(200);
    expect(mockTicketService.list).toHaveBeenCalledWith({
      userId: user.id,
      status: 'open',
      type: 'bug',
      limit: 10,
    });
    const body = await response.json();
    expect(body.data.tickets[0]).toMatchObject({
      id: ticket.id,
      number: ticket.number,
      priority: { level: 'high', score: 65 },
    });
  });

  it('validates ticket creation payloads before calling the service', async () => {
    const response = await createTicket(jsonRequest(
      'http://localhost/api/v1/tickets',
      'POST',
      { title: '' },
    ));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'validation_error' },
    });
    expect(mockTicketService.create).not.toHaveBeenCalled();
  });

  it('creates tickets with the control_api source marker', async () => {
    mockTicketService.create.mockResolvedValueOnce(ticket as never);

    const response = await createTicket(jsonRequest(
      'http://localhost/api/v1/tickets',
      'POST',
      {
        title: 'Fix caption generation',
        type: 'bug',
        explicitUrgency: 'high',
        context: { client: 'bruno' },
      },
    ));

    expect(response.status).toBe(201);
    expect(mockTicketService.create).toHaveBeenCalledWith({
      userId: user.id,
      title: 'Fix caption generation',
      type: 'bug',
      explicitUrgency: 'high',
      context: { client: 'bruno', source: 'control_api' },
    });
    expect(await response.json()).toMatchObject({
      data: { ticket: { id: ticket.id, title: ticket.title } },
    });
  });

  it('returns ticket details and events', async () => {
    mockTicketService.getById.mockResolvedValueOnce(ticket as never);
    mockTicketService.getEvents.mockResolvedValueOnce([
      {
        id: 'event-id',
        ticketId: ticket.id,
        createdAt: new Date('2026-06-24T00:00:00.000Z'),
        eventType: 'created',
        actorType: 'user',
        actorRunId: null,
        previousValue: null,
        newValue: { status: 'open' },
        notes: null,
      },
    ] as never);

    const response = await getTicket(
      new Request('http://localhost/api/v1/tickets/ticket-id'),
      routeParams(),
    );

    expect(response.status).toBe(200);
    expect(mockTicketService.getById).toHaveBeenCalledWith(ticket.id, user.id);
    expect(await response.json()).toMatchObject({
      data: {
        ticket: { id: ticket.id },
        events: [{ id: 'event-id', type: 'created' }],
      },
    });
  });

  it('updates ticket status with the current user boundary', async () => {
    mockTicketService.update.mockResolvedValueOnce({ ...ticket, status: 'resolved' } as never);

    const response = await updateTicket(
      jsonRequest('http://localhost/api/v1/tickets/ticket-id', 'PATCH', {
        status: 'resolved',
        resolutionNotes: 'Done',
      }),
      routeParams(),
    );

    expect(response.status).toBe(200);
    expect(mockTicketService.update).toHaveBeenCalledWith(ticket.id, user.id, {
      status: 'resolved',
      resolutionNotes: 'Done',
    });
  });

  it('returns not_found when deleting a missing ticket', async () => {
    mockTicketService.delete.mockResolvedValueOnce(false);

    const response = await deleteTicket(
      new Request('http://localhost/api/v1/tickets/ticket-id', { method: 'DELETE' }),
      routeParams(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: 'not_found',
        message: 'Ticket not found',
      },
    });
  });
});


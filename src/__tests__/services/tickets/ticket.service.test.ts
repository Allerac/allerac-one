import '../../__mocks__/db';
import pool from '@/app/clients/db';
import { TicketService } from '@/app/services/tickets/ticket.service';

const mockQuery = jest.mocked(pool.query);

describe('TicketService ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('scopes event history through the owning ticket', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const service = new TicketService();
    const events = await service.getEvents('ticket-a', 'user-a');

    expect(events).toEqual([]);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE te.ticket_id = $1 AND t.user_id = $2'),
      ['ticket-a', 'user-a']
    );
  });

  it('scopes direct ticket lookup to the owner', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const service = new TicketService();
    const ticket = await service.getById('ticket-a', 'user-b');

    expect(ticket).toBeNull();
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM tickets WHERE id = $1 AND user_id = $2',
      ['ticket-a', 'user-b']
    );
  });
});

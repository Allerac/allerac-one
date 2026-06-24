/** @jest-environment node */

import '../../../__tests__/__mocks__/db';
import pool from '@/app/clients/db';
import { DomainService } from '@/app/services/domains/domain.service';

const mockQuery = (pool as any).query;

describe('DomainService', () => {
  let service: DomainService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DomainService();
  });

  it('lists all active domains for admins', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          slug: 'tickets',
          display_name: 'Tickets',
          is_active: true,
          skill_id: 'skill-id',
          skill_name: 'tickets',
          skill_display_name: 'Tickets',
        },
      ],
    });

    const domains = await service.listAccessible({ userId: 'admin-id', isAdmin: true });

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('FROM domains d'), []);
    expect(mockQuery.mock.calls[0][0]).toContain('WHERE d.is_active = true');
    expect(domains).toEqual([
      {
        slug: 'tickets',
        displayName: 'Tickets',
        isActive: true,
        defaultSkill: {
          id: 'skill-id',
          name: 'tickets',
          displayName: 'Tickets',
        },
      },
    ]);
  });

  it('filters non-admin domains by user access', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          slug: 'chat',
          display_name: 'Chat',
          is_active: true,
          skill_id: null,
          skill_name: null,
          skill_display_name: null,
        },
      ],
    });

    const domains = await service.listAccessible({ userId: 'user-id', isAdmin: false });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM user_domain_access uda'),
      ['user-id'],
    );
    expect(mockQuery.mock.calls[0][0]).toContain('WHERE uda.user_id = $1 AND d.is_active = true');
    expect(domains).toEqual([
      {
        slug: 'chat',
        displayName: 'Chat',
        isActive: true,
        defaultSkill: null,
      },
    ]);
  });
});

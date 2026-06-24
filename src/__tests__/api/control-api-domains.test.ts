/** @jest-environment node */

import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { domainService } from '@/app/services/domains/domain.service';
import { GET as listDomains } from '@/app/api/v1/domains/route';

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

jest.mock('@/app/services/domains/domain.service', () => ({
  domainService: {
    listAccessible: jest.fn(),
  },
}));

const mockRequireCurrentUser = jest.mocked(requireCurrentUser);
const mockDomainService = jest.mocked(domainService);

const user = {
  id: 'user-id',
  email: 'user@example.com',
  name: 'User',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

describe('Control API v1 domains', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue(user);
  });

  it('lists domains accessible to the current user', async () => {
    mockDomainService.listAccessible.mockResolvedValueOnce([
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

    const response = await listDomains();

    expect(response.status).toBe(200);
    expect(mockDomainService.listAccessible).toHaveBeenCalledWith({
      userId: user.id,
      isAdmin: false,
    });
    expect(await response.json()).toEqual({
      data: {
        domains: [
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
        ],
      },
    });
  });

  it('passes admin visibility to the domain service', async () => {
    mockRequireCurrentUser.mockResolvedValueOnce({
      ...user,
      is_admin: true,
    });
    mockDomainService.listAccessible.mockResolvedValueOnce([]);

    const response = await listDomains();

    expect(response.status).toBe(200);
    expect(mockDomainService.listAccessible).toHaveBeenCalledWith({
      userId: user.id,
      isAdmin: true,
    });
  });

  it('returns a stable 401 envelope when unauthenticated', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());

    const response = await listDomains();

    expect(response.status).toBe(401);
    expect(mockDomainService.listAccessible).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      error: {
        code: 'unauthorized',
        message: 'Unauthorized',
      },
    });
  });
});

/** @jest-environment node */
const mockList = jest.fn();
const mockAdmin = jest.fn();
jest.mock('@/app/api/v1/_lib/auth', () => ({ requireSessionAdmin: () => mockAdmin() }));
jest.mock('@/app/services/agent/unit-agents.repository', () => ({
  listUnitAgents: (options: unknown) => mockList(options),
}));

import { GET } from '@/app/api/v1/unit/agents/route';

describe('GET /api/v1/unit/agents', () => {
  afterEach(() => jest.clearAllMocks());

  it('lists the bots for an admin', async () => {
    mockAdmin.mockResolvedValueOnce({ id: 'admin-1' });
    mockList.mockResolvedValueOnce([{ slug: 'chat', isDefault: true, displayName: 'Napols' }]);
    const response = await GET(new Request('http://x/api/v1/unit/agents'));
    expect(response.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith({ includeArchived: false });
    expect((await response.json()).data).toEqual([{ slug: 'chat', isDefault: true, displayName: 'Napols' }]);
  });

  it('includes archived bots on request', async () => {
    mockAdmin.mockResolvedValueOnce({ id: 'admin-1' });
    mockList.mockResolvedValueOnce([]);
    await GET(new Request('http://x/api/v1/unit/agents?archived=true'));
    expect(mockList).toHaveBeenCalledWith({ includeArchived: true });
  });

  it('refuses non-admins', async () => {
    const { ForbiddenError } = jest.requireActual('@/app/lib/auth-session');
    mockAdmin.mockRejectedValueOnce(new ForbiddenError('Admin access required'));
    const response = await GET(new Request('http://x/api/v1/unit/agents'));
    expect(response.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });
});

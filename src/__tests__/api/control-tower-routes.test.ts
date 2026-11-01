/** @jest-environment node */
import { requireCurrentAdmin } from '@/app/lib/auth-session';
import { GET as overview } from '@/app/api/admin/control-tower/route';
import { POST as refresh } from '@/app/api/admin/control-tower/refresh/route';
import { controlTowerHeartbeat, controlTowerService } from '@/federation/control-tower.instance';

jest.mock('@/app/lib/auth-session', () => {
  class MockUnauthorizedError extends Error {}
  class MockForbiddenError extends Error {}
  return {
    UnauthorizedError: MockUnauthorizedError,
    ForbiddenError: MockForbiddenError,
    requireCurrentAdmin: jest.fn(),
    authenticationErrorResponse: (error: unknown) => (error instanceof MockUnauthorizedError
      ? Response.json({ error: 'Unauthorized' }, { status: 401 }) : null),
  };
});
jest.mock('@/federation/control-tower.instance', () => ({
  controlTowerService: { overview: jest.fn() },
  controlTowerHeartbeat: { refresh: jest.fn() },
}));

const auth = jest.requireMock('@/app/lib/auth-session') as { ForbiddenError: new (m?: string) => Error; UnauthorizedError: new () => Error };
const admin = { id: 'admin-1', is_admin: true };

describe('Control Tower admin API (P4d)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is 404 for non-admins and on public domains, 401 without a session', async () => {
    jest.mocked(requireCurrentAdmin).mockRejectedValueOnce(new auth.ForbiddenError('Admin access required'));
    expect((await overview(new Request('http://x/api/admin/control-tower'))).status).toBe(404);
    for (const domain of ['sales', 'openworld']) {
      jest.mocked(requireCurrentAdmin).mockResolvedValueOnce(admin as never);
      expect((await overview(new Request(`http://x/api/admin/control-tower?domain=${domain}`))).status).toBe(404);
    }
    jest.mocked(requireCurrentAdmin).mockRejectedValueOnce(new auth.UnauthorizedError());
    expect((await overview(new Request('http://x/api/admin/control-tower'))).status).toBe(401);
    jest.mocked(requireCurrentAdmin).mockResolvedValueOnce(admin as never);
    expect((await refresh(new Request('http://x/api/admin/control-tower/refresh?domain=sales', { method: 'POST' }))).status).toBe(404);
    expect(controlTowerService.overview).not.toHaveBeenCalled();
    expect(controlTowerHeartbeat.refresh).not.toHaveBeenCalled();
  });

  it('returns the overview with sanitized filters', async () => {
    jest.mocked(requireCurrentAdmin).mockResolvedValueOnce(admin as never);
    jest.mocked(controlTowerService.overview).mockResolvedValueOnce({ units: [] } as never);
    const response = await overview(new Request('http://x/api/admin/control-tower?window=1h&status=failed&unit=Santos'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ data: { units: [] } });
    expect(controlTowerService.overview).toHaveBeenCalledWith({ userId: 'admin-1', window: '1h', status: 'failed', unit: 'santos' });
    jest.mocked(requireCurrentAdmin).mockResolvedValueOnce(admin as never);
    jest.mocked(controlTowerService.overview).mockResolvedValueOnce({ units: [] } as never);
    await overview(new Request('http://x/api/admin/control-tower?window=7d&status=weird'));
    expect(controlTowerService.overview).toHaveBeenLastCalledWith({ userId: 'admin-1', window: '24h', status: 'all', unit: null });
  });

  it('refreshes one valid peer id or all', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    jest.mocked(requireCurrentAdmin).mockResolvedValue(admin as never);
    jest.mocked(controlTowerHeartbeat.refresh).mockResolvedValue({ refreshed: [id], throttled: [] });
    const post = (body: unknown) => new Request('http://x/api/admin/control-tower/refresh', { method: 'POST', body: JSON.stringify(body) });
    expect((await refresh(post({ peerId: id }))).status).toBe(200);
    expect(controlTowerHeartbeat.refresh).toHaveBeenLastCalledWith(id);
    await refresh(post({ peerId: 'not-a-uuid' }));
    expect(controlTowerHeartbeat.refresh).toHaveBeenLastCalledWith(null);
  });
});

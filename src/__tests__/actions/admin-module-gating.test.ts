/** @jest-environment node */

import '../__mocks__/db';
import pool from '@/app/clients/db';
import { requireCurrentAdmin } from '@/app/lib/auth-session';
import {
  assignInstagramAccount,
  deleteTikTokAccount,
  listAllDomains,
  listActiveDomains,
  listInstagramAccounts,
  listTikTokConnectedAdmins,
} from '@/app/actions/admin';
import { getEnabledAdminIntegrations } from '@/app/admin/integrations';

jest.mock('@/app/lib/auth-session', () => ({ requireCurrentAdmin: jest.fn() }));

const mockQuery = jest.mocked(pool.query);
const ORIGINAL_ENV = { ...process.env };
const uuid = '22222222-2222-4222-8222-222222222222';

const domainRows = ['chat', 'social', 'health', 'openworld', 'notes'].map((slug, i) => ({
  id: `id-${slug}`, slug, display_name: slug, is_active: true, sort_order: i,
}));

beforeEach(() => {
  jest.mocked(requireCurrentAdmin).mockResolvedValue({ id: 'admin', is_admin: true } as never);
  mockQuery.mockReset();
  delete process.env.ALLERAC_PROFILE;
  delete process.env.ALLERAC_MODULES;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('admin domain lists', () => {
  it('keep every domain with the default profile', async () => {
    mockQuery.mockResolvedValue({ rows: domainRows } as never);
    expect((await listAllDomains()).map((d) => d.slug)).toEqual(['chat', 'social', 'health', 'openworld', 'notes']);
  });

  it('drop domains owned by disabled modules', async () => {
    process.env.ALLERAC_PROFILE = 'openworld';
    mockQuery.mockResolvedValue({ rows: domainRows } as never);
    expect((await listAllDomains()).map((d) => d.slug)).toEqual(['chat', 'openworld', 'notes']);
    expect((await listActiveDomains()).map((d) => d.slug)).toEqual(['chat', 'openworld', 'notes']);
  });
});

describe('admin social integrations', () => {
  it('are listed when the social module is enabled', () => {
    expect(getEnabledAdminIntegrations(() => true)).toEqual(['instagram', 'tiktok']);
    expect(getEnabledAdminIntegrations((id) => id !== 'social')).toEqual([]);
  });

  it('skip queries and refuse writes when the social module is off', async () => {
    process.env.ALLERAC_PROFILE = 'openworld';
    expect(await listInstagramAccounts()).toEqual([]);
    expect(await listTikTokConnectedAdmins()).toEqual([]);
    expect(await assignInstagramAccount(uuid, uuid)).toEqual({ success: false, error: expect.stringContaining('Social') });
    expect(await deleteTikTokAccount(uuid)).toEqual({ success: false, error: expect.stringContaining('Social') });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('still require an admin when the social module is off', async () => {
    process.env.ALLERAC_PROFILE = 'openworld';
    jest.mocked(requireCurrentAdmin).mockRejectedValueOnce(new Error('Forbidden'));
    await expect(listInstagramAccounts()).rejects.toThrow('Forbidden');
  });

  it('run queries when the social module is on', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    await listInstagramAccounts();
    expect(mockQuery).toHaveBeenCalled();
  });
});

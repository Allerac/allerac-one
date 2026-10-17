/** @jest-environment node */

import '../__mocks__/db';
import { requireCurrentAdmin } from '@/app/lib/auth-session';
import {
  getPublicAgentDashboard,
  getPublicAgentRequestSeries,
  getPublicAgentTopModels,
} from '@/app/actions/external-agents';
import { externalAgentMetricsService } from '@/app/services/domains/external-agent-metrics.service';

jest.mock('@/app/lib/auth-session', () => ({
  requireCurrentAdmin: jest.fn(),
  requireCurrentUser: jest.fn(),
  assertDomainAccess: jest.fn(),
}));

const ORIGINAL_ENV = { ...process.env };
// getSummary is private; stub it so the test only covers which domains are listed.
const service = externalAgentMetricsService as unknown as {
  getSummary: (slug: string) => Promise<{ domainSlug: string }>;
};

beforeEach(() => {
  jest.mocked(requireCurrentAdmin).mockResolvedValue({ id: 'admin', is_admin: true } as never);
  jest.spyOn(service, 'getSummary').mockImplementation(async (slug) => ({ domainSlug: slug }));
  jest.spyOn(externalAgentMetricsService, 'getRequestSeries').mockResolvedValue([]);
  jest.spyOn(externalAgentMetricsService, 'getTopModels').mockResolvedValue([]);
  delete process.env.ALLERAC_PROFILE;
  delete process.env.ALLERAC_MODULES;
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('public bots dashboard', () => {
  it('lists every public bot with the default profile', async () => {
    const slugs = (await getPublicAgentDashboard()).map((s) => s.domainSlug);
    expect(slugs.sort()).toEqual(['openworld', 'sales']);
  });

  it('lists only bots whose module is enabled', async () => {
    process.env.ALLERAC_PROFILE = 'openworld';
    expect((await getPublicAgentDashboard()).map((s) => s.domainSlug)).toEqual(['openworld']);
  });

  it('lists no bots when no public module is enabled', async () => {
    process.env.ALLERAC_PROFILE = 'personal';
    expect(await getPublicAgentDashboard()).toEqual([]);
  });

  it('rejects chart requests for a bot whose module is disabled', async () => {
    process.env.ALLERAC_PROFILE = 'openworld';
    await expect(getPublicAgentRequestSeries('sales', 'day')).rejects.toThrow('not a public-facing domain');
    await expect(getPublicAgentTopModels('sales')).rejects.toThrow('not a public-facing domain');
    await expect(getPublicAgentTopModels('openworld')).resolves.toEqual([]);
  });
});

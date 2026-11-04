/**
 * @jest-environment node
 */
jest.mock('@/app/lib/domain-access', () => ({ requireAdmin: jest.fn().mockResolvedValue({ id: 'a', is_admin: true }) }));
jest.mock('@/app/domains/DomainsPageClient', () => () => null);

import DomainsPage from '@/app/domains/page';

const ORIGINAL = { ...process.env };
afterEach(() => { process.env = { ...ORIGINAL }; });

describe('/domains lists only enabled modules', () => {
  it.each([
    ['personal', ['health', 'music'], ['alleracweb', 'openworld']],
    ['openworld', ['openworld', 'chat'], ['alleracweb', 'health', 'music']],
    ['alleracweb', ['alleracweb', 'chat'], ['openworld', 'health']],
  ])('profile %s', async (profile, present, absent) => {
    delete process.env.ALLERAC_MODULES;
    process.env.ALLERAC_PROFILE = profile;
    const el = await DomainsPage();
    for (const slug of present) expect(el.props.enabledSlugs).toContain(slug);
    for (const slug of absent) expect(el.props.enabledSlugs).not.toContain(slug);
  });
  it('lists every domain on a classic install', async () => {
    delete process.env.ALLERAC_MODULES;
    delete process.env.ALLERAC_PROFILE;
    expect((await DomainsPage()).props.enabledSlugs).toEqual(expect.arrayContaining(['alleracweb', 'openworld', 'health']));
  });
});

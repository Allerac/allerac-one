/**
 * @jest-environment node
 */
const mockRedirect = jest.fn((url: string) => { throw new Error(`NEXT_REDIRECT ${url}`); });
jest.mock('next/navigation', () => ({ redirect: (url: string) => mockRedirect(url), notFound: jest.fn() }));
const mockDomain = jest.fn();
jest.mock('@/app/lib/domain-access', () => ({ requireDomainAccess: (slug: string) => mockDomain(slug) }));
jest.mock('@/app/actions/skills', () => ({ getDomainSkillDefault: jest.fn().mockResolvedValue(null) }));
jest.mock('@/app/chat/ChatClient', () => function ChatClient() { return null; });
jest.mock('@/app/components/layout/DataPageView', () => function DataPageView() { return null; });
jest.mock('@/app/search/SearchClient', () => function SearchClient() { return null; });

import HealthPage from '@/app/health/page';
import NotesPage from '@/app/notes/page';
import EmailPage from '@/app/email/page';
import JobsPage from '@/app/jobs/page';
import MemoryPage from '@/app/memory/page';
import MusicPage from '@/app/music/page';
import ChannelsPage from '@/app/channels/page';
import ChatPage from '@/app/chat/page';
import SearchPage from '@/app/search/page';
import SocialPage from '@/app/social/page';

type El = { type: { name: string }; props: unknown };
const page = (fn: unknown) => fn as () => Promise<El>;
const dataPages: [string, () => Promise<El>][] = [
  ['health', page(HealthPage)], ['notes', page(NotesPage)], ['email', page(EmailPage)], ['jobs', page(JobsPage)],
  ['memory', page(MemoryPage)], ['music', page(MusicPage)], ['channels', page(ChannelsPage)],
];
const chatRoutes: [string, () => Promise<unknown>][] = [
  ['chat', () => ChatPage({})], ['search', SearchPage], ['social', SocialPage],
];

const original = process.env.ALLERAC_LEGACY_DOMAINS;
afterAll(() => { process.env.ALLERAC_LEGACY_DOMAINS = original; });
beforeEach(() => {
  jest.clearAllMocks();
  mockDomain.mockResolvedValue({ id: 'u1', is_admin: false });
});

describe('legacy domains off (default)', () => {
  beforeEach(() => { delete process.env.ALLERAC_LEGACY_DOMAINS; });

  it.each(dataPages)('/%s renders the data page view without the chat', async (slug, Page) => {
    const el = await Page();
    expect(el.type.name).toBe('DataPageView');
    expect(el.props).toEqual({ page: slug, userId: 'u1', isAdmin: false });
    expect(mockDomain).toHaveBeenCalledWith(slug);
  });

  it.each(chatRoutes)('/%s redirects to the agent', async (_slug, Page) => {
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT /agents/self/agent');
  });
});

describe('ALLERAC_LEGACY_DOMAINS=true', () => {
  beforeEach(() => { process.env.ALLERAC_LEGACY_DOMAINS = 'true'; });

  it.each(dataPages)('/%s keeps the domain chat', async (_slug, Page) => {
    expect((await Page()).type.name).toBe('ChatClient');
  });

  it.each(chatRoutes)('/%s does not redirect', async (_slug, Page) => {
    const el = await Page();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(el).toBeTruthy();
  });
});

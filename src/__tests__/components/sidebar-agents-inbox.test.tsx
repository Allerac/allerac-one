import { render, screen } from '@testing-library/react';
import SidebarDesktop from '@/app/components/layout/SidebarDesktop';
import SidebarMobile from '@/app/components/layout/SidebarMobile';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (k: string) => k }));
jest.mock('@/app/actions/user', () => ({ updateLanguage: jest.fn() }));
jest.mock('@/app/components/credits/UserCreditBalance', () => () => null);
jest.mock('@/app/components/layout/SidebarContent', () => () => <div data-testid="conversation-list" />);
jest.mock('@/app/components/inbox/AgentsInboxSection', () => ({ domainId }: { domainId: string }) => (
  <div data-testid="agents-inbox">{domainId}</div>
));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const baseProps: any = {
  isSidebarOpen: true, setIsSidebarOpen: jest.fn(), isSidebarCollapsed: false, setIsSidebarCollapsed: jest.fn(),
  isDarkMode: false, toggleDarkMode: jest.fn(), conversations: [], currentConversationId: null,
  loadConversation: jest.fn(), deleteConversation: jest.fn(), pinConversation: jest.fn(), renameConversation: jest.fn(),
  startNewConversation: jest.fn(), onNewConversation: jest.fn(), setIsUserSettingsOpen: jest.fn(),
  userName: 'Test', userEmail: 't@example.com', onLogout: jest.fn(),
};

describe.each([
  ['SidebarDesktop', SidebarDesktop],
  ['SidebarMobile', SidebarMobile],
])('%s agents inbox section', (_name, Sidebar) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const C = Sidebar as any;
  it('renders for admins with the chat domain by default', () => {
    render(<C {...baseProps} isAdmin />);
    expect(screen.getByTestId('agents-inbox')).toHaveTextContent('chat');
    expect(screen.getByTestId('conversation-list')).toBeInTheDocument();
  });
  it('is hidden for non-admins', () => {
    render(<C {...baseProps} isAdmin={false} />);
    expect(screen.queryByTestId('agents-inbox')).toBeNull();
  });
  it('is hidden in public domains', () => {
    render(<C {...baseProps} isAdmin inboxDomainId="sales" />);
    expect(screen.queryByTestId('agents-inbox')).toBeNull();
  });
});

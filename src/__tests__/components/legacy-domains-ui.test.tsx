/* eslint-disable react/display-name */
/**
 * Phase 3b: domain tabs, taskbar and DomainChip only with ALLERAC_LEGACY_DOMAINS,
 * hub tiles, the agents 'Pages' menu, data page view and tool result links.
 */
import type React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }) }));
jest.mock('next/link', () => {
  const MockLink = ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>;
  MockLink.displayName = 'MockLink';
  return MockLink;
});
jest.mock('@/app/context/ThemeContext', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('@/app/components/layout/AlleracTaskbar', () => () => <div data-testid="taskbar" />);
jest.mock('@/app/components/layout/DomainChip', () => () => <div data-testid="domain-chip" />);
jest.mock('@/app/components/hub/HubTour', () => () => null);
jest.mock('@/app/jobs/ClippyAssistant', () => () => null);
jest.mock('@/app/actions/auth', () => ({ logout: jest.fn() }));
jest.mock('@/app/components/inbox/AgentsInboxSection', () => () => null);
jest.mock('@/app/components/inbox/AgentList', () => () => null);
jest.mock('@/app/components/health/HealthDashboard', () => () => <div data-testid="health-dashboard" />);
jest.mock('@/app/notes/VaultPanel', () => () => <div data-testid="vault" />);
jest.mock('@/app/components/email/EmailPanel', () => () => null);
jest.mock('@/app/jobs/JobsPanel', () => () => null);
jest.mock('@/app/memory/MemoryGraphPanel', () => () => null);
jest.mock('@/app/components/music/MusicDashboard', () => () => null);
jest.mock('@/app/components/settings/TelegramBotSettings', () => () => null);
jest.mock('@/app/components/chat/MarkdownContent', () => ({ children, content }: { children?: React.ReactNode; content?: string }) => <div>{content ?? children}</div>);
jest.mock('@/app/components/agents/AgentRunView', () => ({ AgentRunView: () => null }));
jest.mock('@/app/components/memory/CorrectAndMemorize', () => () => null);

import HubClient, { hubTiles } from '@/app/hub/HubClient';
import ConversationSidebar from '@/app/components/layout/ConversationSidebar';
import AgentShell from '@/app/agents/_shell/AgentShell';
import DataPageView from '@/app/components/layout/DataPageView';
import ChatMessages from '@/app/components/chat/ChatMessages';

beforeEach(() => {
  sessionStorage.setItem('allerac_booted', '1');
  global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ visible: ['chat', 'health', 'notes', 'code'] }) }) as unknown as typeof fetch;
});

const hubProps = { userName: 'g', userEmail: 'g@x', userId: 'u', completedHubTour: true, allowedDomains: ['chat', 'health', 'notes'], grampeadorBubblesEnabled: false };

describe('hub', () => {
  it('hides the taskbar by default', async () => {
    render(<HubClient {...hubProps} />);
    await waitFor(() => expect(screen.getByText('Health')).toBeInTheDocument());
    expect(screen.queryByTestId('taskbar')).toBeNull();
  });
  it('keeps the taskbar with legacy domains', async () => {
    render(<HubClient {...hubProps} legacyDomains />);
    expect(await screen.findByText('Code')).toBeInTheDocument();
    expect(screen.getByTestId('taskbar')).toBeInTheDocument();
  });
  it('shows agent + data page tiles without legacy domains', () => {
    expect(hubTiles(['chat', 'health', 'notes', 'code'], false).map(t => t.path)).toEqual(['/agents/self/agent', '/health', '/notes', '#docs']);
  });
  it('shows every domain tile with legacy domains', () => {
    expect(hubTiles(['chat', 'health', 'code'], true).map(t => t.path)).toEqual(['/chat', '/health', '/code', '#docs']);
  });
});

describe('DomainChip', () => {
  const props = {
    isDark: false, conversations: [], currentConvId: null, collapsed: false, onToggle: jest.fn(), onSelect: jest.fn(),
    onNew: jest.fn(), onDelete: jest.fn(), onPin: jest.fn(), onRename: jest.fn(), domainId: 'health', userId: 'u',
    isAdmin: true, onToggleTheme: jest.fn(), userInitials: 'GC', userName: 'g', userEmail: 'g@x', onLogout: jest.fn(),
  };
  it('is hidden by default', () => {
    render(<ConversationSidebar {...props} />);
    expect(screen.queryByTestId('domain-chip')).toBeNull();
  });
  it('shows with legacy domains', () => {
    render(<ConversationSidebar {...props} legacyDomains />);
    expect(screen.getByTestId('domain-chip')).toBeInTheDocument();
  });
});

describe('agents Pages menu', () => {
  it('lists data pages', () => {
    render(<AgentShell activeKey="self" isAdmin pages={[{ path: '/health', label: 'Health', icon: '❤️' }]} />);
    expect(screen.getByTestId('agent-shell-pages')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Health/ })).toHaveAttribute('href', '/health');
  });
  it('is absent without pages', () => {
    render(<AgentShell activeKey="self" isAdmin />);
    expect(screen.queryByTestId('agent-shell-pages')).toBeNull();
  });
});

describe('DataPageView', () => {
  it('renders the dashboard with a back link and no chat', () => {
    render(<DataPageView page="health" userId="u" isAdmin={false} />);
    expect(screen.getByTestId('health-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('data-page-back')).toHaveAttribute('href', '/agents/self/agent');
    expect(screen.queryByRole('link', { name: 'Hub' })).toBeNull();
  });
  it('links admins to the hub', () => {
    render(<DataPageView page="notes" userId="u" isAdmin />);
    expect(screen.getByTestId('vault')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hub' })).toHaveAttribute('href', '/hub');
  });
});

describe('tool result page links', () => {
  const base = {
    isSending: false, selectedModel: 'm', MODELS: [], isDarkMode: false, currentConversationId: 'c', userId: 'u',
    githubToken: '', messagesEndRef: { current: null },
  };
  const msg = (href: string) => [{
    role: 'assistant' as const, content: 'Your sleep was fine.', timestamp: new Date(),
    actions: [{ type: 'page_link' as const, href, label: 'Open health dashboard' }],
  }];
  beforeAll(() => { Element.prototype.scrollIntoView = jest.fn(); });

  it('renders a relative link', () => {
    render(<ChatMessages {...base} messages={msg('/health')} />);
    expect(screen.getByTestId('page-link')).toHaveAttribute('href', '/health');
    expect(screen.getByTestId('page-link')).toHaveTextContent('Open health dashboard');
  });
  it('drops absolute or scheme URLs', () => {
    render(<ChatMessages {...base} messages={msg('javascript:alert(1)')} />);
    expect(screen.queryByTestId('page-link')).toBeNull();
  });
});

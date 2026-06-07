'use client';

import { useTheme } from '@/app/context/ThemeContext';
import { useState, useEffect, useCallback } from 'react';
import { DomainProvider, type ToolCallEvent } from '@/app/context/DomainContext';
import { useConversations } from '@/app/hooks/useConversations';
import type { Conversation } from '@/app/types';
import MyAlleracModal from '@/app/components/allerac/MyAlleracModal';
import SidebarDesktop from '@/app/components/layout/SidebarDesktop';
import SidebarMobile from '@/app/components/layout/SidebarMobile';
import JobsPanel from './JobsPanel';
import ClippyAssistant from './ClippyAssistant';

interface Props {
  userId: string;
  userName: string | null;
  userEmail: string;
  isAdmin: boolean;
  defaultSkillName?: string;
}

export default function JobsClient({ userId, userName, userEmail, isAdmin, defaultSkillName }: Props) {
  const { isDark: isDarkMode, toggleDark } = useTheme();
  const [isMyAlleracOpen, setIsMyAlleracOpen] = useState(false);
  const [lastToolCall, setLastToolCall]       = useState<ToolCallEvent | null>(null);
  const [githubToken, setGithubToken]         = useState('');
  const [isSidebarOpen, setIsSidebarOpen]     = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);

  const {
    conversations, currentConvId,
    selectConversation, newConversation,
    deleteConversation, pinConversation, renameConversation,
  } = useConversations(userId, 'jobs');

  const [convId, setConvId] = useState<string | null>(currentConvId);
  useEffect(() => { setConvId(currentConvId); }, [currentConvId]);

  const convList: Conversation[] = conversations.map(c => ({ ...c, pinned: c.pinned ?? false }));

  const clearChat      = useCallback(() => { newConversation(); setConvId(null); }, [newConversation]);
  const loadConversation = useCallback(async (id: string) => { await selectConversation(id); setConvId(id); }, [selectConversation]);
  const handleDelete   = useCallback(async (id: string) => { await deleteConversation(id); if (convId === id) setConvId(null); }, [deleteConversation, convId]);
  const handleLogout   = async () => { const { logout } = await import('@/app/actions/auth'); await logout(); };

  useEffect(() => {
    setGithubToken(localStorage.getItem('github_token') || '');
  }, []);

  useEffect(() => {
    const open = () => setIsMyAlleracOpen(true);
    window.addEventListener('openMyAlleracModal', open);
    return () => window.removeEventListener('openMyAlleracModal', open);
  }, []);

  const d           = isDarkMode;
  const displayName = userName?.split(' ')[0] || 'there';

  return (
    <DomainProvider value={{ isDark: d, lastToolCall, setLastToolCall, postContext: '', setPostContext: () => {} }}>
      <div className={`h-full flex flex-col ${d ? 'bg-gray-900' : 'bg-white'}`}>

        {isSidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
        )}

        <div className="flex flex-1 overflow-hidden">
          <div className="lg:hidden">
            <SidebarMobile
              isSidebarOpen={isSidebarOpen} isDarkMode={d} onClose={() => setIsSidebarOpen(false)}
              conversations={convList} currentConversationId={convId} loadConversation={loadConversation}
              deleteConversation={handleDelete} pinConversation={pinConversation} renameConversation={renameConversation}
              isAdmin={isAdmin} onNewConversation={clearChat} userName={userName ?? undefined} userEmail={userEmail} onLogout={handleLogout} onToggleTheme={toggleDark}
            />
          </div>
          <div className="hidden lg:block">
            <SidebarDesktop
              isSidebarCollapsed={isSidebarCollapsed} setIsSidebarCollapsed={setSidebarCollapsed}
              isDarkMode={d} conversations={convList} currentConversationId={convId} loadConversation={loadConversation}
              deleteConversation={handleDelete} pinConversation={pinConversation} renameConversation={renameConversation}
              isAdmin={isAdmin} onNewConversation={clearChat} userName={userName ?? undefined} userEmail={userEmail} onLogout={handleLogout} onToggleTheme={toggleDark}
            />
          </div>

          <div className={`flex-1 flex flex-col overflow-hidden ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
            <JobsPanel userId={userId} isDarkMode={d} domainSlug="jobs" />
          </div>
        </div>

        <ClippyAssistant
          userId={userId}
          defaultSkillName={defaultSkillName}
          displayName={displayName}
          githubToken={githubToken}
          bottomOffset={60}
        />

        <MyAlleracModal
          isOpen={isMyAlleracOpen}
          onClose={() => setIsMyAlleracOpen(false)}
          isDarkMode={d}
          userId={userId}
          githubToken={githubToken}
          userName={userName ?? undefined}
          domainSlug="jobs"
        />
      </div>
    </DomainProvider>
  );
}

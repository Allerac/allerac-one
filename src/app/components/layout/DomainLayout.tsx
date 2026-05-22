'use client';

import { useState, ReactNode, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DomainProvider, type ToolCallEvent } from '@/app/context/DomainContext';
import { useConversations } from '@/app/hooks/useConversations';
import ConversationSidebar from './ConversationSidebar';
import DomainChatPanel from './DomainChatPanel';
import MyAlleracModal from '@/app/components/allerac/MyAlleracModal';

interface Props {
  userId: string;
  userName: string | null;
  userEmail: string;
  isAdmin: boolean;
  domainId: string;
  defaultSkillName?: string;
  children?: ReactNode;
}

export default function DomainLayout({
  userId, userName, userEmail, isAdmin, domainId, defaultSkillName, children,
}: Props) {
  const router = useRouter();
  const [isDark, setIsDark]               = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed]       = useState(false);
  const [lastToolCall, setLastToolCall]   = useState<ToolCallEvent | null>(null);
  const [postContext, setPostContext]     = useState('');
  const [alleracOpen, setAlleracOpen]     = useState(false);

  const d = isDark;

  useEffect(() => {
    const open = () => setAlleracOpen(true);
    window.addEventListener('openMyAlleracModal', open);
    return () => window.removeEventListener('openMyAlleracModal', open);
  }, []);

  const {
    conversations, currentConvId, setCurrentConvId,
    messages, setMessages,
    selectConversation, newConversation,
    deleteConversation, pinConversation, renameConversation,
    reload,
  } = useConversations(userId, domainId);

  const handleConvCreated = useCallback((convId: string) => {
    setCurrentConvId(convId);
    reload();
  }, [setCurrentConvId, reload]);

  const handleLogout = async () => {
    const { logout } = await import('@/app/actions/auth');
    await logout();
    router.push('/login');
  };

  const initials = (userName || userEmail).slice(0, 2).toUpperCase();

  return (
    <DomainProvider value={{ isDark, lastToolCall, setLastToolCall, postContext, setPostContext }}>
      <div className={`flex h-dvh font-sans ${d ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`}>

        <ConversationSidebar
          isDark={isDark}
          conversations={conversations}
          currentConvId={currentConvId}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(c => !c)}
          onSelect={selectConversation}
          onNew={newConversation}
          onDelete={deleteConversation}
          onPin={pinConversation}
          onRename={renameConversation}
          domainId={domainId}
          userId={userId}
          isAdmin={isAdmin}
          onToggleTheme={() => setIsDark(v => !v)}
          userInitials={initials}
          userName={userName}
          userEmail={userEmail}
          onLogout={handleLogout}
        />

        {/* middle: domain content */}
        {children && (
          <div className="flex-1 overflow-hidden flex flex-col min-w-0">
            {children}
          </div>
        )}

        <DomainChatPanel
          userId={userId}
          userName={userName}
          domainSlug={domainId}
          defaultSkillName={defaultSkillName}
          currentConvId={currentConvId}
          messages={messages}
          setMessages={setMessages as any}
          onConversationCreated={handleConvCreated}
          isFull={!children}
          collapsed={chatCollapsed}
          onToggleCollapse={() => setChatCollapsed(c => !c)}
        />
      </div>

      <MyAlleracModal
        isOpen={alleracOpen}
        onClose={() => setAlleracOpen(false)}
        isDarkMode={isDark}
        userId={userId}
        githubToken=""
        userName={userName ?? undefined}
        domainSlug={domainId}
      />
    </DomainProvider>
  );
}

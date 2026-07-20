'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '@/app/context/ThemeContext';
import { DomainProvider } from '@/app/context/DomainContext';
import { useConversations } from '@/app/hooks/useConversations';
import { useDomainChat } from '@/app/hooks/useDomainChat';
import { MODELS } from '@/app/services/llm/models';
import type { Conversation, Message } from '@/app/types';
import SidebarDesktop from '@/app/components/layout/SidebarDesktop';
import SidebarMobile from '@/app/components/layout/SidebarMobile';
import ChatMessages from '@/app/components/chat/ChatMessages';
import ChatInput from '@/app/components/chat/ChatInput';
import MemorySaveModal from '@/app/components/memory/MemorySaveModal';
import MyAlleracModal from '@/app/components/allerac/MyAlleracModal';
import TelegramBotSettings from '@/app/components/settings/TelegramBotSettings';
import { AlleracIcon } from '@/app/components/ui/AlleracIcon';

interface ChannelsClientProps {
  userId: string;
  userName: string | null;
  userEmail: string;
  isAdmin: boolean;
  defaultSkillName?: string;
}

export default function ChannelsClient({ userId, userName, userEmail, isAdmin, defaultSkillName }: ChannelsClientProps) {
  const { isDark: isDarkMode, toggleDark } = useTheme();
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'channels' | 'chat'>('channels');
  const [isMyAlleracOpen, setIsMyAlleracOpen] = useState(false);

  const {
    conversations, currentConvId, setCurrentConvId,
    messages, setMessages,
    selectConversation, newConversation,
    deleteConversation, pinConversation, renameConversation, reload,
  } = useConversations(userId, 'channels');

  const handleConvCreated = useCallback((id: string) => {
    setCurrentConvId(id);
    reload();
  }, [reload, setCurrentConvId]);

  const {
    input, setInput, sending, selectedModel, setSelectedModel,
    convId, isAgentMode, toggleAgentMode, githubToken,
    messagesEndRef, send, stop, handleKeyPress, handleSaveToMemory,
    memoryOpen, setMemoryOpen, memoryLoading, memoryResult, setMemoryResult,
  } = useDomainChat({
    userId,
    domain: 'channels',
    defaultSkillName,
    currentConvId,
    messages,
    setMessages,
    onConversationCreated: handleConvCreated,
  });

  useEffect(() => {
    const open = () => setIsMyAlleracOpen(true);
    window.addEventListener('openMyAlleracModal', open);
    return () => window.removeEventListener('openMyAlleracModal', open);
  }, []);

  const handleLogout = async () => {
    const { logout } = await import('@/app/actions/auth');
    await logout();
  };
  const loadConversation = useCallback(async (id: string) => {
    await selectConversation(id);
  }, [selectConversation]);
  const clearChat = useCallback(() => newConversation(), [newConversation]);
  const handleDelete = useCallback(async (id: string) => {
    await deleteConversation(id);
  }, [deleteConversation]);

  const convList: Conversation[] = conversations.map(conversation => ({
    ...conversation,
    pinned: conversation.pinned ?? false,
  }));
  const displayName = userName?.split(' ')[0] || userName || 'there';
  const d = isDarkMode;

  const chatPanel = messages.length === 0 && !sending ? (
    <div className={`flex-1 flex flex-col items-center justify-center px-4 ${d ? 'bg-gray-900' : 'bg-white'}`}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-fit mx-auto mb-6"><AlleracIcon size={64} /></div>
          <h2 className={`text-xl font-bold mb-2 ${d ? 'text-gray-100' : 'text-gray-900'}`}>Hello, {displayName}!</h2>
          <h3 className={`text-sm font-medium ${d ? 'text-gray-400' : 'text-gray-600'}`}>How can I help with your channels?</h3>
        </div>
        <ChatInput
          inputMessage={input} setInputMessage={setInput}
          handleKeyPress={handleKeyPress} handleSendMessage={send}
          isSending={sending} githubToken={githubToken} isDarkMode={d}
          setIsDocumentModalOpen={() => {}} selectedModel={selectedModel}
          setSelectedModel={setSelectedModel} MODELS={MODELS}
          githubConfigured googleConfigured ollamaConnected
          isAgentMode={isAgentMode} onToggleAgentMode={toggleAgentMode}
          onSaveMemory={handleSaveToMemory} hasConversation={!!convId} onStop={stop}
        />
      </div>
    </div>
  ) : (
    <>
      <div className={`flex-1 overflow-y-auto ${d ? 'bg-gray-900' : 'bg-white'}`}>
        <ChatMessages
          messages={messages as unknown as Message[]} isSending={sending}
          selectedModel={selectedModel} MODELS={MODELS} isDarkMode={d}
          currentConversationId={convId} userId={userId} githubToken={githubToken}
          messagesEndRef={messagesEndRef} domainSlug="channels"
        />
      </div>
      <div
        className={`flex-shrink-0 px-3 sm:px-4 pt-3 ${d ? 'bg-gray-900' : 'bg-white'}`}
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <ChatInput
          inputMessage={input} setInputMessage={setInput}
          handleKeyPress={handleKeyPress} handleSendMessage={send}
          isSending={sending} githubToken={githubToken} isDarkMode={d}
          setIsDocumentModalOpen={() => {}} selectedModel={selectedModel}
          setSelectedModel={setSelectedModel} MODELS={MODELS}
          githubConfigured googleConfigured ollamaConnected
          isAgentMode={isAgentMode} onToggleAgentMode={toggleAgentMode}
          onSaveMemory={handleSaveToMemory} hasConversation={!!convId} onStop={stop}
        />
      </div>
    </>
  );

  return (
    <DomainProvider value={{ isDark: d, lastToolCall: null, setLastToolCall: () => {}, postContext: '', setPostContext: () => {} }}>
      <div className={`h-full flex flex-col ${d ? 'bg-gray-900' : 'bg-white'}`}>
        {isSidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        <div className="flex flex-1 overflow-hidden">
          <div className="lg:hidden">
            <SidebarMobile
              isSidebarOpen={isSidebarOpen} isDarkMode={d} onClose={() => setSidebarOpen(false)}
              conversations={convList} currentConversationId={convId}
              loadConversation={loadConversation} deleteConversation={handleDelete}
              pinConversation={pinConversation} renameConversation={renameConversation}
              isAdmin={isAdmin} onNewConversation={clearChat}
              userName={userName ?? undefined} userEmail={userEmail}
              onLogout={handleLogout} onToggleTheme={toggleDark}
            />
          </div>

          <div className="hidden lg:block">
            <SidebarDesktop
              isSidebarCollapsed={isSidebarCollapsed} setIsSidebarCollapsed={setSidebarCollapsed}
              isDarkMode={d} conversations={convList} currentConversationId={convId}
              loadConversation={loadConversation} deleteConversation={handleDelete}
              pinConversation={pinConversation} renameConversation={renameConversation}
              isAdmin={isAdmin} onNewConversation={clearChat}
              userName={userName ?? undefined} userEmail={userEmail}
              onLogout={handleLogout} onToggleTheme={toggleDark}
            />
          </div>

          <div className={`flex-1 flex flex-col overflow-hidden ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
            <div className={`lg:hidden flex-shrink-0 flex items-center border-b ${d ? 'border-gray-700' : 'border-gray-200'}`}>
              <button onClick={() => setSidebarOpen(true)} className={`px-3 py-2.5 ${d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              {(['channels', 'chat'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setMobileTab(tab)}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors capitalize ${mobileTab === tab ? `border-b-2 border-indigo-500 ${d ? 'text-white' : 'text-gray-900'}` : d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {tab === 'channels' ? 'Channels' : 'Chat'}
                </button>
              ))}
            </div>

            <div className="flex flex-1 overflow-hidden">
              <div className={`${mobileTab === 'channels' ? 'flex' : 'hidden'} lg:flex flex-1 flex-col overflow-hidden`}>
                <TelegramBotSettings userId={userId} displayMode="page" isDarkMode={d} />
              </div>
              <div className={`${mobileTab === 'chat' ? 'flex flex-1' : 'hidden'} lg:flex lg:flex-none lg:w-[360px] flex-col border-l overflow-hidden ${d ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
                {chatPanel}
              </div>
            </div>
          </div>
        </div>
      </div>

      <MemorySaveModal
        isOpen={memoryOpen}
        onClose={() => { setMemoryOpen(false); setMemoryResult(null); }}
        loading={memoryLoading} result={memoryResult} isDarkMode={d}
      />
      <MyAlleracModal
        isOpen={isMyAlleracOpen} onClose={() => setIsMyAlleracOpen(false)}
        isDarkMode={d} userId={userId} githubToken={githubToken}
        userName={userName ?? undefined} domainSlug="channels"
      />
    </DomainProvider>
  );
}

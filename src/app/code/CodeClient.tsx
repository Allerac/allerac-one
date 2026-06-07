'use client';

import { useTheme } from '@/app/context/ThemeContext';
import { useState, useRef, useEffect, useCallback } from 'react';
import { MODELS } from '@/app/services/llm/models';
import type { Message, Conversation } from '@/app/types';
import { DomainProvider } from '@/app/context/DomainContext';
import { useConversations } from '@/app/hooks/useConversations';
import { useDomainChat } from '@/app/hooks/useDomainChat';
import SidebarDesktop from '@/app/components/layout/SidebarDesktop';
import SidebarMobile from '@/app/components/layout/SidebarMobile';
import ChatMessages from '@/app/components/chat/ChatMessages';
import ChatInput from '@/app/components/chat/ChatInput';
import MemorySaveModal from '@/app/components/memory/MemorySaveModal';
import MyAlleracModal from '@/app/components/allerac/MyAlleracModal';
import { AlleracIcon } from '@/app/components/ui/AlleracIcon';
import WorkspacePanel from './WorkspacePanel';
import FileEditProposal, { type EditProposal } from './FileEditProposal';

interface Props {
  userId: string;
  userName: string | null;
  userEmail: string;
  isAdmin: boolean;
  defaultSkillName?: string;
}

export default function CodeClient({ userId, userName, userEmail, isAdmin, defaultSkillName }: Props) {
  const { isDark: isDarkMode, toggleDark } = useTheme();
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [isSidebarOpen, setSidebarOpen]           = useState(false);
  const [mobileTab, setMobileTab]                 = useState<'files' | 'chat'>('files');
  const [workspaceLabel, setWorkspaceLabel]       = useState<{ project: string; file?: string } | null>(null);

  const workspaceContextRef = useRef('');

  const {
    conversations, currentConvId, setCurrentConvId,
    messages, setMessages,
    selectConversation, newConversation,
    deleteConversation, pinConversation, renameConversation, reload,
  } = useConversations(userId, 'code');

  const [pendingEdits, setPendingEdits] = useState<EditProposal[]>([]);
  const [fileRefreshKey, setFileRefreshKey] = useState(0);

  const handleConvCreated = useCallback((id: string) => {
    setCurrentConvId(id); reload();
  }, [setCurrentConvId, reload]);

  const handleStreamEvent = useCallback((event: any) => {
    if (event.type === 'file_edit_proposal') {
      setPendingEdits(prev => [...prev, {
        id: Date.now(),
        path: event.path,
        oldContent: event.oldContent,
        newContent: event.newContent,
        explanation: event.explanation,
      }]);
    }
  }, []);

  const {
    input, setInput, sending, selectedModel, setSelectedModel,
    convId, isAgentMode, toggleAgentMode, githubToken,
    messagesEndRef, lastToolCall, setLastToolCall,
    send, handleKeyPress, handleSaveToMemory,
    memoryOpen, setMemoryOpen, memoryLoading, memoryResult, setMemoryResult,
  } = useDomainChat({
    userId, domain: 'code', defaultSkillName,
    currentConvId, messages, setMessages,
    onConversationCreated: handleConvCreated,
    getPostContext: () => workspaceContextRef.current,
    onStreamEvent: handleStreamEvent,
  });

  const handleAcceptEdit = useCallback(async (proposal: EditProposal) => {
    const res = await fetch('/api/workspace/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: proposal.path, content: proposal.newContent }),
    });
    if (!res.ok) throw new Error('Save failed');
    setFileRefreshKey(k => k + 1);
  }, []);

  const handleRejectEdit = useCallback((id: number) => {
    setPendingEdits(prev => prev.filter(e => e.id !== id));
  }, []);

  const handleContextChange = useCallback((ctx: string, label: { project: string; file?: string } | null) => {
    workspaceContextRef.current = ctx;
    setWorkspaceLabel(label);
  }, []);

  const [isMyAlleracOpen, setIsMyAlleracOpen] = useState(false);
  useEffect(() => {
    const open = () => setIsMyAlleracOpen(true);
    window.addEventListener('openMyAlleracModal', open);
    return () => window.removeEventListener('openMyAlleracModal', open);
  }, []);

  const handleLogout = async () => { const { logout } = await import('@/app/actions/auth'); await logout(); };
  const loadConversation = useCallback(async (id: string) => { await selectConversation(id); }, [selectConversation]);
  const clearChat = useCallback(() => { newConversation(); }, [newConversation]);
  const handleDelete = useCallback(async (id: string) => { await deleteConversation(id); }, [deleteConversation]);

  const convList: Conversation[] = conversations.map(c => ({ ...c, pinned: c.pinned ?? false }));
  const activeSkill = defaultSkillName ? { name: defaultSkillName, display_name: defaultSkillName } : null;
  const currentTitle = conversations.find(c => c.id === convId)?.title;
  const displayName = userName?.split(' ')[0] || userName || 'there';
  const d = isDarkMode;

  const ContextPill = workspaceLabel ? (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 mb-2 rounded-lg border text-xs w-full truncate ${
      d ? 'border-gray-700 bg-gray-800 text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-500'
    }`}>
      <svg className="w-3.5 h-3.5 shrink-0 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span className="truncate">
        {workspaceLabel.file
          ? <><span className={d ? 'text-gray-500' : 'text-gray-400'}>{workspaceLabel.project} / </span>{workspaceLabel.file}</>
          : <><span className="text-indigo-400">📁</span> {workspaceLabel.project}</>
        }
      </span>
    </div>
  ) : null;

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
              isAdmin={isAdmin} onNewConversation={clearChat} userName={userName ?? undefined} userEmail={userEmail} onLogout={handleLogout} onToggleTheme={toggleDark}
            />
          </div>

          <div className="hidden lg:block">
            <SidebarDesktop
              isSidebarCollapsed={isSidebarCollapsed} setIsSidebarCollapsed={setSidebarCollapsed}
              isDarkMode={d} conversations={convList} currentConversationId={convId}
              loadConversation={loadConversation} deleteConversation={handleDelete}
              pinConversation={pinConversation} renameConversation={renameConversation}
              isAdmin={isAdmin} onNewConversation={clearChat} userName={userName ?? undefined} userEmail={userEmail} onLogout={handleLogout} onToggleTheme={toggleDark}
            />
          </div>

          <div className={`flex-1 flex flex-col overflow-hidden ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>

            {/* Mobile tab bar */}
            <div className={`lg:hidden flex-shrink-0 flex items-center border-b ${d ? 'border-gray-700' : 'border-gray-200'}`}>
              <button onClick={() => setSidebarOpen(true)} className={`px-3 py-2.5 ${d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              {(['files', 'chat'] as const).map(tab => (
                <button key={tab} onClick={() => setMobileTab(tab)}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    mobileTab === tab
                      ? `border-b-2 border-blue-500 ${d ? 'text-white' : 'text-gray-900'}`
                      : d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {tab === 'files' ? 'Files' : 'Chat'}
                </button>
              ))}
            </div>

            <div className="flex flex-1 overflow-hidden">

              {/* Workspace panel */}
              <div className={`${mobileTab === 'files' ? 'flex' : 'hidden'} lg:flex flex-1 flex-col overflow-hidden`}>
                <WorkspacePanel
                  userId={userId}
                  isDarkMode={d}
                  onContextChange={handleContextChange}
                  fileRefreshTrigger={fileRefreshKey}
                />
              </div>

              {/* Chat panel */}
              <div className={`${mobileTab === 'chat' ? 'flex flex-1' : 'hidden'} lg:flex lg:flex-none lg:w-[360px] flex-col border-l overflow-hidden ${d ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
                {messages.length === 0 && !sending ? (
                  <div className={`flex-1 flex flex-col items-center justify-center px-4 ${d ? 'bg-gray-900' : 'bg-white'}`}>
                    <div className="w-full max-w-sm">
                      <div className="text-center mb-8">
                        <div className="w-fit mx-auto mb-6"><AlleracIcon size={64} /></div>
                        <h2 className={`text-xl font-bold mb-2 ${d ? 'text-gray-100' : 'text-gray-900'}`}>Hello, {displayName}!</h2>
                        <h3 className={`text-sm font-medium ${d ? 'text-gray-400' : 'text-gray-600'}`}>How can I help you today?</h3>
                      </div>
                      {ContextPill}
                      <ChatInput
                        inputMessage={input} setInputMessage={setInput}
                        handleKeyPress={handleKeyPress} handleSendMessage={send}
                        isSending={sending} githubToken={githubToken} isDarkMode={d}
                        setIsDocumentModalOpen={() => {}} selectedModel={selectedModel}
                        setSelectedModel={setSelectedModel}
                        MODELS={MODELS} githubConfigured ollamaConnected googleConfigured
                        isAgentMode={isAgentMode} onToggleAgentMode={toggleAgentMode}
                        onSaveMemory={handleSaveToMemory} hasConversation={!!convId}
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
                        messagesEndRef={messagesEndRef} domainSlug="code"
                      />
                    </div>
                    {pendingEdits.length > 0 && (
                      <div className={`flex-shrink-0 px-3 pt-2 space-y-2 ${d ? 'bg-gray-900' : 'bg-white'}`}>
                        {pendingEdits.map(p => (
                          <FileEditProposal
                            key={p.id}
                            proposal={p}
                            isDarkMode={d}
                            onAccept={handleAcceptEdit}
                            onReject={handleRejectEdit}
                          />
                        ))}
                      </div>
                    )}
                    <div className={`flex-shrink-0 px-3 sm:px-4 pt-3 ${d ? 'bg-gray-900' : 'bg-white'}`}
                      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
                      {ContextPill}
                      <ChatInput
                        inputMessage={input} setInputMessage={setInput}
                        handleKeyPress={handleKeyPress} handleSendMessage={send}
                        isSending={sending} githubToken={githubToken} isDarkMode={d}
                        setIsDocumentModalOpen={() => {}} selectedModel={selectedModel}
                        setSelectedModel={setSelectedModel}
                        MODELS={MODELS} githubConfigured ollamaConnected googleConfigured
                        isAgentMode={isAgentMode} onToggleAgentMode={toggleAgentMode}
                        onSaveMemory={handleSaveToMemory} hasConversation={!!convId}
                      />
                    </div>
                  </>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>

      <MemorySaveModal
        isOpen={memoryOpen} onClose={() => { setMemoryOpen(false); setMemoryResult(null); }}
        loading={memoryLoading} result={memoryResult} isDarkMode={d}
      />
      <MyAlleracModal
        isOpen={isMyAlleracOpen}
        onClose={() => setIsMyAlleracOpen(false)}
        isDarkMode={d}
        userId={userId}
        githubToken={githubToken}
        userName={userName ?? undefined}
        domainSlug="code"
      />
    </DomainProvider>
  );
}

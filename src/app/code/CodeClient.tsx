'use client';

import { useTheme } from '@/app/context/ThemeContext';
import { useState, useRef, useEffect, useCallback } from 'react';
import { MODELS } from '@/app/services/llm/models';
import type { Message, Conversation } from '@/app/types';
import { DomainProvider } from '@/app/context/DomainContext';
import { useConversations } from '@/app/hooks/useConversations';
import SidebarDesktop from '@/app/components/layout/SidebarDesktop';
import SidebarMobile from '@/app/components/layout/SidebarMobile';
import ChatHeader from '@/app/components/chat/ChatHeader';
import ChatMessages from '@/app/components/chat/ChatMessages';
import ChatInput from '@/app/components/chat/ChatInput';
import MemorySaveModal from '@/app/components/memory/MemorySaveModal';
import MyAlleracModal from '@/app/components/allerac/MyAlleracModal';
import { AlleracIcon } from '@/app/components/ui/AlleracIcon';
import WorkspacePanel from './WorkspacePanel';
import FileEditProposal, { type EditProposal } from './FileEditProposal';
import * as memoryActions from '@/app/actions/memory';

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

  const [input, setInput]           = useState('');
  const [sending, setSending]       = useState(false);
  const [selectedModel, setModel]   = useState('gemini-2.5-flash');
  const [convId, setConvId]         = useState<string | null>(currentConvId);
  const [isAgentMode, setAgentMode] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const messagesEndRef              = useRef<HTMLDivElement>(null);

  const [pendingEdits, setPendingEdits] = useState<EditProposal[]>([]);
  const [fileRefreshKey, setFileRefreshKey] = useState(0);

  const [memoryOpen, setMemoryOpen]       = useState(false);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryResult, setMemoryResult]   = useState<{ success: boolean; message: string; summary?: string; topics?: string[] } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('selected_model');
    if (saved) setModel(saved);
    setGithubToken(localStorage.getItem('github_token') || '');
  }, []);

  useEffect(() => { setConvId(currentConvId); }, [currentConvId]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput(''); setSending(true);
    const requestStart = Date.now();

    setMessages(prev => [
      ...prev,
      { role: 'user', content: text, timestamp: new Date() },
      { role: 'assistant', content: '', timestamp: new Date() },
    ]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId: convId,
          model: selectedModel,
          provider: MODELS.find(m => m.id === selectedModel)?.provider || 'ollama',
          defaultSkillName,
          domain: 'code',
          ...(workspaceContextRef.current ? { postContext: workspaceContextRef.current } : {}),
        }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: any; try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === 'token') {
            setMessages(prev => {
              const m = [...prev]; const l = m[m.length - 1];
              if (l?.role === 'assistant') m[m.length - 1] = { ...l, content: l.content + event.content };
              return m;
            });
          } else if (event.type === 'done') {
            const elapsed = Date.now() - requestStart;
            setMessages(prev => {
              const m = [...prev]; const l = m[m.length - 1];
              if (l?.role === 'assistant') m[m.length - 1] = { ...l, responseTime: elapsed };
              return m;
            });
            if (event.conversationId && event.conversationId !== convId) {
              setConvId(event.conversationId);
              setCurrentConvId(event.conversationId);
              reload();
            }
          } else if (event.type === 'file_edit_proposal') {
            setPendingEdits(prev => [...prev, {
              id: Date.now(),
              path: event.path,
              oldContent: event.oldContent,
              newContent: event.newContent,
              explanation: event.explanation,
            }]);
          } else if (event.type === 'error') {
            setMessages(prev => {
              const m = [...prev];
              m[m.length - 1] = { ...m[m.length - 1], content: `Error: ${event.message}` };
              return m;
            });
          }
        }
      }
    } catch (err: any) {
      setMessages(prev => {
        const m = [...prev];
        m[m.length - 1] = { ...m[m.length - 1], content: `Error: ${err.message}` };
        return m;
      });
    } finally { setSending(false); }
  }, [input, sending, convId, selectedModel, defaultSkillName, setMessages, setCurrentConvId, reload]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const handleSaveToMemory = useCallback(async () => {
    if (!convId) return;
    setMemoryOpen(true); setMemoryLoading(true); setMemoryResult(null);
    try {
      const summary = await memoryActions.generateConversationSummary(convId, userId, githubToken, 'code');
      setMemoryResult(summary
        ? { success: true, message: 'Summary generated successfully!', summary: summary.summary, topics: summary.key_topics }
        : { success: false, message: 'Could not generate summary (possibly not enough messages)' }
      );
    } catch { setMemoryResult({ success: false, message: 'An unexpected error occurred' }); }
    finally { setMemoryLoading(false); }
  }, [convId, userId, githubToken]);

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
  const loadConversation = useCallback(async (id: string) => { await selectConversation(id); setConvId(id); }, [selectConversation]);
  const clearChat = useCallback(() => { newConversation(); setConvId(null); }, [newConversation]);
  const handleDelete = useCallback(async (id: string) => { await deleteConversation(id); if (convId === id) setConvId(null); }, [deleteConversation, convId]);

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

            {/* <ChatHeader
              isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setSidebarOpen}
              isDarkMode={d} toggleTheme={() => toggleDark}
              clearChat={clearChat} domainName="Code" activeSkill={activeSkill}
              currentConversationId={convId} currentConversationTitle={currentTitle}
              currentConversationHasMemory={false} handleGenerateSummary={handleSaveToMemory}
              hideHomeButton={!isAdmin} userName={userName ?? undefined} userEmail={userEmail}
              onLogout={handleLogout}
            /> */}

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
                        setSelectedModel={(m) => { setModel(m); localStorage.setItem('selected_model', m); }}
                        MODELS={MODELS} githubConfigured ollamaConnected googleConfigured
                        isAgentMode={isAgentMode} onToggleAgentMode={() => setAgentMode(v => !v)}
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
                        setSelectedModel={(m) => { setModel(m); localStorage.setItem('selected_model', m); }}
                        MODELS={MODELS} githubConfigured ollamaConnected googleConfigured
                        isAgentMode={isAgentMode} onToggleAgentMode={() => setAgentMode(v => !v)}
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

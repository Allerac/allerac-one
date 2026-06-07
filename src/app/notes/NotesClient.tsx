'use client';

import { useTheme } from '@/app/context/ThemeContext';
import { useState, useRef, useEffect, useCallback } from 'react';
import { MODELS } from '@/app/services/llm/models';
import type { Message, Conversation } from '@/app/types';
import type { ChatMessage } from '@/app/hooks/useConversations';
import { DomainProvider, type ToolCallEvent } from '@/app/context/DomainContext';
import { useConversations } from '@/app/hooks/useConversations';
import SidebarDesktop from '@/app/components/layout/SidebarDesktop';
import SidebarMobile from '@/app/components/layout/SidebarMobile';
import ChatHeader from '@/app/components/chat/ChatHeader';
import ChatMessages from '@/app/components/chat/ChatMessages';
import ChatInput from '@/app/components/chat/ChatInput';
import MemorySaveModal from '@/app/components/memory/MemorySaveModal';
import MyAlleracModal from '@/app/components/allerac/MyAlleracModal';
import VaultPanel from './VaultPanel';
import { AlleracIcon } from '@/app/components/ui/AlleracIcon';
import * as memoryActions from '@/app/actions/memory';
import { saveSelectedModel } from '@/app/actions/user';

interface Props {
  userId: string;
  userName: string | null;
  userEmail: string;
  isAdmin: boolean;
  defaultSkillName?: string;
}

export default function NotesClient({ userId, userName, userEmail, isAdmin, defaultSkillName }: Props) {
  const { isDark: isDarkMode, toggleDark } = useTheme();
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [isSidebarOpen, setSidebarOpen]       = useState(false);
  const [lastToolCall, setLastToolCall]       = useState<ToolCallEvent | null>(null);
  const [postContext, setPostContext]         = useState('');
  const postContextRef                        = useRef('');
  const [vaultRefresh, setVaultRefresh]       = useState(0);
  const [editorOpen, setEditorOpen]           = useState(false);
  const [mobileTab, setMobileTab]             = useState<'vault' | 'chat'>('vault');

  const {
    conversations, currentConvId, setCurrentConvId,
    messages, setMessages,
    selectConversation, newConversation,
    deleteConversation, pinConversation, renameConversation, reload,
  } = useConversations(userId, 'notes');

  const [input, setInput]           = useState('');
  const [sending, setSending]       = useState(false);
  const [selectedModel, setModel]   = useState('gemini-2.5-flash');
  const [convId, setConvId]         = useState<string | null>(currentConvId);
  const [isAgentMode, setAgentMode] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const messagesEndRef              = useRef<HTMLDivElement>(null);

  const [memoryOpen, setMemoryOpen]       = useState(false);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryResult, setMemoryResult]   = useState<{ success: boolean; message: string; summary?: string; topics?: string[] } | null>(null);
  const [isMyAlleracOpen, setIsMyAlleracOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('selected_model');
    if (saved) setModel(saved);
    setGithubToken(localStorage.getItem('github_token') || '');
  }, []);

  useEffect(() => { setConvId(currentConvId); }, [currentConvId]);
  useEffect(() => { postContextRef.current = postContext; }, [postContext]);

  useEffect(() => {
    const open = () => setIsMyAlleracOpen(true);
    window.addEventListener('openMyAlleracModal', open);
    return () => window.removeEventListener('openMyAlleracModal', open);
  }, []);

  const handleConvCreated = useCallback((id: string) => {
    setCurrentConvId(id); reload();
  }, [setCurrentConvId, reload]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
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
          domain: 'notes',
          ...(postContextRef.current ? { postContext: postContextRef.current } : {}),
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
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: any;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === 'token') {
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: last.content + event.content };
              return msgs;
            });
          } else if (event.type === 'tool_call') {
            setLastToolCall({ name: event.name, args: event.args, ts: Date.now() });
            if (['save_note', 'delete_note', 'update_note'].includes(event.name)) {
              setVaultRefresh(v => v + 1);
            }
          } else if (event.type === 'done') {
            const elapsed = Date.now() - requestStart;
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, responseTime: elapsed };
              return msgs;
            });
            if (event.conversationId && event.conversationId !== convId) {
              setConvId(event.conversationId);
              handleConvCreated(event.conversationId);
            }
          } else if (event.type === 'error') {
            setMessages(prev => {
              const msgs = [...prev];
              msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: `Error: ${event.message}` };
              return msgs;
            });
          }
        }
      }
    } catch (err: any) {
      setMessages(prev => {
        const msgs = [...prev];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: `Error: ${err.message}` };
        return msgs;
      });
    } finally {
      setSending(false);
    }
  }, [input, sending, convId, selectedModel, defaultSkillName, handleConvCreated, setMessages]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const handleSaveToMemory = useCallback(async () => {
    if (!convId) return;
    setMemoryOpen(true);
    setMemoryLoading(true);
    setMemoryResult(null);
    try {
      const summary = await memoryActions.generateConversationSummary(convId, userId, githubToken, 'notes');
      if (summary) {
        setMemoryResult({ success: true, message: 'Summary generated!', summary: summary.summary, topics: summary.key_topics });
      } else {
        setMemoryResult({ success: false, message: 'Could not generate summary.' });
      }
    } catch {
      setMemoryResult({ success: false, message: 'An unexpected error occurred.' });
    } finally {
      setMemoryLoading(false);
    }
  }, [convId, userId, githubToken]);

  const handleLogout = async () => {
    const { logout } = await import('@/app/actions/auth');
    await logout();
  };

  const loadConversation = useCallback(async (id: string) => {
    await selectConversation(id);
    setConvId(id);
  }, [selectConversation]);

  const clearChat = useCallback(() => { newConversation(); setConvId(null); }, [newConversation]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteConversation(id);
    if (convId === id) setConvId(null);
  }, [deleteConversation, convId]);

  const convList: Conversation[] = conversations.map(c => ({ ...c, pinned: c.pinned ?? false }));
  const activeSkill = defaultSkillName ? { name: defaultSkillName, display_name: defaultSkillName } : null;
  const currentTitle = conversations.find(c => c.id === convId)?.title;
  const d = isDarkMode;
  const displayName = userName?.split(' ')[0] || userName || 'there';

  return (
    <DomainProvider value={{ isDark: d, lastToolCall, setLastToolCall, postContext, setPostContext }}>
      <div className={`h-full flex flex-col ${d ? 'bg-gray-900' : 'bg-white'}`}>

        {isSidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        <div className="flex flex-1 overflow-hidden">

          <div className="lg:hidden">
            <SidebarMobile
              isSidebarOpen={isSidebarOpen}
              isDarkMode={d}
              onClose={() => setSidebarOpen(false)}
              conversations={convList}
              currentConversationId={convId}
              loadConversation={loadConversation}
              deleteConversation={handleDelete}
              pinConversation={pinConversation}
              renameConversation={renameConversation}
            />
          </div>

          <div className="hidden lg:block">
            <SidebarDesktop
              isSidebarCollapsed={isSidebarCollapsed}
              setIsSidebarCollapsed={setSidebarCollapsed}
              isDarkMode={d}
              conversations={convList}
              currentConversationId={convId}
              loadConversation={loadConversation}
              deleteConversation={handleDelete}
              pinConversation={pinConversation}
              renameConversation={renameConversation}
            />
          </div>

          <div className={`flex-1 flex flex-col overflow-hidden ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>

            {/* <ChatHeader
              isSidebarOpen={isSidebarOpen}
              setIsSidebarOpen={setSidebarOpen}
              isDarkMode={d}
              toggleTheme={() => toggleDark}
              clearChat={clearChat}
              domainName="Notes"
              activeSkill={activeSkill}
              currentConversationId={convId}
              currentConversationTitle={currentTitle}
              currentConversationHasMemory={false}
              handleGenerateSummary={handleSaveToMemory}
              hideHomeButton={!isAdmin}
              userName={userName ?? undefined}
              userEmail={userEmail}
              onLogout={handleLogout}
            /> */}

            {/* Mobile tab bar */}
            <div className={`lg:hidden flex-shrink-0 flex border-b ${d ? 'border-gray-700' : 'border-gray-200'}`}>
              {(['vault', 'chat'] as const).map(tab => (
                <button key={tab} onClick={() => setMobileTab(tab)}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors capitalize ${
                    mobileTab === tab
                      ? `border-b-2 border-indigo-500 ${d ? 'text-white' : 'text-gray-900'}`
                      : d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {tab === 'vault' ? 'Vault' : 'Chat'}
                </button>
              ))}
            </div>

            {/* Vault + Chat */}
            <div className="flex flex-1 overflow-hidden">

              {/* Vault panel — full screen on mobile when vault tab, expands on desktop when editor open */}
              <div className={`${mobileTab === 'vault' ? 'flex flex-1' : 'hidden'} lg:flex lg:flex-shrink-0 overflow-hidden transition-all duration-200 ${editorOpen ? 'lg:flex-1' : 'lg:w-80'}`}>
                <VaultPanel
                  userId={userId}
                  isDarkMode={d}
                  refreshTrigger={vaultRefresh}
                  onEditorToggle={setEditorOpen}
                />
              </div>

              {/* Chat panel — full screen on mobile when chat tab, shrinks on desktop when editor open */}
              <div className={`${mobileTab === 'chat' ? 'flex flex-1' : 'hidden'} lg:flex flex-col overflow-hidden border-l transition-all duration-200 ${
                editorOpen
                  ? `lg:flex-shrink-0 lg:w-96 ${d ? 'border-gray-800' : 'border-gray-200'}`
                  : `lg:flex-1 ${d ? 'border-gray-800' : 'border-gray-200'}`
              }`}>
                {messages.length === 0 && !sending ? (
                  <div className={`flex-1 flex flex-col items-center justify-center px-4 ${d ? 'bg-gray-900' : 'bg-white'}`}>
                    <div className="w-full max-w-lg">
                      <div className="text-center mb-8">
                        <div className="w-fit mx-auto mb-6"><AlleracIcon size={64} /></div>
                        <h2 className={`text-xl font-bold mb-2 ${d ? 'text-gray-100' : 'text-gray-900'}`}>
                          Hello, {displayName}!
                        </h2>
                        <h3 className={`text-sm font-medium ${d ? 'text-gray-400' : 'text-gray-600'}`}>
                          Save a note, recall something, or ask about your vault.
                        </h3>
                      </div>
                      <ChatInput
                        inputMessage={input} setInputMessage={setInput}
                        handleKeyPress={handleKeyPress} handleSendMessage={send}
                        isSending={sending} githubToken={githubToken} isDarkMode={d}
                        setIsDocumentModalOpen={() => {}}
                        selectedModel={selectedModel}
                        setSelectedModel={(m) => { setModel(m); localStorage.setItem('selected_model', m); saveSelectedModel(userId, m); }}
                        MODELS={MODELS}
                        githubConfigured={true} googleConfigured={true} ollamaConnected={true}
                        isAgentMode={isAgentMode} onToggleAgentMode={() => setAgentMode(v => !v)}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={`flex-1 overflow-y-auto ${d ? 'bg-gray-900' : 'bg-white'}`}>
                      <ChatMessages
                        messages={messages as unknown as Message[]}
                        isSending={sending} selectedModel={selectedModel} MODELS={MODELS}
                        isDarkMode={d} currentConversationId={convId}
                        userId={userId} githubToken={githubToken}
                        messagesEndRef={messagesEndRef} domainSlug="notes"
                      />
                    </div>
                    <div className={`flex-shrink-0 px-3 sm:px-4 pt-3 ${d ? 'bg-gray-900' : 'bg-white'}`} style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
                      <ChatInput
                        inputMessage={input} setInputMessage={setInput}
                        handleKeyPress={handleKeyPress} handleSendMessage={send}
                        isSending={sending} githubToken={githubToken} isDarkMode={d}
                        setIsDocumentModalOpen={() => {}}
                        selectedModel={selectedModel}
                        setSelectedModel={(m) => { setModel(m); localStorage.setItem('selected_model', m); saveSelectedModel(userId, m); }}
                        MODELS={MODELS}
                        githubConfigured={true} googleConfigured={true} ollamaConnected={true}
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
        isOpen={memoryOpen}
        onClose={() => { setMemoryOpen(false); setMemoryResult(null); }}
        loading={memoryLoading} result={memoryResult} isDarkMode={d}
      />
      <MyAlleracModal
        isOpen={isMyAlleracOpen}
        onClose={() => setIsMyAlleracOpen(false)}
        isDarkMode={d} userId={userId} githubToken={githubToken}
        userName={userName ?? undefined} domainSlug="notes"
      />
    </DomainProvider>
  );
}

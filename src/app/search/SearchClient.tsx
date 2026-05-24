'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MODELS } from '@/app/services/llm/models';
import type { Message, Conversation } from '@/app/types';
import { DomainProvider, type ToolCallEvent } from '@/app/context/DomainContext';
import { useConversations } from '@/app/hooks/useConversations';
import SidebarDesktop from '@/app/components/layout/SidebarDesktop';
import SidebarMobile from '@/app/components/layout/SidebarMobile';
import ChatHeader from '@/app/components/chat/ChatHeader';
import ChatMessages from '@/app/components/chat/ChatMessages';
import ChatInput from '@/app/components/chat/ChatInput';
import MemorySaveModal from '@/app/components/memory/MemorySaveModal';
import MyAlleracModal from '@/app/components/allerac/MyAlleracModal';
import { AlleracIcon } from '@/app/components/ui/AlleracIcon';
import SearchBar from '@/app/components/search/SearchBar';
import SearchResultsPanel from '@/app/components/search/SearchResultsPanel';
import * as memoryActions from '@/app/actions/memory';

interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

interface Props {
  userId: string;
  userName: string | null;
  userEmail: string;
  isAdmin: boolean;
  defaultSkillName?: string;
}

export default function SearchClient({ userId, userName, userEmail, isAdmin, defaultSkillName }: Props) {
  // — theme & sidebar —
  const [isDarkMode, setIsDarkMode]               = useState(true);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [isSidebarOpen, setSidebarOpen]           = useState(false);

  // — mobile tabs (component-first) —
  const [mobileTab, setMobileTab] = useState<'component' | 'chat'>('component');

  // — DomainContext state —
  const [lastToolCall, setLastToolCall] = useState<ToolCallEvent | null>(null);
  const [postContext, setPostContext]   = useState('');
  const postContextRef                  = useRef('');
  useEffect(() => { postContextRef.current = postContext; }, [postContext]);

  // — conversations —
  const {
    conversations, currentConvId, setCurrentConvId,
    messages, setMessages,
    selectConversation, newConversation,
    deleteConversation, pinConversation, renameConversation, reload,
  } = useConversations(userId, 'search');

  // — chat state —
  const [input, setInput]             = useState('');
  const [sending, setSending]         = useState(false);
  const [selectedModel, setModel]     = useState('gemini-2.5-flash');
  const [convId, setConvId]           = useState<string | null>(currentConvId);
  const [isAgentMode, setAgentMode]   = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const messagesEndRef                = useRef<HTMLDivElement>(null);
  useEffect(() => { setConvId(currentConvId); }, [currentConvId]);
  useEffect(() => {
    const saved = localStorage.getItem('selected_model');
    if (saved) setModel(saved);
    setGithubToken(localStorage.getItem('github_token') || '');
  }, []);

  // — search state —
  const [query, setQuery]               = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchAnswer, setSearchAnswer] = useState('');
  const [isSearching, setIsSearching]   = useState(false);

  // — memory modal —
  const [memoryOpen, setMemoryOpen]       = useState(false);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryResult, setMemoryResult]   = useState<any>(null);

  // — search —
  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q || isSearching) return;
    setIsSearching(true);
    setSearchResults([]);
    setSearchAnswer('');

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.error) { setSearchResults([]); return; }
      setSearchResults(data.results || []);
      setSearchAnswer(data.answer || '');

      const snippets = (data.results || [])
        .slice(0, 10)
        .map((r: SearchResult, i: number) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.content}`)
        .join('\n\n');
      const ctx = `## Web search results for "${q}"\n\n${data.answer ? `**Summary:** ${data.answer}\n\n` : ''}${snippets}\n\nThe user may ask follow-up questions about these results.`;
      setPostContext(ctx);
      postContextRef.current = ctx;
      setMobileTab('chat');
      sendAuto(q, ctx);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [query, isSearching, setPostContext]); // eslint-disable-line react-hooks/exhaustive-deps

  // — shared SSE stream reader —
  const convIdRef = useRef<string | null>(null);
  useEffect(() => { convIdRef.current = convId; }, [convId]);

  const applySearchResult = useCallback((data: any) => {
    if (!data?.results) return;
    setSearchResults(data.results);
    setSearchAnswer(data.answer || '');
    const snippets = data.results
      .slice(0, 10)
      .map((r: SearchResult, i: number) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.content}`)
      .join('\n\n');
    const ctx = `## Web search results for "${data.query ?? ''}"\n\n${data.answer ? `**Summary:** ${data.answer}\n\n` : ''}${snippets}`;
    setPostContext(ctx);
    postContextRef.current = ctx;
  }, [setPostContext]);

  const readStream = useCallback(async (res: Response, isAuto = false) => {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const requestStart = Date.now();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let event: any; try { event = JSON.parse(line.slice(6)); } catch { continue; }
        if (event.type === 'token') {
          setMessages(prev => { const m = [...prev]; const l = m[m.length-1]; if (l?.role==='assistant') m[m.length-1]={...l,content:l.content+event.content}; return m; });
        } else if (event.type === 'tool_call') {
          setLastToolCall({ name: event.name, args: event.args, ts: Date.now() });
          if (event.name === 'search_web' && event.args?.query) setQuery(event.args.query);
        } else if (event.type === 'tool_result' && event.name === 'search_web' && event.data) {
          applySearchResult(event.data);
        } else if (event.type === 'done') {
          const elapsed = Date.now() - requestStart;
          setMessages(prev => { const m=[...prev]; const l=m[m.length-1]; if(l?.role==='assistant') m[m.length-1]={...l,responseTime:elapsed}; return m; });
          if (event.conversationId && event.conversationId !== convIdRef.current) {
            setConvId(event.conversationId); setCurrentConvId(event.conversationId); reload();
          }
        } else if (!isAuto && event.type === 'error') {
          setMessages(prev => { const m=[...prev]; m[m.length-1]={...m[m.length-1],content:`Error: ${event.message}`}; return m; });
        }
      }
    }
  }, [applySearchResult, setLastToolCall, setCurrentConvId, reload, setMessages]);

  // — auto-analysis triggered after search —
  const sendAuto = useCallback(async (q: string, ctx: string) => {
    setSending(true);
    setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date() }]);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Summarize the key findings from these search results for "${q}". Be concise and highlight what matters most. End with 2-3 suggested follow-up questions.`,
          conversationId: convIdRef.current,
          model: selectedModel,
          provider: MODELS.find(m => m.id === selectedModel)?.provider || 'ollama',
          defaultSkillName, domain: 'search',
          postContext: ctx,
        }),
      });
      await readStream(res, true);
    } catch { /* silent */ } finally { setSending(false); }
  }, [selectedModel, defaultSkillName, readStream, setMessages]);

  // — send message (SSE stream) —
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput(''); setSending(true);
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
          message: text, conversationId: convIdRef.current,
          model: selectedModel,
          provider: MODELS.find(m => m.id === selectedModel)?.provider || 'ollama',
          defaultSkillName, domain: 'search',
          ...(postContextRef.current ? { postContext: postContextRef.current } : {}),
        }),
      });
      await readStream(res);
    } catch (err: any) {
      setMessages(prev => { const m=[...prev]; m[m.length-1]={...m[m.length-1],content:`Error: ${err.message}`}; return m; });
    } finally { setSending(false); }
  }, [input, sending, selectedModel, defaultSkillName, setMessages, readStream]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // — save to memory —
  const handleSaveToMemory = useCallback(async () => {
    if (!convId) return;
    setMemoryOpen(true); setMemoryLoading(true); setMemoryResult(null);
    try {
      const summary = await memoryActions.generateConversationSummary(convId, userId, githubToken);
      setMemoryResult(summary
        ? { success: true, message: 'Summary generated!', summary: summary.summary, topics: summary.key_topics }
        : { success: false, message: 'Not enough messages to summarize' }
      );
    } catch { setMemoryResult({ success: false, message: 'An unexpected error occurred' }); }
    finally { setMemoryLoading(false); }
  }, [convId, userId, githubToken]);

  const [isMyAlleracOpen, setIsMyAlleracOpen] = useState(false);
  useEffect(() => {
    const open = () => setIsMyAlleracOpen(true);
    window.addEventListener('openMyAlleracModal', open);
    return () => window.removeEventListener('openMyAlleracModal', open);
  }, []);

  const handleLogout = async () => { const { logout } = await import('@/app/actions/auth'); await logout(); };
  const loadConversation = useCallback(async (id: string) => { await selectConversation(id); setConvId(id); }, [selectConversation]);
  const clearChat = useCallback(() => { newConversation(); setConvId(null); }, [newConversation]);
  const handleDelete = useCallback(async (id: string) => { await deleteConversation(id); if (convId===id) setConvId(null); }, [deleteConversation, convId]);

  const convList: Conversation[] = conversations.map(c => ({ ...c, pinned: c.pinned ?? false }));
  const activeSkill = defaultSkillName ? { name: defaultSkillName, display_name: defaultSkillName } : null;
  const currentTitle = conversations.find(c => c.id === convId)?.title;
  const displayName = userName?.split(' ')[0] || userName || 'there';
  const d = isDarkMode;

  return (
    <DomainProvider value={{ isDark: d, lastToolCall, setLastToolCall, postContext, setPostContext }}>
      <div className={`h-dvh flex flex-col ${d ? 'bg-gray-900' : 'bg-white'}`}>
        {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

        <div className="flex flex-1 overflow-hidden">
          <div className="lg:hidden">
            <SidebarMobile isSidebarOpen={isSidebarOpen} isDarkMode={d} onClose={() => setSidebarOpen(false)}
              conversations={convList} currentConversationId={convId} loadConversation={loadConversation}
              deleteConversation={handleDelete} pinConversation={pinConversation} renameConversation={renameConversation} />
          </div>
          <div className="hidden lg:block">
            <SidebarDesktop isSidebarCollapsed={isSidebarCollapsed} setIsSidebarCollapsed={setSidebarCollapsed}
              isDarkMode={d} conversations={convList} currentConversationId={convId} loadConversation={loadConversation}
              deleteConversation={handleDelete} pinConversation={pinConversation} renameConversation={renameConversation} />
          </div>

          <div className={`flex-1 flex flex-col overflow-hidden ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
            <ChatHeader isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setSidebarOpen}
              isDarkMode={d} toggleTheme={() => setIsDarkMode(v => !v)} clearChat={clearChat}
              domainName="Search" activeSkill={activeSkill}
              currentConversationId={convId} currentConversationTitle={currentTitle}
              currentConversationHasMemory={false} handleGenerateSummary={handleSaveToMemory}
              hideHomeButton={!isAdmin} userName={userName ?? undefined} userEmail={userEmail} onLogout={handleLogout} />

            {/* Mobile tab bar */}
            <div className={`lg:hidden flex-shrink-0 flex border-b ${d ? 'border-gray-700' : 'border-gray-200'}`}>
              {(['component', 'chat'] as const).map(tab => (
                <button key={tab} onClick={() => setMobileTab(tab)}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    mobileTab === tab
                      ? `border-b-2 border-blue-500 ${d ? 'text-white' : 'text-gray-900'}`
                      : d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {tab === 'component' ? 'Results' : 'Chat'}
                </button>
              ))}
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Results panel — flex-1, fills all available space */}
              <div className={`${mobileTab === 'component' ? 'flex' : 'hidden'} lg:flex flex-1 flex-col overflow-hidden`}>
                <SearchBar query={query} setQuery={setQuery} onSearch={handleSearch} isSearching={isSearching} isDarkMode={d} />
                <SearchResultsPanel query={query} answer={searchAnswer} results={searchResults} isSearching={isSearching} isDarkMode={d} />
              </div>

              {/* Chat panel — 360px on desktop, full-width on mobile */}
              <div className={`${mobileTab === 'chat' ? 'flex flex-1' : 'hidden'} lg:flex lg:flex-none lg:w-[360px] flex-col border-l overflow-hidden ${d ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
                {messages.length === 0 && !sending ? (
                  <div className={`flex-1 flex flex-col items-center justify-center px-4 ${d ? 'bg-gray-900' : 'bg-white'}`}>
                    <div className="w-full max-w-sm">
                      <div className="text-center mb-8">
                        <div className="w-fit mx-auto mb-6"><AlleracIcon size={64} /></div>
                        <h2 className={`text-xl font-bold mb-2 ${d ? 'text-gray-100' : 'text-gray-900'}`}>Hello, {displayName}!</h2>
                        <h3 className={`text-sm font-medium ${d ? 'text-gray-400' : 'text-gray-600'}`}>Search something and ask me about the results.</h3>
                      </div>
                      <ChatInput inputMessage={input} setInputMessage={setInput} handleKeyPress={handleKeyPress}
                        handleSendMessage={send} isSending={sending} githubToken={githubToken} isDarkMode={d}
                        setIsDocumentModalOpen={() => {}} selectedModel={selectedModel}
                        setSelectedModel={(m) => { setModel(m); localStorage.setItem('selected_model', m); }}
                        MODELS={MODELS} githubConfigured ollamaConnected googleConfigured
                        isAgentMode={isAgentMode} onToggleAgentMode={() => setAgentMode(v => !v)} />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={`flex-1 overflow-y-auto ${d ? 'bg-gray-900' : 'bg-white'}`}>
                      <ChatMessages messages={messages as unknown as Message[]} isSending={sending}
                        selectedModel={selectedModel} MODELS={MODELS} isDarkMode={d}
                        currentConversationId={convId} userId={userId} githubToken={githubToken} messagesEndRef={messagesEndRef} />
                    </div>
                    <div className={`flex-shrink-0 px-3 sm:px-4 pt-3 ${d ? 'bg-gray-900' : 'bg-white'}`}
                      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
                      <ChatInput inputMessage={input} setInputMessage={setInput} handleKeyPress={handleKeyPress}
                        handleSendMessage={send} isSending={sending} githubToken={githubToken} isDarkMode={d}
                        setIsDocumentModalOpen={() => {}} selectedModel={selectedModel}
                        setSelectedModel={(m) => { setModel(m); localStorage.setItem('selected_model', m); }}
                        MODELS={MODELS} githubConfigured ollamaConnected googleConfigured
                        isAgentMode={isAgentMode} onToggleAgentMode={() => setAgentMode(v => !v)} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <MemorySaveModal isOpen={memoryOpen} onClose={() => { setMemoryOpen(false); setMemoryResult(null); }}
        loading={memoryLoading} result={memoryResult} isDarkMode={d} />
      <MyAlleracModal
        isOpen={isMyAlleracOpen}
        onClose={() => setIsMyAlleracOpen(false)}
        isDarkMode={d}
        userId={userId}
        githubToken={githubToken}
        userName={userName ?? undefined}
        domainSlug="search"
      />
    </DomainProvider>
  );
}

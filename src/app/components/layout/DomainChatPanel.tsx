'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MODELS } from '@/app/services/llm/models';
import type { Message } from '@/app/types';
import type { ChatMessage } from '@/app/hooks/useConversations';
import { useDomainContext } from '@/app/context/DomainContext';
import { AlleracIcon } from '@/app/components/ui/AlleracIcon';
import ChatMessages from '@/app/components/chat/ChatMessages';
import ChatInput from '@/app/components/chat/ChatInput';
import MemorySaveModal from '@/app/components/memory/MemorySaveModal';
import * as memoryActions from '@/app/actions/memory';
import { saveSelectedModel } from '@/app/actions/user';

interface Props {
  userId: string;
  userName: string | null;
  domainSlug: string;
  defaultSkillName?: string;
  currentConvId: string | null;
  messages: ChatMessage[];
  setMessages: (fn: (prev: ChatMessage[]) => ChatMessage[]) => void;
  onConversationCreated: (convId: string) => void;
  isFull?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function DomainChatPanel({
  userId, userName, domainSlug, defaultSkillName,
  currentConvId, messages, setMessages, onConversationCreated,
  isFull = false, collapsed = false, onToggleCollapse,
}: Props) {
  const { setLastToolCall, postContext, isDark } = useDomainContext();
  const d = isDark;

  const [input, setInput]         = useState('');
  const [sending, setSending]     = useState(false);
  const [selectedModel, setModel] = useState('gemini-2.5-flash');
  const [convId, setConvId]       = useState<string | null>(currentConvId);
  const [isAgentMode, setIsAgentMode] = useState(false);
  const messagesEndRef            = useRef<HTMLDivElement>(null);
  const [githubToken, setGithubToken] = useState('');

  const [memoryModalOpen, setMemoryModalOpen]   = useState(false);
  const [memoryLoading, setMemoryLoading]       = useState(false);
  const [memoryResult, setMemoryResult]         = useState<{ success: boolean; message: string; summary?: string; importance?: number; topics?: string[] } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('selected_model');
    if (saved) setModel(saved);
    const token = localStorage.getItem('github_token') || '';
    setGithubToken(token);
  }, []);

  useEffect(() => { setConvId(currentConvId); }, [currentConvId]);

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
          domain: domainSlug,
          ...(postContext ? { postContext } : {}),
        }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

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
              onConversationCreated(event.conversationId);
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
  }, [input, sending, convId, selectedModel, domainSlug, defaultSkillName, postContext, setLastToolCall, onConversationCreated, setMessages]);

  const handleSaveToMemory = useCallback(async () => {
    if (!convId || !userId) return;
    setMemoryModalOpen(true);
    setMemoryLoading(true);
    setMemoryResult(null);
    try {
      const summary = await memoryActions.generateConversationSummary(convId, userId, undefined, domainSlug);
      if (summary) {
        setMemoryResult({ success: true, message: 'Summary generated successfully!', summary: summary.summary, topics: summary.key_topics });
      } else {
        setMemoryResult({ success: false, message: 'Could not generate summary (possibly not enough messages)' });
      }
    } catch {
      setMemoryResult({ success: false, message: 'An unexpected error occurred' });
    } finally {
      setMemoryLoading(false);
    }
  }, [convId, userId, githubToken]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // Collapsed strip
  if (collapsed) {
    return (
      <div className={`w-[52px] flex-shrink-0 border-l flex flex-col items-center py-2 gap-1 ${d ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        <button
          onClick={onToggleCollapse}
          className={`p-2 rounded-lg transition-colors ${d ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}
          title="Expand chat"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </button>
        {messages.length > 0 && (
          <span className={`text-xs font-medium ${d ? 'text-gray-500' : 'text-gray-400'}`}>
            {messages.filter(m => m.role === 'user').length}
          </span>
        )}
      </div>
    );
  }

  const panelClass = isFull
    ? `flex-1 flex flex-col border-l overflow-hidden ${d ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`
    : `w-[400px] flex-shrink-0 flex flex-col border-l overflow-hidden ${d ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`;

  const displayName = userName?.split(' ')[0] || userName || 'there';

  return (
    <div className={panelClass}>

      {/* Model selector strip */}
      <div className={`flex-shrink-0 h-11 flex items-center gap-2 px-3 border-b ${d ? 'border-gray-800' : 'border-gray-200'}`}>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${d ? 'text-gray-500 hover:bg-gray-800' : 'text-gray-400 hover:bg-gray-100'}`}
            title="Collapse chat"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <div className="flex-1" />
        {convId && (
          <button
            onClick={handleSaveToMemory}
            title="Save to memory"
            className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${d ? 'text-gray-500 hover:bg-gray-800 hover:text-gray-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
        )}
        <select
          value={selectedModel}
          onChange={e => { setModel(e.target.value); localStorage.setItem('selected_model', e.target.value); saveSelectedModel(userId, e.target.value); }}
          className={`text-xs rounded-md px-2 py-1 border outline-none cursor-pointer ${d ? 'bg-gray-800 text-gray-400 border-gray-700' : 'bg-gray-100 text-gray-600 border-gray-200'}`}
        >
          {MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Messages or empty state */}
      {messages.length === 0 && !sending ? (
        <div className={`flex-1 flex flex-col items-center justify-center px-4 ${d ? 'bg-gray-900' : 'bg-white'}`}>
          <div className="w-full max-w-lg">
            <div className="text-center mb-8">
              <div className="w-fit mx-auto mb-6">
                <AlleracIcon size={80} />
              </div>
              <h2 className={`text-2xl font-bold mb-2 ${d ? 'text-gray-100' : 'text-gray-900'}`}>
                Hello, {displayName}!
              </h2>
              <h3 className={`text-base font-medium ${d ? 'text-gray-400' : 'text-gray-600'}`}>
                How can I help you today?
              </h3>
            </div>
            <ChatInput
              inputMessage={input}
              setInputMessage={setInput}
              handleKeyPress={handleKeyPress}
              handleSendMessage={send}
              isSending={sending}
              githubToken=""
              isDarkMode={d}
              setIsDocumentModalOpen={() => {}}
              selectedModel={selectedModel}
              setSelectedModel={(m) => { setModel(m); localStorage.setItem('selected_model', m); saveSelectedModel(userId, m); }}
              MODELS={MODELS}
              githubConfigured={true}
              googleConfigured={true}
              ollamaConnected={true}
              isAgentMode={isAgentMode}
              onToggleAgentMode={() => setIsAgentMode(v => !v)}
            />
          </div>
        </div>
      ) : (
        <>
          <div className={`flex-1 overflow-y-auto ${d ? 'bg-gray-900' : 'bg-white'}`}>
            <ChatMessages
              messages={messages as unknown as Message[]}
              isSending={sending}
              selectedModel={selectedModel}
              MODELS={MODELS}
              isDarkMode={d}
              currentConversationId={convId}
              userId={userId}
              githubToken=""
              messagesEndRef={messagesEndRef}
              domainSlug={domainSlug}
            />
          </div>
          <div className={`flex-shrink-0 ${d ? 'bg-gray-900' : 'bg-white'}`}>
            <div className="max-w-3xl mx-auto px-3 sm:px-4 pt-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
              <ChatInput
                inputMessage={input}
                setInputMessage={setInput}
                handleKeyPress={handleKeyPress}
                handleSendMessage={send}
                isSending={sending}
                githubToken=""
                isDarkMode={d}
                setIsDocumentModalOpen={() => {}}
                selectedModel={selectedModel}
                setSelectedModel={(m) => { setModel(m); localStorage.setItem('selected_model', m); saveSelectedModel(userId, m); }}
                MODELS={MODELS}
                githubConfigured={true}
                googleConfigured={true}
                ollamaConnected={true}
                isAgentMode={isAgentMode}
                onToggleAgentMode={() => setIsAgentMode(v => !v)}
              />
            </div>
          </div>
        </>
      )}

      <MemorySaveModal
        isOpen={memoryModalOpen}
        onClose={() => { setMemoryModalOpen(false); setMemoryResult(null); }}
        loading={memoryLoading}
        result={memoryResult}
        isDarkMode={d}
      />
    </div>
  );
}

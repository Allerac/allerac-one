'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MODELS } from '@/app/services/llm/models';
import type { ChatMessage } from '@/app/hooks/useConversations';
import * as memoryActions from '@/app/actions/memory';
import { saveSelectedModel } from '@/app/actions/user';
import type { ToolCallEvent } from '@/app/context/DomainContext';

interface MemoryResult { success: boolean; message: string; summary?: string; topics?: string[]; }

interface UseDomainChatOptions {
  userId: string;
  domain: string;
  defaultSkillName?: string;
  currentConvId: string | null;
  messages: ChatMessage[];
  setMessages: (fn: (prev: ChatMessage[]) => ChatMessage[]) => void;
  onConversationCreated: (convId: string) => void;
  getPostContext?: () => string;
  onToolCall?: (toolName: string, args: any) => void;
  /** Called for every SSE event that the hook does not handle itself (e.g. file_edit_proposal) */
  onStreamEvent?: (event: any) => void;
}

export function useDomainChat({
  userId,
  domain,
  defaultSkillName,
  currentConvId,
  setMessages,
  onConversationCreated,
  getPostContext,
  onToolCall,
  onStreamEvent,
}: UseDomainChatOptions) {
  const [input, setInput]             = useState('');
  const [sending, setSending]         = useState(false);
  const [selectedModel, setModelState] = useState('gemini-2.5-flash');
  const [convId, setConvId]           = useState<string | null>(currentConvId);
  const [isAgentMode, setAgentMode]   = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const messagesEndRef                = useRef<HTMLDivElement>(null);
  const convIdRef                     = useRef<string | null>(null);

  const [lastToolCall, setLastToolCall] = useState<ToolCallEvent | null>(null);
  const [memoryOpen, setMemoryOpen]     = useState(false);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryResult, setMemoryResult] = useState<MemoryResult | null>(null);

  // Sync convId state from prop changes
  useEffect(() => {
    setConvId(currentConvId);
    convIdRef.current = currentConvId;
  }, [currentConvId]);

  // Keep convIdRef in sync with convId state
  useEffect(() => {
    convIdRef.current = convId;
  }, [convId]);

  // Load model and token from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('selected_model');
    if (saved) setModelState(saved);
    setGithubToken(localStorage.getItem('github_token') || '');
  }, []);

  const setSelectedModel = useCallback((m: string) => {
    setModelState(m);
    localStorage.setItem('selected_model', m);
    saveSelectedModel(userId, m);
  }, [userId]);

  const toggleAgentMode = useCallback(() => {
    setAgentMode(v => !v);
  }, []);

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
      const postContext = getPostContext?.() ?? '';
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId: convIdRef.current,
          model: selectedModel,
          provider: MODELS.find(m => m.id === selectedModel)?.provider || 'ollama',
          defaultSkillName,
          domain,
          ...(postContext ? { postContext } : {}),
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
              const m = [...prev];
              const l = m[m.length - 1];
              if (l?.role === 'assistant') m[m.length - 1] = { ...l, content: l.content + event.content };
              return m;
            });
          } else if (event.type === 'tool_call') {
            setLastToolCall({ name: event.name, args: event.args, ts: Date.now() });
            onToolCall?.(event.name, event.args);
          } else if (event.type === 'done') {
            const elapsed = Date.now() - requestStart;
            setMessages(prev => {
              const m = [...prev];
              const l = m[m.length - 1];
              if (l?.role === 'assistant') m[m.length - 1] = { ...l, responseTime: elapsed };
              return m;
            });
            if (event.conversationId && event.conversationId !== convIdRef.current) {
              setConvId(event.conversationId);
              convIdRef.current = event.conversationId;
              onConversationCreated(event.conversationId);
            }
          } else if (event.type === 'error') {
            setMessages(prev => {
              const m = [...prev];
              m[m.length - 1] = { ...m[m.length - 1], content: `Error: ${event.message}` };
              return m;
            });
          } else {
            onStreamEvent?.(event);
          }
        }
      }
    } catch (err: any) {
      setMessages(prev => {
        const m = [...prev];
        m[m.length - 1] = { ...m[m.length - 1], content: `Error: ${err.message}` };
        return m;
      });
    } finally {
      setSending(false);
    }
  }, [input, sending, selectedModel, defaultSkillName, domain, getPostContext, onToolCall, onStreamEvent, onConversationCreated, setMessages]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }, [send]);

  const handleSaveToMemory = useCallback(async () => {
    if (!convIdRef.current) return;
    setMemoryOpen(true);
    setMemoryLoading(true);
    setMemoryResult(null);
    try {
      const summary = await memoryActions.generateConversationSummary(convIdRef.current, userId, githubToken, domain);
      setMemoryResult(summary
        ? { success: true, message: 'Summary generated!', summary: summary.summary, topics: summary.key_topics }
        : { success: false, message: 'Not enough messages to summarize' }
      );
    } catch {
      setMemoryResult({ success: false, message: 'An unexpected error occurred' });
    } finally {
      setMemoryLoading(false);
    }
  }, [userId, githubToken, domain]);

  return {
    input,
    setInput,
    sending,
    selectedModel,
    setSelectedModel,
    convId,
    isAgentMode,
    toggleAgentMode,
    githubToken,
    messagesEndRef,
    lastToolCall,
    setLastToolCall,
    send,
    handleKeyPress,
    handleSaveToMemory,
    memoryOpen,
    setMemoryOpen,
    memoryLoading,
    memoryResult,
    setMemoryResult,
  };
}

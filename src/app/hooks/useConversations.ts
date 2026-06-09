'use client';

import { useState, useCallback, useEffect } from 'react';
import * as chatActions from '@/app/actions/chat';

export interface ConvItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  pinned?: boolean;
  domain_slug?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  responseTime?: number;
  actions?: any[];
}

export function useConversations(userId: string, domainSlug: string) {
  const [conversations, setConversations] = useState<ConvItem[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const reload = useCallback(async () => {
    const data = await chatActions.loadConversations(domainSlug);
    setConversations(data || []);
  }, [userId, domainSlug]);

  useEffect(() => { reload(); }, [reload]);

  const selectConversation = useCallback(async (convId: string) => {
    const data = await chatActions.loadMessages(convId);
    setMessages(
      (data || []).map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content, timestamp: new Date() }))
    );
    setCurrentConvId(convId);
  }, []);

  const newConversation = useCallback(() => {
    setCurrentConvId(null);
    setMessages([]);
  }, []);

  const deleteConversation = useCallback(async (convId: string) => {
    await chatActions.deleteConversation(convId);
    if (currentConvId === convId) newConversation();
    reload();
  }, [currentConvId, reload, newConversation]);

  const pinConversation = useCallback(async (convId: string, pinned: boolean) => {
    await chatActions.pinConversation(convId, pinned);
    reload();
  }, [reload]);

  const renameConversation = useCallback(async (convId: string, title: string) => {
    await chatActions.renameConversation(convId, title);
    reload();
  }, [reload]);

  return {
    conversations,
    currentConvId,
    setCurrentConvId,
    messages,
    setMessages,
    selectConversation,
    newConversation,
    deleteConversation,
    pinConversation,
    renameConversation,
    reload,
  };
}

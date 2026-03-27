'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Participant {
  id: string;
  username?: string;
  name?: string;
}

interface Conversation {
  id: string;
  updated_time: string;
  participants: { data: Participant[] };
}

interface Message {
  id: string;
  message: string;
  from: { id: string; username?: string; name?: string };
  created_time: string;
}

interface InstagramDMPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getOtherParticipant(conv: Conversation, myId: string): Participant {
  const others = conv.participants.data.filter(p => p.id !== myId);
  return others[0] ?? conv.participants.data[0];
}

export default function InstagramDMPanel({ isOpen, onClose, isDarkMode }: InstagramDMPanelProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [myId, setMyId]                   = useState('');
  const [selectedConv, setSelectedConv]   = useState<Conversation | null>(null);
  const [messages, setMessages]           = useState<Message[]>([]);
  const [replyText, setReplyText]         = useState('');
  const [loading, setLoading]             = useState(false);
  const [msgLoading, setMsgLoading]       = useState(false);
  const [sending, setSending]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [sendError, setSendError]         = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const border   = isDarkMode ? 'border-gray-700' : 'border-gray-200';
  const textMuted = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const bg       = isDarkMode ? 'bg-gray-900' : 'bg-white';
  const bgSub    = isDarkMode ? 'bg-gray-800' : 'bg-gray-50';
  const textMain = isDarkMode ? 'text-gray-100' : 'text-gray-900';

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/instagram/conversations');
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to load conversations');
        return;
      }
      const data = await res.json();
      setConversations(data.conversations ?? []);
      setMyId(data.igUserId ?? '');
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadConversations();
      setSelectedConv(null);
      setMessages([]);
      setReplyText('');
    }
  }, [isOpen, loadConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function selectConversation(conv: Conversation) {
    setSelectedConv(conv);
    setMessages([]);
    setMsgLoading(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/instagram/conversations?conversationId=${conv.id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages((data.messages ?? []).slice().reverse()); // oldest first
      }
    } finally {
      setMsgLoading(false);
    }
  }

  async function handleSend() {
    if (!replyText.trim() || !selectedConv) return;
    const other = getOtherParticipant(selectedConv, myId);
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch('/api/instagram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: other.id, text: replyText.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setSendError(data.error ?? 'Failed to send');
        return;
      }
      // Optimistically add the message
      setMessages(prev => [...prev, {
        id: `local-${Date.now()}`,
        message: replyText.trim(),
        from: { id: myId },
        created_time: new Date().toISOString(),
      }]);
      setReplyText('');
    } catch {
      setSendError('Network error');
    } finally {
      setSending(false);
    }
  }

  if (!isOpen) return null;

  const panel = `fixed inset-y-0 right-0 z-50 flex flex-col shadow-2xl overflow-hidden
    w-full sm:w-[680px] ${bg}`;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className={panel}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${border} flex-shrink-0`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </div>
            <div>
              <h2 className={`text-base font-semibold ${textMain}`}>Instagram DMs</h2>
              {selectedConv && (
                <p className={`text-xs ${textMuted}`}>
                  {getOtherParticipant(selectedConv, myId).username
                    ? `@${getOtherParticipant(selectedConv, myId).username}`
                    : getOtherParticipant(selectedConv, myId).name ?? 'Unknown'}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedConv && (
              <button
                onClick={() => { setSelectedConv(null); setMessages([]); }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                  ${isDarkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                All DMs
              </button>
            )}
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'text-gray-400 hover:bg-gray-700 hover:text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {error && (
            <div className="m-4 px-4 py-3 rounded-lg bg-red-500/10 text-red-500 text-sm border border-red-500/20">
              {error === 'Instagram not connected'
                ? 'Instagram not connected. Go to ⚙️ Settings → 📸 Social to connect.'
                : error}
            </div>
          )}

          {loading && (
            <div className={`flex-1 flex items-center justify-center ${textMuted} text-sm`}>
              Loading conversations…
            </div>
          )}

          {/* Conversation list */}
          {!loading && !error && !selectedConv && (
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className={`p-8 text-center ${textMuted} text-sm`}>
                  <p>No DM conversations found.</p>
                  <p className="mt-1 text-xs">Instagram only shows conversations where customers have messaged first.</p>
                </div>
              ) : (
                conversations.map(conv => {
                  const other = getOtherParticipant(conv, myId);
                  const initials = (other.username ?? other.name ?? '?').charAt(0).toUpperCase();
                  return (
                    <button
                      key={conv.id}
                      onClick={() => selectConversation(conv)}
                      className={`w-full flex items-center gap-3 px-4 py-3 border-b text-left transition-colors
                        ${border}
                        ${isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}`}
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={`text-sm font-medium truncate ${textMain}`}>
                            {other.username ? `@${other.username}` : (other.name ?? 'Unknown')}
                          </span>
                          <span className={`text-xs flex-shrink-0 ${textMuted}`}>
                            {fmtTime(conv.updated_time)}
                          </span>
                        </div>
                        <p className={`text-xs truncate ${textMuted}`}>
                          {conv.participants.data.length} participant{conv.participants.data.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <svg className={`h-4 w-4 flex-shrink-0 ${textMuted}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Message thread */}
          {selectedConv && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {msgLoading && (
                  <div className={`text-center text-sm ${textMuted}`}>Loading messages…</div>
                )}
                {!msgLoading && messages.length === 0 && (
                  <div className={`text-center text-sm ${textMuted}`}>No messages found.</div>
                )}
                {messages.map(msg => {
                  const isMe = msg.from.id === myId;
                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm
                        ${isMe
                          ? 'bg-gradient-to-br from-purple-600 to-pink-600 text-white rounded-br-md'
                          : isDarkMode
                            ? 'bg-gray-700 text-gray-100 rounded-bl-md'
                            : 'bg-gray-100 text-gray-900 rounded-bl-md'}`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                        <p className={`text-xs mt-1 ${isMe ? 'text-white/60' : textMuted}`}>
                          {fmtTime(msg.created_time)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Compose */}
              <div className={`p-4 border-t ${border} flex-shrink-0`}>
                {sendError && (
                  <div className="mb-2 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-xs border border-red-500/20">
                    {sendError}
                  </div>
                )}
                <div className={`flex items-end gap-2 rounded-xl border ${border} ${bgSub} px-3 py-2`}>
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Reply… (Enter to send, Shift+Enter for newline)"
                    rows={2}
                    className={`flex-1 bg-transparent resize-none text-sm outline-none ${textMain} placeholder:${textMuted}`}
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !replyText.trim()}
                    className="flex-shrink-0 p-2 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 text-white disabled:opacity-40 transition-opacity"
                    title="Send"
                  >
                    {sending ? (
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className={`mt-1.5 text-xs ${textMuted}`}>
                  Tip: ask the Social AI to draft a reply, then paste it here.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

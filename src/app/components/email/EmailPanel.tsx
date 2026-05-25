'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as emailActions from '@/app/actions/email';
import type { EmailAccountRow } from '@/app/actions/email';
import AddAccountModal from './AddAccountModal';
import ComposeModal from './ComposeModal';

interface EmailSummary {
  uid: number;
  messageId: string;
  subject: string;
  from: string;
  fromName: string;
  date: string;
  snippet: string;
  seen: boolean;
}

interface EmailDetail extends EmailSummary {
  to: string;
  cc: string;
  bodyText: string;
  bodyHtml: string;
}

interface Props {
  isDarkMode: boolean;
  onContextUpdate: (ctx: string) => void;
}

function relativeDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (diff < 7 * 86400000) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function EmailPanel({ isDarkMode: d, onContextUpdate }: Props) {
  const [accounts, setAccounts]           = useState<EmailAccountRow[]>([]);
  const [selectedAccount, setSelected]    = useState<string | null>(null);
  const [messages, setMessages]           = useState<EmailSummary[]>([]);
  const [loadingMsgs, setLoadingMsgs]     = useState(false);
  const [selectedMsg, setSelectedMsg]     = useState<EmailDetail | null>(null);
  const [loadingMsg, setLoadingMsg]       = useState(false);
  const [loadingUid, setLoadingUid]       = useState<number | null>(null);
  const [deletingUid, setDeletingUid]     = useState<number | null>(null);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<number | null>(null);
  const [revealedUid, setRevealedUid]     = useState<number | null>(null);
  const swipeRef = useRef<{ x: number; y: number; el: HTMLDivElement; uid: number; decided: boolean } | null>(null);
  const REVEAL_W = 72;
  const [addOpen, setAddOpen]             = useState(false);
  const [composeOpen, setComposeOpen]     = useState(false);
  const [replyData, setReplyData]         = useState<{ to: string; subject: string; inReplyTo: string; references: string } | null>(null);

  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    emailActions.listEmailAccounts().then(list => {
      setAccounts(list);
      if (list.length > 0) {
        setSelected(list[0].id);
        fetchMessages(list[0].id);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAccounts = useCallback(async () => {
    const list = await emailActions.listEmailAccounts();
    setAccounts(list);
  }, []);

  const fetchMessages = useCallback(async (accountId: string) => {
    setLoadingMsgs(true);
    setSelectedMsg(null);
    onContextUpdate('');
    try {
      const res = await fetch(`/api/email/messages?accountId=${accountId}`);
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch { setMessages([]); }
    finally { setLoadingMsgs(false); }
  }, [onContextUpdate]);

  const openMessage = async (msg: EmailSummary) => {
    if (!selectedAccount || loadingUid === msg.uid) return;
    setConfirmDeleteUid(null);
    setRevealedUid(null);
    setLoadingUid(msg.uid);
    setLoadingMsg(true);
    try {
      const res = await fetch(`/api/email/message?accountId=${selectedAccount}&uid=${msg.uid}`);
      const data = await res.json();
      if (data.message) {
        setSelectedMsg(data.message);
        setMessages(prev => prev.map(m => m.uid === msg.uid ? { ...m, seen: true } : m));
        const ctx = `## Email context\n**From:** ${data.message.fromName || data.message.from}\n**Subject:** ${data.message.subject}\n**Date:** ${new Date(data.message.date).toLocaleString()}\n\n${data.message.bodyText?.slice(0, 2000) ?? ''}\n\nThe user is viewing this email and may ask questions about it.`;
        onContextUpdate(ctx);
      }
    } catch { /* silent */ }
    finally { setLoadingMsg(false); setLoadingUid(null); }
  };

  const handleDelete = useCallback(async (uid: number) => {
    if (!selectedAccount || deletingUid === uid) return;
    setDeletingUid(uid);
    setRevealedUid(null);
    try {
      await emailActions.deleteEmailMessage(selectedAccount, uid);
      setMessages(prev => prev.filter(m => m.uid !== uid));
      if (selectedMsg?.uid === uid) { setSelectedMsg(null); onContextUpdate(''); }
    } catch { /* silent */ }
    finally { setDeletingUid(null); }
  }, [selectedAccount, deletingUid, selectedMsg, onContextUpdate]);

  const onSwipeTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>, uid: number) => {
    if (revealedUid !== null && revealedUid !== uid) { setRevealedUid(null); return; }
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, el: e.currentTarget, uid, decided: false };
  }, [revealedUid]);

  const onSwipeTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const s = swipeRef.current;
    if (!s) return;
    const dx = e.touches[0].clientX - s.x;
    const dy = e.touches[0].clientY - s.y;
    if (!s.decided) {
      if (Math.abs(dy) > Math.abs(dx)) { swipeRef.current = null; return; }
      s.decided = true;
    }
    const base = revealedUid === s.uid ? -REVEAL_W : 0;
    const offset = Math.min(0, Math.max(-REVEAL_W, base + dx));
    s.el.style.transition = 'none';
    s.el.style.transform = `translateX(${offset}px)`;
  }, [revealedUid, REVEAL_W]);

  const onSwipeTouchEnd = useCallback(() => {
    const s = swipeRef.current;
    if (!s) return;
    swipeRef.current = null;
    const mat = new DOMMatrix(getComputedStyle(s.el).transform);
    const offset = mat.m41;
    s.el.style.transition = 'transform 0.2s ease';
    if (offset < -(REVEAL_W / 2)) {
      s.el.style.transform = `translateX(-${REVEAL_W}px)`;
      setRevealedUid(s.uid);
    } else {
      s.el.style.transform = 'translateX(0)';
      setRevealedUid(null);
    }
  }, [REVEAL_W]);

  const handleReply = () => {
    if (!selectedMsg) return;
    setReplyData({
      to: selectedMsg.from,
      subject: selectedMsg.subject.startsWith('Re:') ? selectedMsg.subject : `Re: ${selectedMsg.subject}`,
      inReplyTo: selectedMsg.messageId,
      references: selectedMsg.messageId,
    });
    setComposeOpen(true);
  };

  const account = accounts.find(a => a.id === selectedAccount);

  const borderCls = d ? 'border-gray-700' : 'border-gray-200';
  const textPrimary = d ? 'text-gray-100' : 'text-gray-900';
  const textMuted = d ? 'text-gray-400' : 'text-gray-500';
  const bgPanel = d ? 'bg-gray-900' : 'bg-gray-50';
  const bgCard = d ? 'bg-gray-800' : 'bg-white';
  const hoverRow = d ? 'hover:bg-gray-800' : 'hover:bg-gray-50';
  const activeRow = d ? 'bg-gray-800' : 'bg-blue-50';

  return (
    <div className={`flex flex-col h-full ${bgPanel}`}>
      {/* Header */}
      <div className={`flex-shrink-0 flex items-center justify-between px-4 py-3 border-b ${borderCls} ${d ? 'bg-gray-900' : 'bg-white'}`}>
        <div className="flex items-center gap-2 min-w-0">
          {accounts.length > 1 ? (
            <select value={selectedAccount ?? ''} onChange={e => { setSelected(e.target.value); fetchMessages(e.target.value); }}
              className={`text-sm font-medium bg-transparent outline-none truncate ${textPrimary}`}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          ) : (
            <span className={`text-sm font-semibold truncate ${textPrimary}`}>{account?.label ?? 'Inbox'}</span>
          )}
          {account && <span className={`text-xs truncate ${textMuted}`}>{account.email_address}</span>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => { setReplyData(null); setComposeOpen(true); }}
            title="Compose" className={`p-1.5 rounded-lg transition-colors ${d ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button onClick={() => selectedAccount && fetchMessages(selectedAccount)} title="Refresh"
            className={`p-1.5 rounded-lg transition-colors ${d ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'}`}>
            <svg className={`w-4 h-4 ${loadingMsgs ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button onClick={() => setAddOpen(true)} title="Add account"
            className={`p-1.5 rounded-lg transition-colors ${d ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* No accounts state */}
      {accounts.length === 0 && (
        <div className={`flex-1 flex flex-col items-center justify-center gap-3 ${textMuted}`}>
          <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-sm">No email accounts yet</p>
          <button onClick={() => setAddOpen(true)} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
            Add Account
          </button>
        </div>
      )}

      {/* Email list + detail split */}
      {accounts.length > 0 && (
        <div className="flex flex-1 overflow-hidden">
          {/* Message list — hidden on mobile when a message is open */}
          <div className={`overflow-y-auto ${
            selectedMsg || loadingMsg
              ? 'hidden lg:flex lg:flex-col lg:flex-shrink-0 lg:w-72 lg:border-r'
              : 'flex flex-col flex-1'
          } ${borderCls}`}>
            {loadingMsgs && (
              <div className={`flex items-center justify-center py-12 ${textMuted}`}>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              </div>
            )}
            {!loadingMsgs && messages.length === 0 && (
              <div className={`text-center py-12 text-sm ${textMuted}`}>No messages</div>
            )}
            {messages.map(msg => (
              <div key={msg.uid} className={`relative overflow-hidden border-b ${borderCls}`}>
                {/* Delete action revealed by swipe (mobile) */}
                <div className="lg:hidden absolute right-0 top-0 bottom-0 w-[72px] flex items-center justify-center bg-red-600">
                  {deletingUid === msg.uid
                    ? <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                    : <button onClick={() => handleDelete(msg.uid)} className="flex flex-col items-center gap-1 text-white">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        <span className="text-xs font-medium">Delete</span>
                      </button>
                  }
                </div>

                {/* Row content — swipeable on mobile */}
                <div
                  onTouchStart={e => onSwipeTouchStart(e, msg.uid)}
                  onTouchMove={onSwipeTouchMove}
                  onTouchEnd={onSwipeTouchEnd}
                  style={{ transform: revealedUid === msg.uid ? `translateX(-${REVEAL_W}px)` : 'translateX(0)', transition: 'transform 0.2s ease' }}
                  onClick={() => {
                    if (revealedUid === msg.uid) { setRevealedUid(null); return; }
                    openMessage(msg);
                  }}
                  className={`w-full text-left px-4 py-3 cursor-pointer transition-colors ${selectedMsg?.uid === msg.uid || loadingUid === msg.uid ? activeRow : hoverRow} ${d ? 'bg-gray-900' : 'bg-white'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-sm truncate ${msg.seen ? textMuted : `font-semibold ${textPrimary}`}`}>
                      {msg.fromName || msg.from}
                    </span>
                    <span className={`text-xs flex-shrink-0 ${textMuted}`}>
                      {loadingUid === msg.uid
                        ? <svg className="w-3.5 h-3.5 animate-spin inline" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                        : relativeDate(msg.date)}
                    </span>
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${msg.seen ? textMuted : textPrimary}`}>{msg.subject}</p>
                  {msg.snippet && <p className={`text-xs truncate mt-0.5 opacity-60 ${textMuted}`}>{msg.snippet}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Message detail */}
          {(selectedMsg || loadingMsg) && (
            <div className={`flex-1 flex flex-col overflow-hidden ${d ? 'bg-gray-900' : 'bg-white'}`}>
              {loadingMsg ? (
                <div className={`flex-1 flex items-center justify-center ${textMuted}`}>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                </div>
              ) : selectedMsg ? (
                <>
                  {/* Email header */}
                  <div className={`flex-shrink-0 px-4 py-3 border-b ${borderCls}`}>
                    {/* Back button — mobile only */}
                    <button onClick={() => { setSelectedMsg(null); onContextUpdate(''); }}
                      className={`lg:hidden flex items-center gap-1.5 text-xs mb-2.5 ${textMuted} hover:text-current transition-colors`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      Back to inbox
                    </button>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className={`text-sm font-semibold leading-snug flex-1 min-w-0 ${textPrimary}`}>{selectedMsg.subject}</h3>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={handleReply}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                          </svg>
                          Reply
                        </button>
                        {confirmDeleteUid === selectedMsg.uid ? (
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs ${textMuted}`}>Delete?</span>
                            <button onClick={() => { setConfirmDeleteUid(null); handleDelete(selectedMsg.uid); }}
                              className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors">
                              Yes
                            </button>
                            <button onClick={() => setConfirmDeleteUid(null)}
                              className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${d ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDeleteUid(selectedMsg.uid)} disabled={deletingUid === selectedMsg.uid}
                            title="Delete"
                            className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${d ? 'hover:bg-red-900/40 text-gray-500 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-500'}`}>
                            {deletingUid === selectedMsg.uid
                              ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            }
                          </button>
                        )}
                      </div>
                    </div>
                    <div className={`mt-2 space-y-0.5 text-xs ${textMuted}`}>
                      <p><span className="font-medium">From:</span> {selectedMsg.fromName ? `${selectedMsg.fromName} <${selectedMsg.from}>` : selectedMsg.from}</p>
                      {selectedMsg.to && <p><span className="font-medium">To:</span> {selectedMsg.to}</p>}
                      {selectedMsg.cc && <p><span className="font-medium">CC:</span> {selectedMsg.cc}</p>}
                      <p><span className="font-medium">Date:</span> {new Date(selectedMsg.date).toLocaleString()}</p>
                    </div>
                  </div>
                  {/* Body */}
                  {selectedMsg.bodyHtml ? (
                    <iframe
                      srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#111;word-break:break-word;}img{max-width:100%;height:auto;}a{color:#3b82f6;}table{max-width:100%;}*{box-sizing:border-box;}</style></head><body>${selectedMsg.bodyHtml}</body></html>`}
                      sandbox="allow-same-origin"
                      className="flex-1 w-full border-0 bg-white"
                      style={{ minHeight: 0 }}
                      title="Email body"
                    />
                  ) : (
                    <div className={`flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed ${textPrimary}`}>
                      {selectedMsg.bodyText.split(/\n{2,}/).map((para, i) => (
                        <p key={i} className="mb-3 whitespace-pre-wrap">{para.trim()}</p>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>
      )}

      <AddAccountModal isOpen={addOpen} onClose={() => setAddOpen(false)}
        onAdded={loadAccounts} isDarkMode={d} />

      {composeOpen && selectedAccount && (
        <ComposeModal isOpen={composeOpen} onClose={() => { setComposeOpen(false); setReplyData(null); }}
          accountId={selectedAccount} isDarkMode={d}
          defaultTo={replyData?.to} defaultSubject={replyData?.subject}
          inReplyTo={replyData?.inReplyTo} references={replyData?.references} />
      )}
    </div>
  );
}

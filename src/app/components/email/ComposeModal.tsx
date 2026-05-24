'use client';

import { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  isDarkMode: boolean;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
  inReplyTo?: string;
  references?: string;
}

export default function ComposeModal({ isOpen, onClose, accountId, isDarkMode: d,
  defaultTo = '', defaultSubject = '', defaultBody = '', inReplyTo, references }: Props) {
  const [to, setTo]           = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody]       = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!to || !subject || !body) { setError('Fill in all fields.'); return; }
    setSending(true); setError('');
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, to, subject, body, inReplyTo, references }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setSent(true);
      setTimeout(() => { setSent(false); onClose(); }, 1200);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const card  = d ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const text  = d ? 'text-gray-100' : 'text-gray-900';
  const muted = d ? 'text-gray-400' : 'text-gray-500';
  const inp   = `w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors ${d ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border shadow-2xl ${card}`}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${d ? 'border-gray-700' : 'border-gray-200'}`}>
          <h2 className={`text-sm font-semibold ${text}`}>{inReplyTo ? 'Reply' : 'New Message'}</h2>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${d ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className={`block text-xs font-medium mb-1 ${muted}`}>To</label>
            <input className={inp} placeholder="recipient@example.com" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${muted}`}>Subject</label>
            <input className={inp} placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${muted}`}>Message</label>
            <textarea className={`${inp} resize-none`} rows={8} placeholder="Write your message…"
              value={body} onChange={e => setBody(e.target.value)} />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={handleSend} disabled={sending || sent}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {sent ? 'Sent!' : sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

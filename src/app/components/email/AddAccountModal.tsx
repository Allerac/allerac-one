'use client';

import { useState } from 'react';
import * as emailActions from '@/app/actions/email';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
  isDarkMode: boolean;
}

const PRESETS: Record<string, { imap_host: string; imap_port: number; imap_secure: boolean; smtp_host: string; smtp_port: number; smtp_secure: boolean }> = {
  Gmail:   { imap_host: 'imap.gmail.com',   imap_port: 993, imap_secure: true,  smtp_host: 'smtp.gmail.com',   smtp_port: 587, smtp_secure: false },
  Outlook: { imap_host: 'outlook.office365.com', imap_port: 993, imap_secure: true, smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_secure: false },
  iCloud:  { imap_host: 'imap.mail.me.com', imap_port: 993, imap_secure: true,  smtp_host: 'smtp.mail.me.com', smtp_port: 587, smtp_secure: false },
  Yahoo:   { imap_host: 'imap.mail.yahoo.com', imap_port: 993, imap_secure: true, smtp_host: 'smtp.mail.yahoo.com', smtp_port: 587, smtp_secure: false },
};

const defaultForm = {
  label: '', email_address: '', username: '', password: '',
  imap_host: '', imap_port: 993, imap_secure: true,
  smtp_host: '', smtp_port: 587, smtp_secure: false,
};

export default function AddAccountModal({ isOpen, onClose, onAdded, isDarkMode: d }: Props) {
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const applyPreset = (name: string) => {
    const p = PRESETS[name];
    if (p) setForm(prev => ({ ...prev, ...p }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const result = await emailActions.createEmailAccount(form);
    setLoading(false);
    if ('error' in result) { setError(result.error); return; }
    setForm(defaultForm);
    onAdded();
    onClose();
  };

  const bg    = d ? 'bg-gray-900' : 'bg-white';
  const card  = d ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const text  = d ? 'text-gray-100' : 'text-gray-900';
  const muted = d ? 'text-gray-400' : 'text-gray-500';
  const input = d ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500';
  const label = `block text-xs font-medium mb-1 ${muted}`;
  const inp   = `w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors ${input}`;

  const field = (key: keyof typeof form, placeholder: string, type = 'text') => (
    <input type={type} placeholder={placeholder} value={String(form[key])} className={inp}
      onChange={e => setForm(prev => ({ ...prev, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))} />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`relative w-full max-w-lg rounded-2xl border shadow-2xl overflow-y-auto max-h-[90vh] ${card}`}>
        <div className={`sticky top-0 flex items-center justify-between px-6 py-4 border-b ${d ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
          <h2 className={`font-semibold ${text}`}>Add Email Account</h2>
          <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${d ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Quick presets */}
          <div>
            <p className={`text-xs font-medium mb-2 ${muted}`}>Quick preset</p>
            <div className="flex gap-2 flex-wrap">
              {Object.keys(PRESETS).map(name => (
                <button key={name} type="button" onClick={() => applyPreset(name)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${d ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Label</label>{field('label', 'Work, Personal…')}</div>
            <div><label className={label}>Email address</label>{field('email_address', 'you@example.com', 'email')}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Username</label>{field('username', 'usually your email')}</div>
            <div><label className={label}>Password / App Password</label>{field('password', '••••••••', 'password')}</div>
          </div>

          <div className={`border-t pt-4 ${d ? 'border-gray-700' : 'border-gray-200'}`}>
            <p className={`text-xs font-medium mb-3 ${muted}`}>IMAP (incoming)</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><label className={label}>Host</label>{field('imap_host', 'imap.gmail.com')}</div>
              <div><label className={label}>Port</label>{field('imap_port', '993', 'number')}</div>
            </div>
            <label className={`flex items-center gap-2 mt-2 cursor-pointer ${muted} text-xs`}>
              <input type="checkbox" checked={form.imap_secure}
                onChange={e => setForm(prev => ({ ...prev, imap_secure: e.target.checked }))} className="rounded" />
              TLS/SSL
            </label>
          </div>

          <div className={`border-t pt-4 ${d ? 'border-gray-700' : 'border-gray-200'}`}>
            <p className={`text-xs font-medium mb-3 ${muted}`}>SMTP (outgoing)</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><label className={label}>Host</label>{field('smtp_host', 'smtp.gmail.com')}</div>
              <div><label className={label}>Port</label>{field('smtp_port', '587', 'number')}</div>
            </div>
            <label className={`flex items-center gap-2 mt-2 cursor-pointer ${muted} text-xs`}>
              <input type="checkbox" checked={form.smtp_secure}
                onChange={e => setForm(prev => ({ ...prev, smtp_secure: e.target.checked }))} className="rounded" />
              TLS/SSL (usually off on port 587 — uses STARTTLS)
            </label>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {loading ? 'Testing connection…' : 'Add Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

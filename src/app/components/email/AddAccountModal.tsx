'use client';

import { useState } from 'react';
import * as emailActions from '@/app/actions/email';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
  isDarkMode: boolean;
}

type Provider = 'gmail' | 'outlook' | 'icloud' | 'yahoo' | 'custom';
type Step = 'email' | 'provider-pick' | 'setup';

interface ProviderConfig {
  name: string;
  imap_host: string; imap_port: number; imap_secure: boolean;
  smtp_host: string; smtp_port: number; smtp_secure: boolean;
  passwordLabel: string;
  passwordHint: string;
  steps: { text: string; sub?: string; link?: string; linkText?: string }[];
}

const PROVIDERS: Record<Exclude<Provider, 'custom'>, ProviderConfig> = {
  gmail: {
    name: 'Gmail',
    imap_host: 'imap.gmail.com', imap_port: 993, imap_secure: true,
    smtp_host: 'smtp.gmail.com', smtp_port: 587, smtp_secure: false,
    passwordLabel: 'App Password',
    passwordHint: 'xxxx xxxx xxxx xxxx',
    steps: [
      {
        text: 'Enable 2-Step Verification on your Google Account',
        link: 'https://myaccount.google.com/signinoptions/two-step-verification',
        linkText: 'Open Google Security',
      },
      {
        text: 'Create an App Password',
        sub: 'Select "Mail" as the app and any device. Copy the 16-character password.',
        link: 'https://myaccount.google.com/apppasswords',
        linkText: 'Open App Passwords',
      },
      { text: 'Paste the App Password in the field below' },
    ],
  },
  outlook: {
    name: 'Outlook / Hotmail',
    imap_host: 'outlook.office365.com', imap_port: 993, imap_secure: true,
    smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_secure: false,
    passwordLabel: 'App Password',
    passwordHint: '••••••••••••••••',
    steps: [
      {
        text: 'Go to Microsoft Account Security',
        link: 'https://account.microsoft.com/security',
        linkText: 'Open Microsoft Security',
      },
      { text: 'Enable two-step verification (if not already done)' },
      {
        text: 'Create an App Password',
        sub: 'Under Advanced security options → App passwords → Create a new app password.',
        link: 'https://account.live.com/proofs/AppPassword',
        linkText: 'Open App Passwords',
      },
      { text: 'Paste the generated password in the field below' },
    ],
  },
  icloud: {
    name: 'iCloud Mail',
    imap_host: 'imap.mail.me.com', imap_port: 993, imap_secure: true,
    smtp_host: 'smtp.mail.me.com', smtp_port: 587, smtp_secure: false,
    passwordLabel: 'App-Specific Password',
    passwordHint: 'xxxx-xxxx-xxxx-xxxx',
    steps: [
      {
        text: 'Go to Apple ID → Sign-In and Security',
        link: 'https://appleid.apple.com',
        linkText: 'Open Apple ID',
      },
      { text: 'Enable Two-Factor Authentication (required)' },
      {
        text: 'Generate an App-Specific Password',
        sub: 'Under "App-Specific Passwords", click "Generate an app-specific password".',
        link: 'https://appleid.apple.com',
        linkText: 'Open Apple ID',
      },
      { text: 'Paste the password (format: xxxx-xxxx-xxxx-xxxx) below' },
    ],
  },
  yahoo: {
    name: 'Yahoo Mail',
    imap_host: 'imap.mail.yahoo.com', imap_port: 993, imap_secure: true,
    smtp_host: 'smtp.mail.yahoo.com', smtp_port: 587, smtp_secure: false,
    passwordLabel: 'App Password',
    passwordHint: '••••••••••••••••',
    steps: [
      {
        text: 'Go to Yahoo Account Security',
        link: 'https://login.yahoo.com/account/security',
        linkText: 'Open Yahoo Security',
      },
      { text: 'Enable Two-step verification (if not already done)' },
      {
        text: 'Generate an App Password',
        sub: 'Under "App passwords" → select "Other app" → enter any name → Generate.',
        link: 'https://login.yahoo.com/account/security#other-apps',
        linkText: 'Open App Passwords',
      },
      { text: 'Paste the generated password below' },
    ],
  },
};

const DOMAIN_MAP: Record<string, Provider> = {
  'gmail.com': 'gmail', 'googlemail.com': 'gmail',
  'outlook.com': 'outlook', 'hotmail.com': 'outlook', 'live.com': 'outlook',
  'live.com.br': 'outlook', 'msn.com': 'outlook',
  'icloud.com': 'icloud', 'me.com': 'icloud', 'mac.com': 'icloud',
  'yahoo.com': 'yahoo', 'yahoo.co.uk': 'yahoo', 'ymail.com': 'yahoo',
};

function detectProvider(email: string): Provider {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return DOMAIN_MAP[domain] ?? 'custom';
}

const defaultCustom = {
  username: '', password: '', label: '',
  imap_host: '', imap_port: 993, imap_secure: true,
  smtp_host: '', smtp_port: 587, smtp_secure: false,
};

export default function AddAccountModal({ isOpen, onClose, onAdded, isDarkMode: d }: Props) {
  const [step, setStep]       = useState<Step>('email');
  const [email, setEmail]     = useState('');
  const [provider, setProvider] = useState<Provider>('custom');
  const [password, setPassword] = useState('');
  const [label, setLabel]     = useState('');
  const [custom, setCustom]   = useState(defaultCustom);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advanced, setAdvanced] = useState(defaultCustom);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  if (!isOpen) return null;

  const bg    = d ? 'bg-gray-900' : 'bg-white';
  const card  = d ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const text  = d ? 'text-gray-100' : 'text-gray-900';
  const muted = d ? 'text-gray-400' : 'text-gray-500';
  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors ${
    d ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-blue-500'
      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
  }`;
  const labelCls = `block text-xs font-medium mb-1 ${muted}`;
  const divider = d ? 'border-gray-700' : 'border-gray-200';

  const applyProvider = (p: Provider) => {
    setProvider(p);
    if (p !== 'custom') {
      const cfg = PROVIDERS[p];
      setLabel(cfg.name);
      setAdvanced({
        username: email, password: '',
        label: cfg.name,
        imap_host: cfg.imap_host, imap_port: cfg.imap_port, imap_secure: cfg.imap_secure,
        smtp_host: cfg.smtp_host, smtp_port: cfg.smtp_port, smtp_secure: cfg.smtp_secure,
      });
    } else {
      setCustom(prev => ({ ...prev, username: email, label: '' }));
    }
    setError('');
    setStep('setup');
  };

  const handleEmailNext = (e: React.FormEvent) => {
    e.preventDefault();
    const p = detectProvider(email);
    if (p !== 'custom') {
      applyProvider(p);
    } else {
      setError('');
      setStep('provider-pick');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);

    let input: Parameters<typeof emailActions.createEmailAccount>[0];

    if (provider !== 'custom') {
      const cfg = PROVIDERS[provider];
      input = {
        label: label || cfg.name,
        email_address: email,
        username: email,
        password,
        imap_host: showAdvanced ? advanced.imap_host : cfg.imap_host,
        imap_port: showAdvanced ? advanced.imap_port : cfg.imap_port,
        imap_secure: showAdvanced ? advanced.imap_secure : cfg.imap_secure,
        smtp_host: showAdvanced ? advanced.smtp_host : cfg.smtp_host,
        smtp_port: showAdvanced ? advanced.smtp_port : cfg.smtp_port,
        smtp_secure: showAdvanced ? advanced.smtp_secure : cfg.smtp_secure,
      };
    } else {
      input = {
        label: custom.label || email,
        email_address: email,
        username: custom.username || email,
        password: custom.password,
        imap_host: custom.imap_host,
        imap_port: custom.imap_port,
        imap_secure: custom.imap_secure,
        smtp_host: custom.smtp_host,
        smtp_port: custom.smtp_port,
        smtp_secure: custom.smtp_secure,
      };
    }

    const result = await emailActions.createEmailAccount(input);
    setLoading(false);
    if ('error' in result) { setError(result.error); return; }
    reset(); onAdded(); onClose();
  };

  const reset = () => {
    setStep('email'); setEmail(''); setProvider('custom');
    setPassword(''); setLabel('');
    setCustom(defaultCustom); setShowAdvanced(false); setError('');
  };

  const handleClose = () => { reset(); onClose(); };

  const ProviderIcon = ({ p }: { p: Provider }) => {
    const icons: Record<Provider, string> = {
      gmail: 'M',
      outlook: 'O',
      icloud: '',
      yahoo: 'Y!',
      custom: '@',
    };
    const colors: Record<Provider, string> = {
      gmail: 'bg-red-500',
      outlook: 'bg-blue-500',
      icloud: 'bg-gray-500',
      yahoo: 'bg-purple-600',
      custom: 'bg-gray-600',
    };
    return (
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold ${colors[p]}`}>
        {p === 'icloud' ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
          </svg>
        ) : icons[p]}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div className={`relative w-full max-w-md rounded-2xl border shadow-2xl overflow-y-auto max-h-[90vh] ${card}`}>
        {/* Header */}
        <div className={`sticky top-0 flex items-center justify-between px-6 py-4 border-b ${divider} ${d ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="flex items-center gap-2">
            {(step === 'setup' || step === 'provider-pick') && (
              <button type="button" onClick={() => { setStep(step === 'provider-pick' ? 'email' : detectProvider(email) === 'custom' ? 'provider-pick' : 'email'); setError(''); }}
                className={`p-1 rounded-lg transition-colors mr-1 ${d ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h2 className={`font-semibold text-sm ${text}`}>
              {step === 'email' ? 'Add Email Account'
                : step === 'provider-pick' ? 'Choose Provider'
                : provider === 'custom' ? 'Configure Account'
                : `Connect ${PROVIDERS[provider].name}`}
            </h2>
          </div>
          <button onClick={handleClose} className={`p-1.5 rounded-lg transition-colors ${d ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step 1 — Email */}
        {step === 'email' && (
          <form onSubmit={handleEmailNext} className="px-6 py-6 space-y-5">
            <div>
              <label className={labelCls}>Email address</label>
              <input
                type="email" required autoFocus
                placeholder="you@gmail.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={inputCls}
              />
            </div>
            <button type="submit"
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2">
              Continue
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </form>
        )}

        {/* Step 1.5 — Provider picker (unknown domain) */}
        {step === 'provider-pick' && (
          <div className="px-6 py-5 space-y-4">
            <div>
              <p className={`text-sm ${muted} mb-1`}>{email}</p>
              <p className={`text-sm ${text}`}>Who hosts this email account?</p>
            </div>
            <div className="space-y-2">
              {(Object.entries(PROVIDERS) as [Exclude<Provider,'custom'>, ProviderConfig][]).map(([key, cfg]) => (
                <button key={key} type="button" onClick={() => applyProvider(key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
                    d ? 'border-gray-700 hover:bg-gray-700/60 hover:border-gray-600' : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                  }`}>
                  <ProviderIcon p={key} />
                  <div>
                    <p className={`text-sm font-medium ${text}`}>{cfg.name}</p>
                    <p className={`text-xs ${muted}`}>{cfg.imap_host}</p>
                  </div>
                  <svg className={`w-4 h-4 ml-auto flex-shrink-0 ${muted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
              <button type="button" onClick={() => applyProvider('custom')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
                  d ? 'border-gray-700 hover:bg-gray-700/60 hover:border-gray-600' : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }`}>
                <ProviderIcon p="custom" />
                <div>
                  <p className={`text-sm font-medium ${text}`}>Other / Custom</p>
                  <p className={`text-xs ${muted}`}>Configure IMAP & SMTP manually</p>
                </div>
                <svg className={`w-4 h-4 ml-auto flex-shrink-0 ${muted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Known provider */}
        {step === 'setup' && provider !== 'custom' && (() => {
          const cfg = PROVIDERS[provider];
          return (
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
              {/* Provider + email */}
              <div className="flex items-center gap-3">
                <ProviderIcon p={provider} />
                <div>
                  <p className={`text-sm font-medium ${text}`}>{cfg.name}</p>
                  <p className={`text-xs ${muted}`}>{email}</p>
                </div>
              </div>

              {/* Setup guide */}
              <div className={`rounded-xl border p-4 space-y-3.5 ${d ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'}`}>
                <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>Setup required</p>
                {cfg.steps.map((s, i) => (
                  <div key={i} className="flex gap-3">
                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
                      d ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600'
                    }`}>{i + 1}</span>
                    <div className="space-y-1 min-w-0">
                      <p className={`text-sm ${text}`}>{s.text}</p>
                      {s.sub && <p className={`text-xs leading-relaxed ${muted}`}>{s.sub}</p>}
                      {s.link && (
                        <a href={s.link} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-400 font-medium">
                          {s.linkText}
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Password */}
              <div>
                <label className={labelCls}>{cfg.passwordLabel}</label>
                <input
                  type="password" required autoFocus
                  placeholder={cfg.passwordHint}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={inputCls}
                />
              </div>

              {/* Label */}
              <div>
                <label className={labelCls}>Account label <span className={`font-normal ${muted}`}>(optional)</span></label>
                <input
                  type="text"
                  placeholder={cfg.name}
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  className={inputCls}
                />
              </div>

              {/* Advanced toggle */}
              <div>
                <button type="button" onClick={() => setShowAdvanced(v => !v)}
                  className={`flex items-center gap-1.5 text-xs ${muted} hover:text-current transition-colors`}>
                  <svg className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Advanced server settings
                </button>
                {showAdvanced && (
                  <div className="mt-3 space-y-3">
                    <p className={`text-xs ${muted}`}>Only change these if you know what you're doing.</p>
                    <div className={`border-t pt-3 ${divider}`}>
                      <p className={`text-xs font-medium mb-2 ${muted}`}>IMAP (incoming)</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className={labelCls}>Host</label>
                          <input type="text" value={advanced.imap_host} onChange={e => setAdvanced(p => ({ ...p, imap_host: e.target.value }))} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Port</label>
                          <input type="number" value={advanced.imap_port} onChange={e => setAdvanced(p => ({ ...p, imap_port: Number(e.target.value) }))} className={inputCls} />
                        </div>
                      </div>
                      <label className={`flex items-center gap-2 mt-2 cursor-pointer text-xs ${muted}`}>
                        <input type="checkbox" checked={advanced.imap_secure} onChange={e => setAdvanced(p => ({ ...p, imap_secure: e.target.checked }))} className="rounded" />
                        TLS/SSL
                      </label>
                    </div>
                    <div className={`border-t pt-3 ${divider}`}>
                      <p className={`text-xs font-medium mb-2 ${muted}`}>SMTP (outgoing)</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className={labelCls}>Host</label>
                          <input type="text" value={advanced.smtp_host} onChange={e => setAdvanced(p => ({ ...p, smtp_host: e.target.value }))} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Port</label>
                          <input type="number" value={advanced.smtp_port} onChange={e => setAdvanced(p => ({ ...p, smtp_port: Number(e.target.value) }))} className={inputCls} />
                        </div>
                      </div>
                      <label className={`flex items-center gap-2 mt-2 cursor-pointer text-xs ${muted}`}>
                        <input type="checkbox" checked={advanced.smtp_secure} onChange={e => setAdvanced(p => ({ ...p, smtp_secure: e.target.checked }))} className="rounded" />
                        TLS/SSL (leave off for port 587 — uses STARTTLS)
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className={`rounded-lg px-3 py-2.5 text-sm ${d ? 'bg-red-900/30 border border-red-800 text-red-300' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                {loading ? 'Testing connection…' : 'Test & Connect'}
              </button>
            </form>
          );
        })()}

        {/* Step 2 — Custom provider */}
        {step === 'setup' && provider === 'custom' && (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div className="flex items-center gap-3 mb-1">
              <ProviderIcon p="custom" />
              <div>
                <p className={`text-sm font-medium ${text}`}>Custom Email</p>
                <p className={`text-xs ${muted}`}>{email}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Username</label>
                <input type="text" placeholder="usually your email" value={custom.username}
                  onChange={e => setCustom(p => ({ ...p, username: e.target.value }))}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Password</label>
                <input type="password" placeholder="••••••••" value={custom.password}
                  onChange={e => setCustom(p => ({ ...p, password: e.target.value }))}
                  className={inputCls} required />
              </div>
            </div>

            <div>
              <label className={labelCls}>Account label <span className={`font-normal ${muted}`}>(optional)</span></label>
              <input type="text" placeholder="Work, Personal…" value={custom.label}
                onChange={e => setCustom(p => ({ ...p, label: e.target.value }))}
                className={inputCls} />
            </div>

            <div className={`border-t pt-4 ${divider}`}>
              <p className={`text-xs font-medium mb-3 ${muted}`}>IMAP (incoming)</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className={labelCls}>Host</label>
                  <input type="text" placeholder="imap.example.com" value={custom.imap_host}
                    onChange={e => setCustom(p => ({ ...p, imap_host: e.target.value }))}
                    className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>Port</label>
                  <input type="number" value={custom.imap_port}
                    onChange={e => setCustom(p => ({ ...p, imap_port: Number(e.target.value) }))}
                    className={inputCls} />
                </div>
              </div>
              <label className={`flex items-center gap-2 mt-2 cursor-pointer text-xs ${muted}`}>
                <input type="checkbox" checked={custom.imap_secure}
                  onChange={e => setCustom(p => ({ ...p, imap_secure: e.target.checked }))} className="rounded" />
                TLS/SSL
              </label>
            </div>

            <div className={`border-t pt-4 ${divider}`}>
              <p className={`text-xs font-medium mb-3 ${muted}`}>SMTP (outgoing)</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className={labelCls}>Host</label>
                  <input type="text" placeholder="smtp.example.com" value={custom.smtp_host}
                    onChange={e => setCustom(p => ({ ...p, smtp_host: e.target.value }))}
                    className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>Port</label>
                  <input type="number" value={custom.smtp_port}
                    onChange={e => setCustom(p => ({ ...p, smtp_port: Number(e.target.value) }))}
                    className={inputCls} />
                </div>
              </div>
              <label className={`flex items-center gap-2 mt-2 cursor-pointer text-xs ${muted}`}>
                <input type="checkbox" checked={custom.smtp_secure}
                  onChange={e => setCustom(p => ({ ...p, smtp_secure: e.target.checked }))} className="rounded" />
                TLS/SSL (leave off for port 587 — uses STARTTLS)
              </label>
            </div>

            {error && (
              <div className={`rounded-lg px-3 py-2.5 text-sm ${d ? 'bg-red-900/30 border border-red-800 text-red-300' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
              {loading ? 'Testing connection…' : 'Test & Connect'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import * as authActions from '@/app/actions/auth';
import SetupWizard from '@/app/components/setup/SetupWizard';

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

type Mode = 'login' | 'register' | 'migration';

export default function LoginClient() {
  const router = useRouter();
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<Mode>('login');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [migrationEmail, setMigrationEmail] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    authActions.checkFirstRun().then(result => {
      if (result.isFirstRun) setShowSetupWizard(true);
      setChecking(false);
    });
  }, []);

  useEffect(() => {
    if (!checking && !showSetupWizard) emailRef.current?.focus();
  }, [checking, showSetupWizard]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError('');
    try {
      const hashed = await hashPassword(password);
      const result = await authActions.login(email, hashed);
      if (result.success) {
        router.push('/');
      } else if ('needsMigration' in result && result.needsMigration) {
        setMigrationEmail(email);
        setPassword('');
        setConfirmPassword('');
        setMode('migration');
      } else {
        setError(result.error || 'Invalid credentials.');
      }
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    setError('');
    try {
      const hashed = await hashPassword(password);
      const result = await authActions.register(email, hashed, name || undefined);
      if (result.success) {
        router.push('/');
      } else {
        setError(result.error || 'Registration failed.');
      }
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleMigration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    setError('');
    try {
      const hashed = await hashPassword(password);
      const result = await authActions.migratePassword(migrationEmail, hashed);
      if (result.success) {
        router.push('/');
      } else {
        setError(result.error || 'Migration failed.');
      }
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) return null;
  if (showSetupWizard) return <SetupWizard onComplete={() => router.push('/')} />;

  const isLogin = mode === 'login';
  const isRegister = mode === 'register';
  const isMigration = mode === 'migration';

  const titleText = isMigration ? 'Set New Password' : isLogin ? 'Log On to Allerac' : 'Create Account';
  const submitLabel = loading ? 'Please wait...' : isMigration ? 'Set Password' : isLogin ? 'OK' : 'Register';
  const handleSubmit = isMigration ? handleMigration : isLogin ? handleLogin : handleRegister;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #6366f1 0%, #4c1d95 60%, #1e1b4b 100%)',
      height: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Arial, sans-serif',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />

      {/* Win95 dialog */}
      <div style={{
        background: '#c0c0c0',
        border: '2px solid',
        borderColor: '#ffffff #808080 #808080 #ffffff',
        boxShadow: '4px 4px 0 #000',
        width: '340px',
      }}>
        {/* Title bar */}
        <div style={{
          background: '#000080',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 6px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <img src="/icon-nobg-purple.svg" alt="Allerac" style={{ width: 16, height: 16 }} />
            <span style={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}>{titleText}</span>
          </div>
          <div style={{ display: 'flex', gap: '2px' }}>
            {['_', '□', '✕'].map(s => (
              <div key={s} style={{
                width: 16, height: 14,
                background: '#c0c0c0',
                border: '1px solid',
                borderColor: '#ffffff #808080 #808080 #ffffff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '9px', color: '#000', cursor: 'default',
              }}>{s}</div>
            ))}
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: '16px' }}>
          {/* Header */}
          {!isMigration && (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
              <img src="/icon-nobg-purple.svg" alt="Allerac" style={{ width: 36, height: 36, flexShrink: 0 }} />
              <span style={{ fontSize: '11px', lineHeight: 1.5, color: '#000' }}>
                {isLogin
                  ? 'Type your credentials to log on to Allerac.'
                  : 'Fill in the details below to create your account.'}
              </span>
            </div>
          )}
          {isMigration && (
            <div style={{ marginBottom: '16px', fontSize: '11px', color: '#000', lineHeight: 1.6 }}>
              Your account needs a password update. Please choose a new password for <strong>{migrationEmail}</strong>.
            </div>
          )}

          {/* Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
            {isRegister && (
              <Field label="Name (optional):">
                <Win95Input value={name} onChange={setName} placeholder="" disabled={loading} />
              </Field>
            )}
            {!isMigration && (
              <Field label="User name:">
                <Win95Input ref={emailRef} type="email" value={email} onChange={setEmail} disabled={loading} />
              </Field>
            )}
            <Field label="Password:">
              <Win95Input type="password" value={password} onChange={setPassword} disabled={loading} />
            </Field>
            {(isRegister || isMigration) && (
              <Field label="Confirm:">
                <Win95Input type="password" value={confirmPassword} onChange={setConfirmPassword} disabled={loading} />
              </Field>
            )}
          </div>

          {error && (
            <div style={{ fontSize: '10px', color: '#cc0000', marginBottom: '8px' }}>{error}</div>
          )}

          <div style={{ height: '1px', background: '#808080', borderBottom: '1px solid #fff', marginBottom: '12px' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* Toggle link */}
            {!isMigration && (
              <button
                type="button"
                onClick={() => { setMode(isLogin ? 'register' : 'login'); setError(''); }}
                style={{ background: 'none', border: 'none', fontSize: '10px', color: '#000080', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
              >
                {isLogin ? 'Create account' : 'Back to login'}
              </button>
            )}
            {isMigration && <span />}

            <div style={{ display: 'flex', gap: '8px' }}>
              <Win95Button type="submit" disabled={loading}>
                {submitLabel}
              </Win95Button>
              {!isMigration && (
                <Win95Button type="button" onClick={() => { setEmail(''); setPassword(''); setError(''); }}>
                  Cancel
                </Win95Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', alignItems: 'center', gap: '8px' }}>
      <label style={{ fontSize: '11px', textAlign: 'right', color: '#000' }}>{label}</label>
      {children}
    </div>
  );
}

const Win95Input = function Win95Input({
  ref,
  type = 'text',
  value,
  onChange,
  disabled,
  placeholder,
}: {
  ref?: React.Ref<HTMLInputElement>;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      ref={ref}
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      style={{
        border: '2px solid',
        borderColor: '#808080 #ffffff #ffffff #808080',
        background: '#fff',
        color: '#000',
        padding: '2px 4px',
        fontSize: '12px',
        fontFamily: 'Arial, sans-serif',
        outline: 'none',
        width: '100%',
        boxSizing: 'border-box',
      }}
    />
  );
};

function Win95Button({
  children, type = 'button', disabled, onClick,
}: {
  children: React.ReactNode;
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        minWidth: '72px',
        padding: '4px 8px',
        background: '#c0c0c0',
        border: '2px solid',
        borderColor: pressed ? '#808080 #ffffff #ffffff #808080' : '#ffffff #808080 #808080 #ffffff',
        fontSize: '11px',
        fontFamily: 'Arial, sans-serif',
        color: '#000',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { resetPassword } from '@/app/actions/auth';

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing reset token. Please request a new password reset.');
    } else {
      passwordRef.current?.focus();
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !password) return;
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    setError('');
    try {
      const hashed = await hashPassword(password);
      const result = await resetPassword(token, hashed);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => router.push('/login'), 3000);
      } else {
        setError(result.error ?? 'Failed to reset password.');
      }
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, #6366f1 0%, #4c1d95 60%, #1e1b4b 100%)',
      height: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Arial, sans-serif',
    }}>
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
            <span style={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}>Set New Password</span>
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
          {success ? (
            <div style={{ fontSize: '11px', color: '#006600', background: '#f0fff0', border: '1px solid #006600', padding: '10px', marginBottom: '12px', lineHeight: 1.6 }}>
              Password changed successfully! Redirecting to login...
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '16px', fontSize: '11px', color: '#000', lineHeight: 1.6 }}>
                Choose a new password for your Allerac account.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                <Field label="New password:">
                  <Win95Input ref={passwordRef} type="password" value={password} onChange={setPassword} disabled={loading || !token} />
                </Field>
                <Field label="Confirm:">
                  <Win95Input type="password" value={confirmPassword} onChange={setConfirmPassword} disabled={loading || !token} />
                </Field>
              </div>
            </>
          )}

          {error && (
            <div style={{ fontSize: '10px', color: '#cc0000', marginBottom: '8px' }}>{error}</div>
          )}

          <div style={{ height: '1px', background: '#808080', borderBottom: '1px solid #fff', marginBottom: '12px' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => router.push('/login')}
              style={{ background: 'none', border: 'none', fontSize: '10px', color: '#000080', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
            >
              Back to login
            </button>
            {!success && (
              <Win95Button type="submit" disabled={loading || !token}>
                {loading ? 'Please wait...' : 'Set Password'}
              </Win95Button>
            )}
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
  ref, type = 'text', value, onChange, disabled,
}: {
  ref?: React.Ref<HTMLInputElement>;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      ref={ref}
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
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

function Win95Button({ children, type = 'button', disabled, onClick }: {
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

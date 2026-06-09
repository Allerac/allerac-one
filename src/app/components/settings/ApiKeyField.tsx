'use client';

import { useState } from 'react';
import { validateApiKey, type ApiKeyProvider } from '@/app/actions/api-keys';

type TestableProvider = ApiKeyProvider;
type Status = 'idle' | 'configured' | 'testing' | 'valid' | 'invalid';

interface ApiKeyFieldProps {
  label: string;
  description?: string;
  placeholder?: string;
  helpUrl?: string;
  helpText?: string;
  provider?: TestableProvider;
  hasStoredValue: boolean;
  value: string;
  onChange: (v: string) => void;
  isDarkMode: boolean;
  inputType?: 'password' | 'email' | 'text';
}

export default function ApiKeyField({
  label,
  description,
  placeholder,
  helpUrl,
  helpText,
  provider,
  hasStoredValue,
  value,
  onChange,
  isDarkMode,
  inputType = 'password',
}: ApiKeyFieldProps) {
  const [status, setStatus] = useState<Status>(hasStoredValue ? 'configured' : 'idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canTest = !!provider && value.trim().length > 0;

  async function handleTest() {
    if (!provider || !value.trim()) return;
    setStatus('testing');
    setErrorMsg(null);
    const result = await validateApiKey(provider, value.trim());
    if (result.valid) {
      setStatus('valid');
    } else {
      setStatus('invalid');
      setErrorMsg(result.error ?? 'Invalid key');
    }
  }

  function handleChange(v: string) {
    onChange(v);
    setStatus(hasStoredValue ? 'configured' : 'idle');
    setErrorMsg(null);
  }

  const inputBase = `w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm ${
    isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'
  }`;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          {label}
          {description && (
            <span className={`ml-1.5 text-xs font-normal ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              {description}
            </span>
          )}
        </label>
        <StatusBadge status={status} isDarkMode={isDarkMode} />
      </div>

      <div className="flex gap-2">
        <input
          type={inputType}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder ?? (hasStoredValue ? '••••••••' : '')}
          className={inputBase}
        />
        {canTest && (
          <button
            type="button"
            onClick={handleTest}
            disabled={status === 'testing'}
            className={`shrink-0 px-3 py-2 rounded-md border text-sm font-medium transition-colors disabled:opacity-50 ${
              isDarkMode
                ? 'border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600'
                : 'border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            {status === 'testing' ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                Testing
              </span>
            ) : 'Test'}
          </button>
        )}
      </div>

      {(errorMsg || helpText || helpUrl) && (
        <p className={`text-xs mt-1.5 ${
          errorMsg
            ? 'text-red-500'
            : isDarkMode ? 'text-gray-400' : 'text-gray-500'
        }`}>
          {errorMsg ?? (
            <>
              {helpText}
              {helpUrl && helpText && ' '}
              {helpUrl && (
                <a href={helpUrl} target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:underline">
                  {helpUrl.replace(/^https?:\/\//, '').split('/')[0]}
                </a>
              )}
            </>
          )}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status, isDarkMode }: { status: Status; isDarkMode: boolean }) {
  if (status === 'idle') return null;

  const configs: Record<Exclude<Status, 'idle'>, { label: string; cls: string }> = {
    configured: {
      label: 'Configured',
      cls: isDarkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500',
    },
    testing: {
      label: 'Testing…',
      cls: isDarkMode ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-600',
    },
    valid: {
      label: '✓ Valid',
      cls: isDarkMode ? 'bg-green-900/40 text-green-300' : 'bg-green-50 text-green-700',
    },
    invalid: {
      label: '✗ Invalid',
      cls: isDarkMode ? 'bg-red-900/40 text-red-300' : 'bg-red-50 text-red-700',
    },
  };

  const { label, cls } = configs[status];
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>
  );
}

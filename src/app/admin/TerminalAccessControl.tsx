'use client';

import { useTranslations } from 'next-intl';

interface Props {
  enabled: boolean;
  busy: boolean;
  isDark: boolean;
  onToggle: () => void;
}

/**
 * Grant/revoke of the shared Unit terminal in the admin user modal. Every user,
 * admins included, needs this explicit grant.
 */
export default function TerminalAccessControl({ enabled, busy, isDark: d, onToggle }: Props) {
  const t = useTranslations('terminal.adminAccess');
  const textMuted = d ? 'text-gray-400' : 'text-gray-500';
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${textMuted}`}>{t('title')}</p>
      <p className={`text-xs mb-2 ${textMuted}`}>{t('description')}</p>
      <p role="note" className={`text-xs mb-2 rounded-md px-2 py-1.5 ${d ? 'bg-amber-900/30 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
        {t('sharedWarning')}
      </p>
      <button
        onClick={onToggle}
        disabled={busy}
        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
          enabled
            ? d ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            : d ? 'bg-indigo-900/40 text-indigo-300 hover:bg-indigo-900/60' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
        }`}
      >
        {busy ? '...' : enabled ? t('revoke') : t('grant')}
      </button>
    </div>
  );
}

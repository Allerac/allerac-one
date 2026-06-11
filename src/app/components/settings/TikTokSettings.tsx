'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { disconnectTikTok, getTikTokStatus } from '@/app/actions/tiktok';

interface TikTokSettingsProps {
  userId?: string;
  isDarkMode: boolean;
}

type TikTokStatus = Awaited<ReturnType<typeof getTikTokStatus>>;

export default function TikTokSettings({ userId, isDarkMode }: TikTokSettingsProps) {
  const t = useTranslations('tiktok');
  const [status, setStatus] = useState<TikTokStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const muted = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const card = `rounded-xl border p-5 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`;
  const button = 'px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  useEffect(() => {
    if (!userId) return;
    let active = true;
    getTikTokStatus()
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch(() => {
        if (active) setMessage(t('loadFailed'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, t]);

  async function handleDisconnect() {
    if (!window.confirm(t('disconnectConfirm'))) return;
    setDisconnecting(true);
    setMessage(null);
    const result = await disconnectTikTok();
    if (result.success) {
      setStatus((current) => current ? { ...current, is_connected: false } : current);
      setMessage(t('disconnected'));
    } else {
      setMessage(t('disconnectFailed'));
    }
    setDisconnecting(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className={`text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
          TikTok
        </h3>
        <p className={`text-xs ${muted}`}>{t('description')}</p>
      </div>

      {message && (
        <div className="text-xs px-3 py-2 rounded-md bg-red-500/10 text-red-400">
          {message}
        </div>
      )}

      {loading && <div className={`text-xs ${muted}`}>{t('loading')}</div>}

      {!loading && status?.is_connected && (
        <div className={card}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {status.avatar_url ? (
                <div
                  aria-hidden="true"
                  className="w-10 h-10 rounded-full bg-cover bg-center"
                  style={{ backgroundImage: `url("${status.avatar_url.replaceAll('"', '%22')}")` }}
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-bold">
                  T
                </div>
              )}
              <div className="min-w-0">
                <div className={`text-sm font-medium truncate ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  {status.display_name || t('account')}
                </div>
                <div className={`text-xs ${muted}`}>
                  {status.is_assigned ? t('assignedAccount') : t('connected')}
                </div>
              </div>
            </div>
            <span className="text-xs text-green-500 shrink-0">{t('active')}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {!status.is_assigned && (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className={`${button} bg-red-600 text-white hover:bg-red-700`}
              >
                {disconnecting ? t('disconnecting') : t('disconnect')}
              </button>
            )}
          </div>
        </div>
      )}

      {!loading && status && !status.is_connected && (
        <div className={card}>
          {!status.configured ? (
            <p className="text-sm text-amber-500">{t('notConfigured')}</p>
          ) : (
            <>
              <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                {t('connectPrompt')}
              </p>
              <a
                href="/api/tiktok/auth"
                className={`${button} inline-flex bg-black text-white hover:bg-gray-800`}
              >
                {t('connect')}
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}

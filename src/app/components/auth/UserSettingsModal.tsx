'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import LanguageSelector from '@/app/components/LanguageSelector';

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  userName: string;
  userEmail: string;
  userId: string | null;
  onOpenTelegramSettings?: () => void;
}

export default function UserSettingsModal({
  isOpen,
  onClose,
  isDarkMode,
  userName,
  userEmail,
  userId,
  onOpenTelegramSettings
}: UserSettingsModalProps) {
  const t = useTranslations('userSettings');
  const locale = useLocale();

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getInitials = (email: string) => {
    if (!email) return '?';
    const parts = email.split('@')[0].split('.');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return email.slice(0, 2).toUpperCase();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`backdrop-blur-md rounded-lg shadow-xl max-w-md w-full ${isDarkMode ? 'bg-gray-800/95 border border-gray-700' : 'bg-white/95 border border-gray-200'}`}>
        <div className={`p-6 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <h2 className={`text-xl font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{t('title')}</h2>
            <button
              onClick={onClose}
              className={`transition-colors ${isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center mb-3">
              <span className="text-white text-2xl font-semibold">{getInitials(userEmail)}</span>
            </div>
            <h3 className={`text-lg font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{userName}</h3>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{userEmail}</p>
          </div>
          <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-100'}`}>
            <p className={`text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('userId')}</p>
            <p className={`text-sm font-mono ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{userId?.slice(0, 8)}...</p>
          </div>
          <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-100'}`}>
            <p className={`text-xs font-medium mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('language')}</p>
            <LanguageSelector currentLocale={locale} isDarkMode={isDarkMode} />

          {/* Telegram Bot Settings Button */}
          {onOpenTelegramSettings && (
            <button
              onClick={onOpenTelegramSettings}
              className={`w-full p-4 rounded-lg transition-colors flex items-center justify-between ${
                isDarkMode 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
                </svg>
                <div className="text-left">
                  <p className="font-medium">Telegram Bot Settings</p>
                  <p className="text-sm opacity-80">Manage your personal bots</p>
                </div>
              </div>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

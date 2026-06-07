'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { updateLanguage } from '@/app/actions/user';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'ca', label: 'Català' },
];

interface ChatHeaderProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  clearChat: () => void;
  domainName?: string;
  activeSkill?: { name: string; display_name: string } | null;
  currentConversationId: string | null;
  currentConversationTitle?: string;
  currentConversationHasMemory: boolean;
  handleGenerateSummary: () => void;
  isTerminalMode?: boolean;
  onToggleChatMode?: () => void;
  hideHomeButton?: boolean;
  titleOnly?: boolean;
  userName?: string;
  userEmail?: string;
  onLogout?: () => void;
}

export default function ChatHeader({
  isSidebarOpen,
  setIsSidebarOpen,
  isDarkMode,
  toggleTheme,
  clearChat,
  domainName,
  activeSkill,
  currentConversationId,
  currentConversationTitle,
  currentConversationHasMemory,
  handleGenerateSummary,
  isTerminalMode,
  onToggleChatMode,
  hideHomeButton,
  titleOnly,
  userName,
  userEmail,
  onLogout,
}: ChatHeaderProps) {
  const t = useTranslations('system');
  const locale = useLocale();
  const router = useRouter();
  const [langPending, startLangTransition] = useTransition();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLangChange = (code: string) => {
    startLangTransition(async () => {
      await updateLanguage(code);
      window.location.reload();
    });
  };

  const initials = userName ? userName.slice(0, 2).toUpperCase() : (userEmail ? userEmail.slice(0, 2).toUpperCase() : '?');

  const handleNewChat = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      window.open('/chat', '_blank');
    } else {
      clearChat();
    }
  };

  if (titleOnly) {
    return (
      <div className="flex-shrink-0 flex items-center gap-2 px-3 h-12" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`lg:hidden p-2 rounded-lg transition-colors ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className={`flex-1 text-sm font-semibold truncate ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
          {currentConversationTitle || domainName || 'Allerac'}
        </span>
        {currentConversationId && (
          <button
            onClick={handleGenerateSummary}
            className={`p-2 rounded-lg transition-colors ${
              currentConversationHasMemory
                ? isDarkMode ? 'text-green-400 hover:bg-gray-700' : 'text-green-600 hover:bg-gray-100'
                : isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
            title={currentConversationHasMemory ? t('savedInMemory') : t('saveToMemory')}
          >
            {currentConversationHasMemory ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="px-3 sm:px-6 pb-2" style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}>
        <div className="flex items-center gap-3 min-h-[48px]">

          {/* Hamburger — mobile only */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`lg:hidden p-2 rounded-lg transition-colors ${
              isDarkMode
                ? 'hover:bg-gray-700 text-gray-300'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
            title={isSidebarOpen ? t('hideSidebar') : t('showSidebar')}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Brand / Conversation title */}
          <div className="flex items-center gap-2 min-w-0">
            {currentConversationId && currentConversationTitle ? (
              <span className={`text-sm font-medium truncate max-w-[40vw] sm:max-w-[260px] ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                {currentConversationTitle}
              </span>
            ) : (
              <span className={`text-xl font-bold flex-shrink-0 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                {domainName ?? 'Allerac'}
              </span>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Back to Hub — admin only */}
          {!hideHomeButton && (
            <button
              onClick={() => router.push('/')}
              className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="Hub"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </button>
          )}

          {/* Memory button — only when conversation exists */}
          {currentConversationId && (
            <button
              onClick={handleGenerateSummary}
              className={`p-2 rounded-lg transition-colors ${
                currentConversationHasMemory
                  ? isDarkMode ? 'text-green-400 hover:bg-gray-700' : 'text-green-600 hover:bg-gray-100'
                  : isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
              title={currentConversationHasMemory ? t('savedInMemory') : t('saveToMemory')}
            >
              {currentConversationHasMemory ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              )}
            </button>
          )}

          {/* Terminal mode toggle */}
          {onToggleChatMode && (
            <button
              onClick={onToggleChatMode}
              className={`p-2 rounded-lg transition-colors ${
                isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
              }`}
              title={isTerminalMode ? 'Switch to classic mode' : 'Switch to terminal mode'}
              style={{ color: isTerminalMode ? '#00ff41' : isDarkMode ? '#6b7280' : '#9ca3af' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
          )}

          {/* New Chat */}
          <button
            onClick={handleNewChat}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
            title={`${t('newChat')} (Ctrl+click para abrir em nova janela)`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>

          {/* My Allerac */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('openMyAlleracModal'))}
            className={`p-2 rounded-lg transition-colors inline-flex items-center justify-center ${
              isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
            title="My Allerac"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
              <path d="M15.5 13a3.5 3.5 0 0 0 -3.5 3.5v1a3.5 3.5 0 0 0 7 0v-1.8" />
              <path d="M8.5 13a3.5 3.5 0 0 1 3.5 3.5v1a3.5 3.5 0 0 1 -7 0v-1.8" />
              <path d="M17.5 16a3.5 3.5 0 0 0 0 -7h-.5" />
              <path d="M19 9.3v-2.8a3.5 3.5 0 0 0 -7 0" />
              <path d="M6.5 16a3.5 3.5 0 0 1 0 -7h.5" />
              <path d="M5 9.3v-2.8a3.5 3.5 0 0 1 7 0v10" />
            </svg>
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
            title={isDarkMode ? 'Light mode' : 'Dark mode'}
          >
            {isDarkMode ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          {/* Avatar / user menu */}
          {(userName || userEmail) && (
            <div className="relative" ref={avatarRef}>
              <button
                onClick={() => setAvatarOpen(o => !o)}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  isDarkMode
                    ? 'bg-indigo-700 hover:bg-indigo-600 text-white'
                    : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-800'
                }`}
                title={userEmail ?? userName}
              >
                {initials}
              </button>

              {avatarOpen && (
                <div className={`absolute right-0 top-10 w-52 rounded-xl shadow-xl z-50 overflow-hidden border ${
                  isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                }`}>
                  {/* User info */}
                  <div className={`px-4 py-3 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                    <p className={`text-xs font-semibold truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{userName}</p>
                    <p className={`text-xs truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{userEmail}</p>
                  </div>

                  {/* Language selector */}
                  <div className={`px-4 py-2 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                    <p className={`text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Language</p>
                    <div className="flex flex-wrap gap-1">
                      {LANGUAGES.map(lang => (
                        <button
                          key={lang.code}
                          onClick={() => handleLangChange(lang.code)}
                          disabled={langPending}
                          className={`text-xs px-2 py-0.5 rounded transition-colors ${
                            locale === lang.code
                              ? 'bg-indigo-600 text-white'
                              : isDarkMode
                                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {lang.code.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Logout */}
                  {onLogout && (
                    <button
                      onClick={() => { setAvatarOpen(false); onLogout(); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        isDarkMode
                          ? 'text-red-400 hover:bg-gray-700'
                          : 'text-red-600 hover:bg-red-50'
                      }`}
                    >
                      Sign out
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

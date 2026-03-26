'use client';

import { useTranslations } from 'next-intl';

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
}: ChatHeaderProps) {
  const t = useTranslations('system');

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
            {activeSkill && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                isDarkMode ? 'bg-indigo-900/60 text-indigo-300 border border-indigo-700' : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
              }`}>
                {activeSkill.display_name ?? activeSkill.name}
              </span>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

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

          {/* Terminal mode toggle — only for domains with terminal support */}
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

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
            title={isDarkMode ? t('switchToLight') : t('switchToDark')}
          >
            {isDarkMode ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          {/* New Chat */}
          <button
            onClick={clearChat}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
            title={t('newChat')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>

          {/* Desktop */}
          <button
            onClick={() => window.location.href = '/'}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
            title="Desktop"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>

        </div>
      </div>
    </div>
  );
}

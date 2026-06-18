'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Conversation } from '../../types';
import SidebarContent from './SidebarContent';
import { AlleracLogo } from '../ui/AlleracLogo';
import { updateLanguage } from '@/app/actions/user';
import UserCreditBalance from '@/app/components/credits/UserCreditBalance';
import { MODELS } from '@/app/services/llm/models';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'ca', label: 'Català' },
];

interface SidebarMobileProps {
  isSidebarOpen: boolean;
  isDarkMode: boolean;
  onClose: () => void;
  conversations: Conversation[];
  currentConversationId: string | null;
  loadConversation: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => void;
  pinConversation: (conversationId: string, pinned: boolean) => void;
  renameConversation: (conversationId: string, title: string) => void;
  showWorkspace?: boolean;
  showHealth?: boolean;
  showInstagramDM?: boolean;
  onOpenInstagramPost?: () => void;
  instagramConnected?: boolean;
  isAdmin?: boolean;
  onNewConversation?: () => void;
  userName?: string;
  userEmail?: string;
  onLogout?: () => void;
  onToggleTheme?: () => void;
}

export default function SidebarMobile({
  isSidebarOpen,
  isDarkMode,
  onClose,
  conversations,
  currentConversationId,
  loadConversation,
  deleteConversation,
  pinConversation,
  renameConversation,
  showWorkspace,
  showHealth,
  showInstagramDM,
  onOpenInstagramPost,
  instagramConnected,
  isAdmin,
  onNewConversation,
  userName,
  userEmail,
  onLogout,
  onToggleTheme,
}: SidebarMobileProps) {
  const d = isDarkMode;
  const router = useRouter();
  const locale = useLocale();
  const [langPending, startLangTransition] = useTransition();
  const btn = `w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${d ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`;
  const initials = (userName || userEmail || '?').slice(0, 2).toUpperCase();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [currentModelId, setCurrentModelId] = useState('gemini-2.5-flash');

  useEffect(() => {
    const read = () => {
      const saved = localStorage.getItem('selected_model');
      if (saved) setCurrentModelId(saved);
    };
    read();
    window.addEventListener('storage', read);
    return () => window.removeEventListener('storage', read);
  }, []);

  const currentModel = MODELS.find(m => m.id === currentModelId);

  const handleLangChange = (code: string) => {
    startLangTransition(async () => {
      await updateLanguage(code);
      window.location.reload();
    });
  };
  return (
    <div className={`fixed inset-y-0 left-0 z-50 w-[80%] max-w-xs flex flex-col border-r transform transition-transform duration-300 ${
      isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
    } ${d ? 'bg-gray-900 text-white border-gray-800' : 'bg-white text-gray-900 border-gray-200'}`}>
      {/* Header — matches ChatHeader style */}
      <div>
        <div className="px-3 pb-2 flex items-center gap-3" style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors flex-shrink-0 ${d ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}
            title="Close Sidebar"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <AlleracLogo height={28} variant={d ? 'dark' : 'light'} />
        </div>
      </div>

      {/* Action buttons */}
      <div className={`flex flex-col px-2 py-1.5 gap-0.5 border-b flex-shrink-0 ${d ? 'border-gray-800' : 'border-gray-200'}`}>
        {onNewConversation && (
          <button onClick={() => { onNewConversation(); onClose(); }} className={btn} title="New conversation">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span>New conversation</span>
          </button>
        )}
        <button onClick={() => { window.dispatchEvent(new CustomEvent('openMyAlleracModal')); onClose(); }} className={btn} title="My Allerac">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M15.5 13a3.5 3.5 0 0 0 -3.5 3.5v1a3.5 3.5 0 0 0 7 0v-1.8" />
            <path d="M8.5 13a3.5 3.5 0 0 1 3.5 3.5v1a3.5 3.5 0 0 1 -7 0v-1.8" />
            <path d="M17.5 16a3.5 3.5 0 0 0 0 -7h-.5" />
            <path d="M19 9.3v-2.8a3.5 3.5 0 0 0 -7 0" />
            <path d="M6.5 16a3.5 3.5 0 0 1 0 -7h.5" />
            <path d="M5 9.3v-2.8a3.5 3.5 0 0 1 7 0v10" />
          </svg>
          <span>My Allerac</span>
        </button>
        {isAdmin && (
          <button onClick={() => router.push('/')} className={btn} title="Hub">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Hub</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
        <SidebarContent
          conversations={conversations}
          currentConversationId={currentConversationId}
          loadConversation={loadConversation}
          deleteConversation={deleteConversation}
          pinConversation={pinConversation}
          renameConversation={renameConversation}
          isDarkMode={isDarkMode}
          showWorkspace={showWorkspace}
          showHealth={showHealth}
          showInstagramDM={showInstagramDM}
          onOpenInstagramPost={onOpenInstagramPost}
          instagramConnected={instagramConnected}
        />
      </div>

      {/* Bottom: avatar toggle */}
      {(userName || userEmail) && (
        <div className={`border-t flex-shrink-0 ${d ? 'border-gray-800' : 'border-gray-200'}`}>
          {/* Expanded panel */}
          {userMenuOpen && (
            <div className={`px-3 py-2 space-y-1 border-b ${d ? 'border-gray-800' : 'border-gray-200'}`}>
              <div className={`px-2 py-1 ${d ? 'text-gray-400' : 'text-gray-500'}`}>
                <p className={`text-xs truncate ${d ? 'text-gray-500' : 'text-gray-400'}`}>{userEmail}</p>
              </div>
              <UserCreditBalance
                isDarkMode={d}
                className={`px-2 border-y ${d ? 'border-gray-800' : 'border-gray-200'}`}
              />
              {onToggleTheme && (
                <button onClick={onToggleTheme} className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-sm transition-colors ${d ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}>
                  {d ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  )}
                  {d ? 'Light mode' : 'Dark mode'}
                </button>
              )}
              <div className="flex gap-1 px-2 pb-1">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => handleLangChange(lang.code)}
                    disabled={langPending}
                    className={`text-xs px-2 py-0.5 rounded transition-colors ${
                      locale === lang.code
                        ? 'bg-indigo-600 text-white'
                        : d ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {lang.code.toUpperCase()}
                  </button>
                ))}
              </div>
              {onLogout && (
                <button onClick={onLogout} className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-sm text-red-400 hover:bg-red-600/20 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign out
                </button>
              )}
            </div>
          )}

          {/* Avatar row — always visible */}
          <button
            onClick={() => setUserMenuOpen(o => !o)}
            className={`w-full flex items-center gap-3 px-5 py-3 transition-colors ${d ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}`}
          >
            <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
              {initials}
            </span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm text-left truncate ${d ? 'text-gray-300' : 'text-gray-700'}`}>{userName || userEmail}</p>
              {currentModel && (
                <p className={`text-xs truncate ${d ? 'text-gray-500' : 'text-gray-400'}`}>{currentModel.shortName}</p>
              )}
            </div>
            <svg className={`w-4 h-4 transition-transform ${userMenuOpen ? 'rotate-180' : ''} ${d ? 'text-gray-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

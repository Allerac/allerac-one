'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { Skill } from '../../services/skills/skills.service';

interface ChatHeaderProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  clearChat: () => void;
  userName?: string;
  onOpenUserSettings: () => void;
  currentConversationId: string | null;
  currentConversationTitle?: string;
  currentConversationHasMemory: boolean;
  handleGenerateSummary: () => void;
  userId?: string | null;
  availableSkills?: Skill[];
  activeSkill?: Skill | null;
  onActivateSkill?: (skillId: string) => Promise<void>;
  onDeactivateSkill?: () => Promise<void>;
}

export default function ChatHeader({
  isSidebarOpen,
  setIsSidebarOpen,
  isDarkMode,
  toggleTheme,
  clearChat,
  userName,
  onOpenUserSettings,
  currentConversationId,
  currentConversationTitle,
  currentConversationHasMemory,
  handleGenerateSummary,
  userId = null,
  availableSkills = [],
  activeSkill = null,
  onActivateSkill,
  onDeactivateSkill,
}: ChatHeaderProps) {
  const t = useTranslations('system');
  const [isSkillDropdownOpen, setIsSkillDropdownOpen] = useState(false);
  const skillDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (skillDropdownRef.current && !skillDropdownRef.current.contains(event.target as Node)) {
        setIsSkillDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const userInitial = userName?.[0]?.toUpperCase() || 'U';

  return (
    <div>
      <div className="px-3 sm:px-6 pb-2" style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}>
        <div className="flex items-center gap-3">

          {/* Hamburger — mobile only */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`lg:hidden p-2 rounded-lg transition-colors ${
              isDarkMode
                ? 'hover:bg-gray-700 text-gray-300'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
            title={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Brand / Conversation title */}
          {currentConversationId && currentConversationTitle ? (
            <span className={`text-sm font-medium truncate max-w-[40vw] sm:max-w-[260px] ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              {currentConversationTitle}
            </span>
          ) : (
            <span className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              Allerac
            </span>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Skills dropdown — only when conversation exists */}
          {availableSkills.length > 0 && currentConversationId && (
            <div className="relative" ref={skillDropdownRef}>
              <button
                onClick={() => setIsSkillDropdownOpen(!isSkillDropdownOpen)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  activeSkill
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : isDarkMode
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                title={activeSkill ? `Active: ${activeSkill.display_name}` : 'Activate a skill'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-sm hidden sm:inline">
                  {activeSkill ? activeSkill.display_name : 'Skills'}
                </span>
                <svg
                  className={`w-3 h-3 transition-transform ${isSkillDropdownOpen ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isSkillDropdownOpen && (
                <div className={`absolute right-0 mt-2 w-72 rounded-lg shadow-lg z-50 ${
                  isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                }`}>
                  <div className="p-2">
                    <div className={`text-xs font-semibold px-3 py-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Available Skills
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {activeSkill && (
                        <button
                          onClick={async () => {
                            if (onDeactivateSkill) {
                              await onDeactivateSkill();
                              setIsSkillDropdownOpen(false);
                            }
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                            isDarkMode ? 'text-red-400 hover:bg-red-500/10' : 'text-red-600 hover:bg-red-50'
                          }`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          <span>Deactivate Skill</span>
                        </button>
                      )}
                      {availableSkills.map((skill) => {
                        const isActive = activeSkill?.id === skill.id;
                        return (
                          <button
                            key={skill.id}
                            onClick={async () => {
                              if (!isActive && onActivateSkill) {
                                await onActivateSkill(skill.id);
                                setIsSkillDropdownOpen(false);
                              }
                            }}
                            disabled={isActive}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                              isActive
                                ? isDarkMode ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-50 text-purple-700'
                                : isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-50 text-gray-700'
                            }`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{skill.display_name}</span>
                                {isActive && (
                                  <svg className="w-4 h-4 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                              <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                {skill.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
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
              title={currentConversationHasMemory ? 'Saved in memory' : 'Save to memory'}
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

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
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
            title="New Chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>

          {/* User avatar — opens UserSettings modal */}
          <button
            onClick={onOpenUserSettings}
            className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 hover:opacity-90 transition-opacity"
            title="User settings"
          >
            <span className="text-sm font-semibold text-white">{userInitial}</span>
          </button>

        </div>
      </div>
    </div>
  );
}

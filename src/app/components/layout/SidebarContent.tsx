'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Conversation } from '../../types';

interface SidebarContentProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  loadConversation: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => void;
  pinConversation: (conversationId: string, pinned: boolean) => void;
  renameConversation: (conversationId: string, title: string) => void;
  isSidebarCollapsed?: boolean;
  isDarkMode?: boolean;
  showWorkspace?: boolean;
  showHealth?: boolean;
}

function SidebarButton({
  onClick,
  icon,
  label,
  collapsed,
  variant,
  isDarkMode,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  collapsed?: boolean;
  variant?: 'default' | 'danger';
  isDarkMode?: boolean;
}) {
  const base = 'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors';
  const color = variant === 'danger'
    ? 'text-red-400 hover:bg-red-600/20'
    : isDarkMode
      ? 'text-gray-300 hover:bg-gray-800'
      : 'text-gray-600 hover:bg-gray-100';
  return (
    <button
      className={`${base} ${color} ${collapsed ? 'justify-center' : ''}`}
      onClick={onClick}
    >
      {icon}
      {!collapsed && <span className="flex-1 text-left">{label}</span>}
    </button>
  );
}

export default function SidebarContent({
  conversations,
  currentConversationId,
  loadConversation,
  deleteConversation,
  pinConversation,
  renameConversation,
  isSidebarCollapsed = false,
  isDarkMode = true,
  showWorkspace = false,
  showHealth = false,
}: SidebarContentProps & { isSidebarCollapsed?: boolean }) {
  const t = useTranslations('sidebar');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [conversationsOpen, setConversationsOpen] = useState(true);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  // Auto-focus rename input when it appears
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const handleRenameSubmit = (conversationId: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      renameConversation(conversationId, trimmed);
    }
    setRenamingId(null);
  };

  const d = isDarkMode;

  return (
    <>
      {/* Conversations */}
      {!isSidebarCollapsed && (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col min-h-0">
          <div className="space-y-2">
            <button
              onClick={() => setConversationsOpen(o => !o)}
              className="w-full flex items-center justify-between px-2 mb-2 group"
            >
              <p className={`text-xs uppercase transition-colors ${d ? 'text-gray-400 group-hover:text-gray-300' : 'text-gray-500 group-hover:text-gray-700'}`}>{t('conversations')}</p>
              <svg
                className={`w-3.5 h-3.5 transition-all duration-200 ${conversationsOpen ? '' : '-rotate-90'} ${d ? 'text-gray-500 group-hover:text-gray-400' : 'text-gray-400 group-hover:text-gray-600'}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {conversationsOpen && conversations.length === 0 ? (
              <p className={`text-xs px-2 ${d ? 'text-gray-500' : 'text-gray-400'}`}>{t('noConversations')}</p>
            ) : conversationsOpen ? (
              conversations.map((conv) => (
                <div key={conv.id} className="relative flex items-center">
                  {/* Inline rename input */}
                  {renamingId === conv.id ? (
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit(conv.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      onBlur={() => handleRenameSubmit(conv.id)}
                      className={`flex-1 px-3 py-2 text-sm rounded-lg border focus:border-brand-500 focus:outline-none min-w-0 ${
                        d
                          ? 'bg-gray-700 text-gray-100 border-gray-500'
                          : 'bg-white text-gray-900 border-gray-300'
                      }`}
                    />
                  ) : (
                    <>
                      {/* Conversation button */}
                      <button
                        onClick={() => loadConversation(conv.id)}
                        className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left min-w-0 ${
                          currentConversationId === conv.id
                            ? d ? 'bg-gray-800 text-white' : 'bg-indigo-50 text-indigo-900'
                            : d ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {conv.pinned ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 flex-shrink-0 ${d ? 'text-gray-400' : 'text-gray-500'}`} viewBox="0 0 24 24" fill="currentColor">
                            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v5h2v-5h5v-2l-2-2z"/>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                          </svg>
                        )}
                        <span className="truncate flex-1">{conv.title}</span>
                      </button>

                      {/* 3-dot menu */}
                      <div className="relative flex-shrink-0" ref={openMenuId === conv.id ? menuRef : null}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === conv.id ? null : conv.id); }}
                          className={`p-1.5 rounded-lg transition-colors ${d ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                          </svg>
                        </button>

                        {openMenuId === conv.id && (
                          <div className={`absolute right-0 top-full mt-1 w-40 rounded-lg shadow-xl border z-50 ${d ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                            {/* Pin / Unpin */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                pinConversation(conv.id, !conv.pinned);
                                setOpenMenuId(null);
                              }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-t-lg transition-colors ${d ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${d ? 'text-gray-400' : 'text-gray-500'}`} viewBox="0 0 24 24" fill="currentColor">
                                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v5h2v-5h5v-2l-2-2z"/>
                              </svg>
                              {conv.pinned ? t('unpin') : t('pin')}
                            </button>
                            {/* Rename */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(null);
                                setRenamingId(conv.id);
                                setRenameValue(conv.title);
                              }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors border-t ${d ? 'text-gray-300 hover:bg-gray-700 border-gray-700' : 'text-gray-700 hover:bg-gray-50 border-gray-100'}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${d ? 'text-gray-400' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              {t('rename')}
                            </button>
                            {/* Delete */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteConversation(conv.id);
                                setOpenMenuId(null);
                              }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 hover:bg-red-600/20 rounded-b-lg transition-colors border-t ${d ? 'border-gray-700' : 'border-gray-100'}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              {t('deleteConversation')}
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))
            ) : null}
          </div>
        </div>
      )}

      {/* Bottom menu — grouped */}
      <div className={`mt-auto border-t ${d ? 'border-gray-800' : 'border-gray-200'}`}>
        {/* My Allerac */}
        <div className="px-2 pt-2 pb-3 space-y-0.5">
          <SidebarButton
            onClick={() => window.dispatchEvent(new CustomEvent('openMyAlleracModal'))}
            collapsed={isSidebarCollapsed}
            label="My Allerac"
            isDarkMode={isDarkMode}
            icon={<img src="/icon-nobg-purple.svg" className="h-4 w-4" alt="My Allerac" />}
          />
          {showHealth && (
            <SidebarButton
              onClick={() => window.dispatchEvent(new CustomEvent('openHealthDashboard'))}
              collapsed={isSidebarCollapsed}
              label="Health"
              isDarkMode={isDarkMode}
              icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>}
            />
          )}
          {showWorkspace && (
            <SidebarButton
              onClick={() => window.location.href = '/workspace'}
              collapsed={isSidebarCollapsed}
              label="Workspace"
              isDarkMode={isDarkMode}
              icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>}
            />
          )}
        </div>

      </div>
    </>
  );
}

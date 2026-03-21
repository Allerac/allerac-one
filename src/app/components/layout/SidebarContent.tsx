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
}

function SidebarButton({
  onClick,
  icon,
  label,
  collapsed,
  variant,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  collapsed?: boolean;
  variant?: 'default' | 'danger';
}) {
  const base = 'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors';
  const color = variant === 'danger'
    ? 'text-red-400 hover:bg-red-600/20'
    : 'text-gray-300 hover:bg-gray-800';
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
}: SidebarContentProps & { isSidebarCollapsed?: boolean }) {
  const t = useTranslations('sidebar');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
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

  return (
    <>
      {/* Conversations */}
      {!isSidebarCollapsed && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            <p className="text-xs uppercase text-gray-400 px-2 mb-2">{t('conversations')}</p>
            {conversations.length === 0 ? (
              <p className="text-xs text-gray-500 px-2">{t('noConversations')}</p>
            ) : (
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
                      className="flex-1 px-3 py-2 text-sm rounded-lg bg-gray-700 text-gray-100 border border-gray-500 focus:border-brand-500 focus:outline-none min-w-0"
                    />
                  ) : (
                    <>
                      {/* Conversation button */}
                      <button
                        onClick={() => loadConversation(conv.id)}
                        className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left min-w-0 ${
                          currentConversationId === conv.id
                            ? 'bg-gray-800 text-white'
                            : 'text-gray-300 hover:bg-gray-800'
                        }`}
                      >
                        {conv.pinned ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
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
                          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                          </svg>
                        </button>

                        {openMenuId === conv.id && (
                          <div className="absolute right-0 top-full mt-1 w-40 rounded-lg shadow-xl bg-gray-800 border border-gray-700 z-50">
                            {/* Pin / Unpin */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                pinConversation(conv.id, !conv.pinned);
                                setOpenMenuId(null);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700 rounded-t-lg transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
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
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors border-t border-gray-700"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 hover:bg-red-600/20 rounded-b-lg transition-colors border-t border-gray-700"
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
            )}
          </div>
        </div>
      )}

      {/* Bottom actions */}
      <div className="mt-auto p-4 border-t border-gray-800 space-y-1">
        <SidebarButton
          onClick={() => window.dispatchEvent(new CustomEvent('openMemorySettingsModal'))}
          collapsed={isSidebarCollapsed}
          label={t('memorySettings')}
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" /></svg>}
        />
        <SidebarButton
          onClick={() => window.dispatchEvent(new CustomEvent('openDocumentsModal'))}
          collapsed={isSidebarCollapsed}
          label={t('documents')}
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
        />
        <SidebarButton
          onClick={() => window.dispatchEvent(new CustomEvent('openMemoriesModal'))}
          collapsed={isSidebarCollapsed}
          label={t('memories')}
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>}
        />
        <SidebarButton
          onClick={() => window.dispatchEvent(new CustomEvent('openSkillsLibrary'))}
          collapsed={isSidebarCollapsed}
          label={t('skills')}
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
        />
        <SidebarButton
          onClick={() => window.dispatchEvent(new CustomEvent('openScheduledJobsModal'))}
          collapsed={isSidebarCollapsed}
          label={t('scheduledJobs')}
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <SidebarButton
          onClick={() => window.dispatchEvent(new CustomEvent('openHealthDashboard'))}
          collapsed={isSidebarCollapsed}
          label={t('health')}
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>}
        />
        <SidebarButton
          onClick={() => window.dispatchEvent(new CustomEvent('openSystemDashboard'))}
          collapsed={isSidebarCollapsed}
          label={t('systemDashboard')}
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        />
      </div>
    </>
  );
}

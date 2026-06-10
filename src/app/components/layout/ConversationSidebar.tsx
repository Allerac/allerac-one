'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ConvItem } from '@/app/hooks/useConversations';
import DomainChip from './DomainChip';
import UserCreditBalance from '@/app/components/credits/UserCreditBalance';

interface Props {
  isDark: boolean;
  conversations: ConvItem[];
  currentConvId: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onRename: (id: string, title: string) => void;
  // domain + user controls (moved here from removed header)
  domainId: string;
  userId: string;
  isAdmin: boolean;
  onToggleTheme: () => void;
  userInitials: string;
  userName: string | null;
  userEmail: string;
  onLogout: () => void;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function ConversationSidebar({
  isDark: d, conversations, currentConvId, collapsed, onToggle,
  onSelect, onNew, onDelete, onPin, onRename,
  domainId, userId, isAdmin, onToggleTheme, userInitials, userName, userEmail, onLogout,
}: Props) {
  const [openMenuId, setOpenMenuId]   = useState<string | null>(null);
  const [renamingId, setRenamingId]   = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const router = useRouter();

  const commitRename = (id: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) onRename(id, trimmed);
    setRenamingId(null);
  };

  const pinned = conversations.filter(c => c.pinned);
  const recent = conversations.filter(c => !c.pinned);

  if (collapsed) {
    return (
      <div className={`w-[52px] flex-shrink-0 border-r flex flex-col items-center py-2 gap-1 ${d ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
        <button
          onClick={onToggle}
          className={`p-2 rounded-lg transition-colors ${d ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}
          title="Expand sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button
          onClick={onNew}
          className={`p-2 rounded-lg transition-colors ${d ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}
          title="New conversation"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        {isAdmin && (
          <button
            onClick={() => router.push('/')}
            className={`p-2 rounded-lg transition-colors ${d ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}
            title="Hub"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>
        )}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('openMyAlleracModal'))}
          className={`p-2 rounded-lg transition-colors ${d ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}
          title="My Allerac"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M15.5 13a3.5 3.5 0 0 0 -3.5 3.5v1a3.5 3.5 0 0 0 7 0v-1.8" />
            <path d="M8.5 13a3.5 3.5 0 0 1 3.5 3.5v1a3.5 3.5 0 0 1 -7 0v-1.8" />
            <path d="M17.5 16a3.5 3.5 0 0 0 0 -7h-.5" />
            <path d="M19 9.3v-2.8a3.5 3.5 0 0 0 -7 0" />
            <path d="M6.5 16a3.5 3.5 0 0 1 0 -7h.5" />
            <path d="M5 9.3v-2.8a3.5 3.5 0 0 1 7 0v10" />
          </svg>
        </button>
        <button
          disabled
          className={`p-2 rounded-lg opacity-30 cursor-not-allowed ${d ? 'text-gray-400' : 'text-gray-500'}`}
          title="Save to memory (select a conversation first)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>
        <div className="flex-1" />
        <button
          onClick={onToggleTheme}
          className={`p-2 rounded-lg transition-colors ${d ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}
          title="Toggle theme"
        >
          {d ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
        <button
          onClick={() => setUserMenuOpen(o => !o)}
          className="w-7 h-7 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center hover:opacity-90 transition-opacity mb-1"
          title={userName || userEmail}
        >
          {userInitials}
        </button>
      </div>
    );
  }

  const renderItem = (c: ConvItem) => {
    const isActive   = c.id === currentConvId;
    const isRenaming = renamingId === c.id;
    const menuOpen   = openMenuId === c.id;

    return (
      <div key={c.id} className="relative flex items-center">
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename(c.id);
              if (e.key === 'Escape') setRenamingId(null);
            }}
            onBlur={() => commitRename(c.id)}
            className={`flex-1 px-3 py-2 text-sm rounded-lg border focus:outline-none min-w-0 ${
              d ? 'bg-gray-700 text-gray-100 border-gray-500' : 'bg-white text-gray-900 border-gray-300'
            }`}
          />
        ) : (
          <>
            <button
              onClick={() => onSelect(c.id)}
              className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left min-w-0 ${
                isActive
                  ? d ? 'bg-gray-800 text-white' : 'bg-indigo-50 text-indigo-900'
                  : d ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {c.pinned ? (
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 flex-shrink-0 ${d ? 'text-gray-400' : 'text-gray-500'}`} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v5h2v-5h5v-2l-2-2z"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 flex-shrink-0 ${d ? 'text-gray-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              )}
              <span className="truncate flex-1">{c.title || 'Untitled'}</span>
              <span className={`text-xs flex-shrink-0 ${d ? 'text-gray-600' : 'text-gray-400'}`}>{timeAgo(c.updated_at)}</span>
            </button>

            {/* 3-dot menu */}
            <div className="relative flex-shrink-0" ref={menuOpen ? menuRef : null}>
              <button
                onClick={e => { e.stopPropagation(); setOpenMenuId(menuOpen ? null : c.id); }}
                className={`p-1.5 rounded-lg transition-colors ${d ? 'text-gray-600 hover:text-gray-300 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                </svg>
              </button>

              {menuOpen && (
                <div className={`absolute right-0 top-full mt-1 w-40 rounded-lg shadow-xl border z-50 ${d ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  <button
                    onClick={e => { e.stopPropagation(); onPin(c.id, !c.pinned); setOpenMenuId(null); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-t-lg transition-colors ${d ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${d ? 'text-gray-400' : 'text-gray-500'}`} viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v5h2v-5h5v-2l-2-2z"/>
                    </svg>
                    {c.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setOpenMenuId(null); setRenamingId(c.id); setRenameValue(c.title); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors border-t ${d ? 'text-gray-300 hover:bg-gray-700 border-gray-700' : 'text-gray-700 hover:bg-gray-50 border-gray-100'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${d ? 'text-gray-400' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Rename
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(c.id); setOpenMenuId(null); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 hover:bg-red-600/20 rounded-b-lg transition-colors border-t ${d ? 'border-gray-700' : 'border-gray-100'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className={`w-[240px] flex-shrink-0 border-r flex flex-col overflow-hidden ${d ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
      {/* Header: collapse + DomainChip */}
      <div className={`flex items-center gap-2 px-2 border-b flex-shrink-0 h-11 ${d ? 'border-gray-800' : 'border-gray-200'}`}>
        <button
          onClick={onToggle}
          className={`p-2 rounded-lg transition-colors flex-shrink-0 ${d ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}
          title="Collapse sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <DomainChip isDark={d} domainId={domainId} userId={userId} isAdmin={isAdmin} />
      </div>

      {/* Action icons row */}
      <div className={`flex items-center gap-0.5 px-2 py-2 border-b flex-shrink-0 ${d ? 'border-gray-800' : 'border-gray-200'}`}>
        <button
          onClick={onNew}
          className={`p-2 rounded-lg transition-colors flex-1 flex justify-center ${d ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}
          title="New conversation"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        {isAdmin && (
          <button
            onClick={() => router.push('/')}
            className={`p-2 rounded-lg transition-colors flex-1 flex justify-center ${d ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}
            title="Hub"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>
        )}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('openMyAlleracModal'))}
          className={`p-2 rounded-lg transition-colors flex-1 flex justify-center ${d ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}
          title="My Allerac"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M15.5 13a3.5 3.5 0 0 0 -3.5 3.5v1a3.5 3.5 0 0 0 7 0v-1.8" />
            <path d="M8.5 13a3.5 3.5 0 0 1 3.5 3.5v1a3.5 3.5 0 0 1 -7 0v-1.8" />
            <path d="M17.5 16a3.5 3.5 0 0 0 0 -7h-.5" />
            <path d="M19 9.3v-2.8a3.5 3.5 0 0 0 -7 0" />
            <path d="M6.5 16a3.5 3.5 0 0 1 0 -7h.5" />
            <path d="M5 9.3v-2.8a3.5 3.5 0 0 1 7 0v10" />
          </svg>
        </button>
        <button
          disabled
          className={`p-2 rounded-lg opacity-30 cursor-not-allowed flex-1 flex justify-center ${d ? 'text-gray-400' : 'text-gray-500'}`}
          title="Save to memory (coming soon)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {pinned.length > 0 && (
          <>
            <p className={`text-xs uppercase px-2 mb-2 ${d ? 'text-gray-500' : 'text-gray-400'}`}>Pinned</p>
            {pinned.map(renderItem)}
          </>
        )}
        {recent.length > 0 && (
          <>
            {pinned.length > 0 && (
              <p className={`text-xs uppercase px-2 mt-4 mb-2 ${d ? 'text-gray-500' : 'text-gray-400'}`}>Recent</p>
            )}
            {recent.map(renderItem)}
          </>
        )}
        {conversations.length === 0 && (
          <p className={`text-xs px-2 ${d ? 'text-gray-500' : 'text-gray-400'}`}>No conversations yet</p>
        )}
      </div>

      {/* Bottom: theme + user */}
      <div className={`mt-auto border-t px-2 pt-2 pb-3 space-y-0.5 ${d ? 'border-gray-800' : 'border-gray-200'}`}>
        {/* theme toggle */}
        <button
          onClick={onToggleTheme}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${d ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          {d ? (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
          {d ? 'Light mode' : 'Dark mode'}
        </button>

        {/* user */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(o => !o)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${d ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            <span className="w-5 h-5 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              {userInitials}
            </span>
            <span className="flex-1 text-left truncate">{userName || userEmail}</span>
          </button>

          {userMenuOpen && (
            <div className={`absolute bottom-full left-0 mb-1 w-full rounded-xl shadow-2xl border z-50 p-1.5 ${d ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
              <div className={`px-3 py-2 mb-1 border-b ${d ? 'border-gray-700' : 'border-gray-100'}`}>
                <p className={`text-sm font-semibold truncate ${d ? 'text-gray-100' : 'text-gray-900'}`}>{userName || 'User'}</p>
                <p className={`text-xs truncate ${d ? 'text-gray-500' : 'text-gray-400'}`}>{userEmail}</p>
              </div>
              <UserCreditBalance
                isDarkMode={d}
                className={`mb-1 border-b ${d ? 'border-gray-700' : 'border-gray-100'}`}
              />
              <button
                onClick={() => { setUserMenuOpen(false); onLogout(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-600/20 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

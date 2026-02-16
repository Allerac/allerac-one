'use client';

import { useTranslations } from 'next-intl';
import { Model, Conversation } from '../../types';

interface SidebarContentProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  loadConversation: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => void;
  MODELS: Model[];
  selectedModel: string;
  setSelectedModel: (modelId: string) => void;
  isModelDropdownOpen: boolean;
  setIsModelDropdownOpen: (open: boolean) => void;
  isConfigurationExpanded: boolean;
  setIsConfigurationExpanded: (expanded: boolean) => void;
}

export default function SidebarContent({
  conversations,
  currentConversationId,
  loadConversation,
  deleteConversation,
  MODELS,
  selectedModel,
  setSelectedModel,
  isConfigurationExpanded,
  setIsConfigurationExpanded,
  isSidebarCollapsed = false,
}: SidebarContentProps & { isSidebarCollapsed?: boolean }) {
  const t = useTranslations('sidebar');

  return (
    <>
      {/* Conversations (hide when collapsed) */}
      {!isSidebarCollapsed && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            <p className="text-xs uppercase text-gray-400 px-2 mb-2">{t('conversations')}</p>
            {conversations.length === 0 ? (
              <p className="text-xs text-gray-500 px-2">{t('noConversations')}</p>
            ) : (
              conversations.map((conv) => (
                <div key={conv.id} className="group relative">
                  <button
                    onClick={() => loadConversation(conv.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                      currentConversationId === conv.id
                        ? 'bg-gray-800 text-white'
                        : 'text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    <span className="truncate flex-1">{conv.title}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 hover:bg-red-600 rounded transition-all"
                    title={t('deleteConversation')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {/* Configuration Section */}
      <div className="mt-auto p-4 border-t border-gray-800 space-y-2">
        <button
          onClick={() => setIsConfigurationExpanded(!isConfigurationExpanded)}
          className={`w-full flex items-center justify-between px-2 mb-2 ${isSidebarCollapsed ? 'justify-center' : ''}`}
        >
          <p className={`text-xs uppercase text-gray-400 ${isSidebarCollapsed ? 'sr-only' : ''}`}>{t('configuration')}</p>
          <div className="p-1 rounded hover:bg-gray-800 transition-colors">
            <svg
              className={`h-4 w-4 text-gray-400 transition-transform ${!isConfigurationExpanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
        {isConfigurationExpanded && (
          <div>
            {/* Configuration Actions */}
            <div className="space-y-1 mt-4">
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => window.dispatchEvent(new CustomEvent('openTokenModal'))}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                {!isSidebarCollapsed && <span className="flex-1 text-left">{t('apiKeys')}</span>}
              </button>
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => window.dispatchEvent(new CustomEvent('openMemorySettingsModal'))}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
                {!isSidebarCollapsed && <span className="flex-1 text-left">{t('memorySettings')}</span>}
              </button>
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => window.dispatchEvent(new CustomEvent('openUserSettingsModal'))}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {!isSidebarCollapsed && <span className="flex-1 text-left">{t('userSettings')}</span>}
              </button>
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => window.dispatchEvent(new CustomEvent('openDocumentsModal'))}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {!isSidebarCollapsed && <span className="flex-1 text-left">{t('documents')}</span>}
              </button>
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => window.dispatchEvent(new CustomEvent('openMemoriesModal'))}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                {!isSidebarCollapsed && <span className="flex-1 text-left">{t('memories')}</span>}
              </button>
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => window.dispatchEvent(new CustomEvent('openSkillsLibrary'))}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {!isSidebarCollapsed && <span className="flex-1 text-left">{t('skills')}</span>}
              </button>
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => window.dispatchEvent(new CustomEvent('openSystemDashboard'))}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                {!isSidebarCollapsed && <span className="flex-1 text-left">{t('systemDashboard')}</span>}
              </button>
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-600/20 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => window.dispatchEvent(new CustomEvent('logout'))}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                {!isSidebarCollapsed && <span className="flex-1 text-left">{t('logout')}</span>}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

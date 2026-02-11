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
                <span>🔑</span>
                {!isSidebarCollapsed && <span className="flex-1 text-left">{t('apiKeys')}</span>}
              </button>
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => window.dispatchEvent(new CustomEvent('openMemorySettingsModal'))}
              >
                <span>🧠</span>
                {!isSidebarCollapsed && <span className="flex-1 text-left">{t('memorySettings')}</span>}
              </button>
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => window.dispatchEvent(new CustomEvent('openUserSettingsModal'))}
              >
                <span>👤</span>
                {!isSidebarCollapsed && <span className="flex-1 text-left">{t('userSettings')}</span>}
              </button>
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => window.dispatchEvent(new CustomEvent('openDocumentsModal'))}
              >
                <span>📄</span>
                {!isSidebarCollapsed && <span className="flex-1 text-left">{t('documents')}</span>}
              </button>
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => window.dispatchEvent(new CustomEvent('openMemoriesModal'))}
              >
                <span>🗂️</span>
                {!isSidebarCollapsed && <span className="flex-1 text-left">{t('memories')}</span>}
              </button>
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-600/20 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => window.dispatchEvent(new CustomEvent('logout'))}
              >
                <span>🚪</span>
                {!isSidebarCollapsed && <span className="flex-1 text-left">{t('logout')}</span>}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

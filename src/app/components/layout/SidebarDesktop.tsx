'use client';

import { Model, Conversation } from '../../types';
import SidebarContent from './SidebarContent';

interface SidebarDesktopProps {
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  isDarkMode: boolean;
  conversations: Conversation[];
  currentConversationId: string | null;
  loadConversation: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => void;
  pinConversation: (conversationId: string, pinned: boolean) => void;
  renameConversation: (conversationId: string, title: string) => void;
  MODELS: Model[];
  selectedModel: string;
  setSelectedModel: (modelId: string) => void;
}

export default function SidebarDesktop({
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  isDarkMode,
  conversations,
  currentConversationId,
  loadConversation,
  deleteConversation,
  pinConversation,
  renameConversation,
  MODELS,
  selectedModel,
  setSelectedModel,
}: SidebarDesktopProps) {
  return (
    <div className={`fixed inset-y-0 left-0 z-40 bg-gray-900 text-white flex flex-col border-r border-gray-800 transition-all duration-300 ${
      isSidebarCollapsed ? 'w-20' : 'w-64'
    }`}>
      {/* Header — matches ChatHeader style */}
      <div>
        <div className="px-3 pb-2 flex items-center gap-3" style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}>
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="p-2 rounded-lg text-gray-300 hover:bg-gray-700 transition-colors flex-shrink-0"
            title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isSidebarCollapsed ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </button>
          {!isSidebarCollapsed && (
            <span className="text-xl font-bold text-gray-100">Allerac</span>
          )}
        </div>
      </div>

      <SidebarContent
        conversations={conversations}
        currentConversationId={currentConversationId}
        loadConversation={loadConversation}
        deleteConversation={deleteConversation}
        pinConversation={pinConversation}
        renameConversation={renameConversation}
        MODELS={MODELS}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        isModelDropdownOpen={false}
        setIsModelDropdownOpen={() => {}}
        isSidebarCollapsed={isSidebarCollapsed}
      />
    </div>
  );
}

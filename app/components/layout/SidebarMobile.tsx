'use client';

import { useState } from 'react';
import { Model, Conversation } from '../../types';
import SidebarContent from './SidebarContent';

interface SidebarMobileProps {
  isSidebarOpen: boolean;
  isDarkMode: boolean;
  toggleTheme: () => void;
  clearChat: () => void;
  conversations: Conversation[];
  currentConversationId: string | null;
  loadConversation: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => void;
  MODELS: Model[];
  selectedModel: string;
  setSelectedModel: (modelId: string) => void;
  setIsTokenModalOpen: (open: boolean) => void;
  setSystemMessageEdit: (message: string) => void;
  systemMessage: string;
  setIsEditingSettings: (editing: boolean) => void;
  setIsDocumentModalOpen: (open: boolean) => void;
  setIsMemoryModalOpen: (open: boolean) => void;
  setIsUserSettingsOpen: (open: boolean) => void;
  handleLogout: () => void;
}

export default function SidebarMobile({
  isSidebarOpen,
  isDarkMode,
  toggleTheme,
  clearChat,
  conversations,
  currentConversationId,
  loadConversation,
  deleteConversation,
  MODELS,
  selectedModel,
  setSelectedModel,
  setIsTokenModalOpen,
  setSystemMessageEdit,
  systemMessage,
  setIsEditingSettings,
  setIsDocumentModalOpen,
  setIsMemoryModalOpen,
  setIsUserSettingsOpen,
  handleLogout
}: SidebarMobileProps) {
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isConfigurationExpanded, setIsConfigurationExpanded] = useState(true);
  return (
    <div className={`fixed inset-y-0 left-0 z-50 w-[70%] bg-gray-900 text-white flex flex-col border-r border-gray-800 transform transition-transform duration-300 ${
      isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
    }`}>
      {/* Top Actions - Fixed */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex gap-2">
          <button
            onClick={toggleTheme}
            className="flex-1 flex items-center justify-center px-4 py-3 rounded-lg text-yellow-500 hover:bg-yellow-500/10 transition-colors"
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
          <button
            onClick={clearChat}
            className="flex-1 flex items-center justify-center px-4 py-3 rounded-lg text-blue-500 hover:bg-blue-500/10 transition-colors"
            title="New Chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>
      </div>
      {/* Shared Content */}
      <SidebarContent
        conversations={conversations}
        currentConversationId={currentConversationId}
        loadConversation={loadConversation}
        deleteConversation={deleteConversation}
        MODELS={MODELS}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        isModelDropdownOpen={isModelDropdownOpen}
        setIsModelDropdownOpen={setIsModelDropdownOpen}
        isConfigurationExpanded={isConfigurationExpanded}
        setIsConfigurationExpanded={setIsConfigurationExpanded}
      />
      {/* ...existing code for action buttons, modals, etc. ... */}
    </div>
  );
}

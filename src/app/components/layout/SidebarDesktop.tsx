'use client';

import { useState } from 'react';
import { Model, Conversation } from '../../types';
import SidebarContent from './SidebarContent';

interface SidebarDesktopProps {
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
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
  setIsSkillsLibraryOpen: (open: boolean) => void;
  setIsUserSettingsOpen: (open: boolean) => void;
  handleLogout: () => void;
}

export default function SidebarDesktop({
  isSidebarCollapsed,
  setIsSidebarCollapsed,
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
  setIsSkillsLibraryOpen,
  setIsUserSettingsOpen,
  handleLogout
}: SidebarDesktopProps) {
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isConfigurationExpanded, setIsConfigurationExpanded] = useState(true);
  const selectedModelObj = MODELS.find(m => m.id === selectedModel);

  return (
    <div className={`fixed inset-y-0 left-0 z-40 bg-gray-900 text-white flex flex-col border-r border-gray-800 transition-all duration-300 ${
      isSidebarCollapsed ? 'w-20' : 'w-64'
    }`}>
      {/* Top Actions - Fixed */}
      <div className="p-4 border-b border-gray-800">
        <div className={`flex ${isSidebarCollapsed ? 'flex-col' : ''} gap-2`}>
          {/* Hamburger (collapse/expand toggle) */}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="flex-1 flex items-center justify-center px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 transition-colors"
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
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
        isSidebarCollapsed={isSidebarCollapsed}
      />
      
      {/* Action Buttons */}
      <div className={`p-4 border-t border-gray-800 ${isSidebarCollapsed ? 'hidden' : ''}`}>
        <button
          onClick={() => setIsTokenModalOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors text-left"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <span className="text-sm">API Keys</span>
        </button>
        <button
          onClick={() => {
            setSystemMessageEdit(systemMessage);
            setIsEditingSettings(true);
          }}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors text-left"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          <span className="text-sm">Memory Settings</span>
        </button>
        <button
          onClick={() => setIsDocumentModalOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors text-left"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-sm">Documents</span>
        </button>
        <button
          onClick={() => setIsMemoryModalOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors text-left"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span className="text-sm">Memories</span>
        </button>
        <button
          onClick={() => setIsSkillsLibraryOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors text-left"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-sm">Skills</span>
        </button>
      </div>
    </div>
  );
}

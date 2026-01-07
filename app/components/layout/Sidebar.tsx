'use client';

import { useState } from 'react';
import { Model, Conversation } from '../../types';

interface SidebarProps {
  isSidebarOpen: boolean;
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
  setIsUserSettingsOpen: (open: boolean) => void;
  handleLogout: () => void;
}

export default function Sidebar({
  isSidebarOpen,
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
  setIsUserSettingsOpen,
  handleLogout
}: SidebarProps) {
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isConfigurationExpanded, setIsConfigurationExpanded] = useState(true);
  const selectedModelObj = MODELS.find(m => m.id === selectedModel);

  return (
    <div className={`fixed inset-y-0 left-0 z-50 bg-gray-900 text-white flex flex-col border-r border-gray-800 transform transition-all duration-300 ${
      isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
    } ${isSidebarCollapsed ? 'lg:w-20' : 'w-[70%] lg:w-64'}`}>
      {/* Top Actions - Fixed */}
      <div className="p-4 border-b border-gray-800">
        <div className={`flex ${isSidebarCollapsed ? 'lg:flex-col' : ''} gap-2`}>
          {/* Hamburger - only visible on desktop */}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden lg:flex flex-1 items-center justify-center px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 transition-colors"
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
      
      {/* Conversations - Scrollable (always visible on mobile, only when expanded on desktop) */}
      <div className={`flex-1 overflow-y-auto p-4 ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>
        <div className="space-y-2">
          <p className="text-xs uppercase text-gray-400 px-2 mb-2">Conversations</p>
          {conversations.length === 0 ? (
            <p className="text-xs text-gray-500 px-2">No conversations yet</p>
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
                  title="Delete conversation"
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
      
      {/* Bottom Actions - Fixed */}
      <div className="mt-auto p-4 border-t border-gray-800 space-y-2">
        {/* Configuration Header (only when expanded on desktop, always visible on mobile) */}
        <div className={isSidebarCollapsed ? 'hidden lg:hidden' : ''}>
        <button
          onClick={() => setIsConfigurationExpanded(!isConfigurationExpanded)}
          className="w-full flex items-center justify-between px-2 mb-2"
        >
          <p className="text-xs uppercase text-gray-400">Configuration</p>
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
        </div>

        {/* AI Model Dropdown - Only show when expanded on desktop, always visible on mobile when configuration is expanded */}
        <div className={isSidebarCollapsed ? 'hidden lg:hidden' : (isConfigurationExpanded ? '' : 'hidden')}>
        <div className="relative mb-2">
          
          {/* Dropdown Button */}
          <button
            onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            <span className="text-lg">{selectedModelObj?.icon}</span>
            <div className="flex-1 text-left font-medium">{selectedModelObj?.name}</div>
            <svg 
              className={`h-5 w-5 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`}
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown Overlay (click outside to close) */}
          {isModelDropdownOpen && (
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setIsModelDropdownOpen(false)}
            />
          )}

          {/* Dropdown Menu */}
          {isModelDropdownOpen && (
            <div className="absolute left-0 right-0 bottom-full mb-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-20 max-h-80 overflow-y-auto">
              {MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    setSelectedModel(model.id);
                    setIsModelDropdownOpen(false);
                  }}
                  className={`w-full flex items-start gap-3 px-3 py-2 text-sm transition-colors ${
                    selectedModel === model.id
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <span className="text-lg mt-0.5">{model.icon}</span>
                  <div className="flex-1 text-left">
                    <div className="font-medium">{model.name}</div>
                    {model.description && (
                      <div className="text-xs text-gray-400 mt-0.5">{model.description}</div>
                    )}
                  </div>
                  {selectedModel === model.id && (
                    <svg className="h-4 w-4 text-blue-400 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        </div>

        {/* Action Buttons - Only show when configuration is expanded */}
        <div className={isSidebarCollapsed ? 'hidden lg:hidden' : (isConfigurationExpanded ? '' : 'hidden')}>
        <button
          onClick={() => setIsTokenModalOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors text-left"
          title="API Keys"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <span className={`text-sm ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>API Keys</span>
        </button>
        <button
          onClick={() => {
            setSystemMessageEdit(systemMessage);
            setIsEditingSettings(true);
          }}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors text-left"
          title="Memory Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          <span className={`text-sm ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>Memory Settings</span>
        </button>
        <button
          onClick={() => setIsDocumentModalOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors text-left"
          title="Documents"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className={`text-sm ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>Documents</span>
        </button>
        <button
          onClick={() => setIsMemoryModalOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors text-left"
          title="Memories"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span className={`text-sm ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>Memories</span>
        </button>
        <button
          onClick={() => setIsUserSettingsOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors text-left"
          title="User Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className={`text-sm ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>User Settings</span>
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-red-900 transition-colors text-left"
          title="Logout"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className={`text-sm ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>Logout</span>
        </button>
        </div>
      </div>
    </div>
  );
}

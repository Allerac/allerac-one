import { useState } from 'react';
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
    const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
  const selectedModelObj = MODELS.find(m => m.id === selectedModel);
  return (
    <>
      {/* Conversations (hide when collapsed) */}
      {!isSidebarCollapsed && (
        <div className="flex-1 overflow-y-auto p-4">
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
      )}
      {/* Configuration Section */}
      <div className="mt-auto p-4 border-t border-gray-800 space-y-2">
        <button
          onClick={() => setIsConfigurationExpanded(!isConfigurationExpanded)}
          className={`w-full flex items-center justify-between px-2 mb-2 ${isSidebarCollapsed ? 'justify-center' : ''}`}
        >
          <p className={`text-xs uppercase text-gray-400 ${isSidebarCollapsed ? 'sr-only' : ''}`}>Configuration</p>
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
            {/* Configuration Actions (old, with model option) */}
            <div className="space-y-1 mt-4">
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => setIsModelDialogOpen(true)}
              >
                <span>{MODELS.find(m => m.id === selectedModel)?.icon}</span>
                {!isSidebarCollapsed && <span className="flex-1 text-left">Model</span>}
              </button>
              {isModelDialogOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsModelDialogOpen(false)} />
                  <div className="relative z-10 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl max-w-md w-full p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-gray-100">Select Model</h2>
                      <button onClick={() => setIsModelDialogOpen(false)} className="text-gray-400 hover:text-gray-200">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {MODELS.map((model) => (
                        <button
                          key={model.id}
                          onClick={() => {
                            setSelectedModel(model.id);
                            setIsModelDialogOpen(false);
                          }}
                          className={`w-full flex items-start gap-3 px-3 py-2 text-sm transition-colors rounded-lg ${
                            selectedModel === model.id
                              ? 'bg-gray-700 text-white'
                              : 'text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          <span>{model.icon}</span>
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
                  </div>
                </div>
              )}
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => window.dispatchEvent(new CustomEvent('openTokenModal'))}
              >
                <span>🔑</span>
                {!isSidebarCollapsed && <span className="flex-1 text-left">API Keys</span>}
              </button>
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => window.dispatchEvent(new CustomEvent('openMemorySettingsModal'))}
              >
                <span>🧠</span>
                {!isSidebarCollapsed && <span className="flex-1 text-left">Memory Settings</span>}
              </button>
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => window.dispatchEvent(new CustomEvent('openUserSettingsModal'))}
              >
                <span>👤</span>
                {!isSidebarCollapsed && <span className="flex-1 text-left">User Settings</span>}
              </button>
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => window.dispatchEvent(new CustomEvent('openDocumentsModal'))}
              >
                <span>📄</span>
                {!isSidebarCollapsed && <span className="flex-1 text-left">Documents</span>}
              </button>
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => window.dispatchEvent(new CustomEvent('openMemoriesModal'))}
              >
                <span>🗂️</span>
                {!isSidebarCollapsed && <span className="flex-1 text-left">Memories</span>}
              </button>
              <button
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-600/20 transition-colors ${isSidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => window.dispatchEvent(new CustomEvent('logout'))}
              >
                <span>🚪</span>
                {!isSidebarCollapsed && <span className="flex-1 text-left">Logout</span>}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

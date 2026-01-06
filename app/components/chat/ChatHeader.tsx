'use client';

import { Model } from '../../types';

interface ChatHeaderProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  isDarkMode: boolean;
  selectedModel: string;
  MODELS: Model[];
  currentConversationId: string | null;
  currentConversationHasMemory: boolean;
  handleGenerateSummary: () => void;
}

export default function ChatHeader({
  isSidebarOpen,
  setIsSidebarOpen,
  isDarkMode,
  selectedModel,
  MODELS,
  currentConversationId,
  currentConversationHasMemory,
  handleGenerateSummary
}: ChatHeaderProps) {
  return (
    <div className={`border-b ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
      <div className="px-3 sm:px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode
                ? 'hover:bg-gray-700 text-gray-300'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
            title={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isSidebarOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <span className="text-xl">{MODELS.find((m: Model) => m.id === selectedModel)?.icon || '🤖'}</span>
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                {MODELS.find((m: Model) => m.id === selectedModel)?.name || 'AI Assistant'}
              </h2>
              <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Online</p>
            </div>
          </div>
          {currentConversationId && (
            <button
              onClick={handleGenerateSummary}
              className={`flex items-center gap-2 px-4 py-2 text-white text-sm rounded-lg transition-colors ${
                currentConversationHasMemory 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-purple-600 hover:bg-purple-700'
              }`}
              title={currentConversationHasMemory 
                ? 'This conversation is already saved in memory' 
                : 'Save this conversation to long-term memory'
              }
            >
              {currentConversationHasMemory ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              )}
              Remember It
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

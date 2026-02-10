'use client';

import { useState, useRef, useEffect } from 'react';
import { Model } from '../../types';

interface ChatHeaderProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  isDarkMode: boolean;
  selectedModel: string;
  setSelectedModel: (modelId: string) => void;
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
  setSelectedModel,
  MODELS,
  currentConversationId,
  currentConversationHasMemory,
  handleGenerateSummary
}: ChatHeaderProps) {
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentModel = MODELS.find((m: Model) => m.id === selectedModel);

  return (
    <div className={`border-b ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
      <div className="px-3 sm:px-6 py-4">
        <div className="flex items-center gap-3">
          {/* Mobile hamburger button - only visible on small screens */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`lg:hidden p-2 rounded-lg transition-colors ${
              isDarkMode
                ? 'hover:bg-gray-700 text-gray-300'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
            title={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Model selector dropdown */}
          <div className="relative flex-1" ref={dropdownRef}>
            <button
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              className={`flex items-center gap-3 p-2 rounded-lg transition-colors w-full ${
                isDarkMode
                  ? 'hover:bg-gray-700'
                  : 'hover:bg-gray-100'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <span className="text-xl">{currentModel?.icon || '🤖'}</span>
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {currentModel?.name || 'AI Assistant'}
                  </h2>
                  <svg
                    className={`w-4 h-4 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''} ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {currentModel?.description || 'Online'}
                </p>
              </div>
            </button>

            {/* Dropdown menu */}
            {isModelDropdownOpen && (
              <div className={`absolute top-full left-0 mt-2 w-80 rounded-lg shadow-xl border z-50 max-h-96 overflow-y-auto ${
                isDarkMode
                  ? 'bg-gray-800 border-gray-700'
                  : 'bg-white border-gray-200'
              }`}>
                {MODELS.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      setSelectedModel(model.id);
                      setIsModelDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      selectedModel === model.id
                        ? isDarkMode
                          ? 'bg-gray-700'
                          : 'bg-blue-50'
                        : isDarkMode
                        ? 'hover:bg-gray-700'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-xl">{model.icon}</span>
                    <div className="flex-1">
                      <div className={`font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                        {model.name}
                      </div>
                      <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {model.description}
                      </div>
                    </div>
                    {selectedModel === model.id && (
                      <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
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
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

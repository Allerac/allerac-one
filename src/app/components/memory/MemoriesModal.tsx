'use client';

import { useEffect } from 'react';
import ConversationMemoriesView from '../memory/ConversationMemoriesView';

interface MemoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  userId: string | null;
  githubToken: string;
}

export default function MemoriesModal({
  isOpen,
  onClose,
  isDarkMode,
  userId,
  githubToken,
}: MemoriesModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !userId || !githubToken) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`backdrop-blur-md rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col ${isDarkMode ? 'bg-gray-800/95 border border-gray-700' : 'bg-white/95 border border-gray-200'}`}>
        <div className={`p-6 border-b flex items-center justify-between ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div>
            <h2 className={`text-xl font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Conversation Memories</h2>
            <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              AI-generated summaries of your past conversations. These help maintain context across chats.
            </p>
          </div>
          <button
            onClick={onClose}
            className={`transition-colors ${isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 flex-1 overflow-y-auto">
          <ConversationMemoriesView
            githubToken={githubToken}
            userId={userId}
            isDarkMode={isDarkMode}
          />
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import ConversationMemoriesView from '../memory/ConversationMemoriesView';
import DocumentUpload from '../documents/DocumentUpload';

interface MemoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  userId: string | null;
  githubToken: string;
  defaultTab?: 'conversations' | 'documents';
}

export default function MemoriesModal({
  isOpen,
  onClose,
  isDarkMode,
  userId,
  githubToken,
  defaultTab = 'conversations',
}: MemoriesModalProps) {
  const [tab, setTab] = useState<'conversations' | 'documents'>(defaultTab);
  const d = isDarkMode;

  useEffect(() => {
    if (isOpen) setTab(defaultTab);
  }, [isOpen, defaultTab]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !userId || !githubToken) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`backdrop-blur-md rounded-lg shadow-xl max-w-3xl w-full max-h-[85dvh] flex flex-col ${d ? 'bg-gray-800/95 border border-gray-700' : 'bg-white/95 border border-gray-200'}`}>
        {/* Header */}
        <div className={`px-6 pt-6 pb-0 border-b ${d ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-xl font-semibold ${d ? 'text-gray-100' : 'text-gray-900'}`}>Memory</h2>
            <button onClick={onClose} className={`transition-colors ${d ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Tabs */}
          <div className="flex gap-1">
            {(['conversations', 'documents'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                  tab === t
                    ? d ? 'border-indigo-500 text-indigo-400' : 'border-indigo-600 text-indigo-600'
                    : d ? 'border-transparent text-gray-400 hover:text-gray-200' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {tab === 'conversations' && (
            <ConversationMemoriesView
              githubToken={githubToken}
              userId={userId}
              isDarkMode={isDarkMode}
            />
          )}
          {tab === 'documents' && (
            <DocumentUpload
              githubToken={githubToken}
              userId={userId}
              isDarkMode={isDarkMode}
            />
          )}
        </div>
      </div>
    </div>
  );
}

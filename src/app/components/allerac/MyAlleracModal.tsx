'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import ConversationMemoriesView from '../memory/ConversationMemoriesView';
import DocumentUpload from '../documents/DocumentUpload';
import ScheduledJobsModal from '../scheduled-jobs/ScheduledJobsModal';

export type MyAlleracTab = 'instructions' | 'memory' | 'tasks';
export type MemorySubTab = 'conversations' | 'documents';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  userId: string | null;
  githubToken: string;
  // instructions props
  systemMessageEdit: string;
  setSystemMessageEdit: (v: string) => void;
  systemMessage: string;
  userName?: string;
  onSaveInstructions: () => Promise<void>;
  // initial tab
  defaultTab?: MyAlleracTab;
  defaultMemoryTab?: MemorySubTab;
}

export default function MyAlleracModal({
  isOpen,
  onClose,
  isDarkMode,
  userId,
  githubToken,
  systemMessageEdit,
  setSystemMessageEdit,
  systemMessage,
  userName,
  onSaveInstructions,
  defaultTab = 'instructions',
  defaultMemoryTab = 'conversations',
}: Props) {
  const t = useTranslations('consciousness');
  const d = isDarkMode;
  const [tab, setTab] = useState<MyAlleracTab>(defaultTab);
  const [memoryTab, setMemoryTab] = useState<MemorySubTab>(defaultMemoryTab);

  useEffect(() => {
    if (isOpen) {
      setTab(defaultTab);
      setMemoryTab(defaultMemoryTab);
      // Pre-fill instructions if empty
      if (defaultTab === 'instructions') {
        if (systemMessage) {
          setSystemMessageEdit(systemMessage);
        } else {
          const firstName = userName?.split(' ')[0] || '';
          const namePrefix = firstName ? `My name is ${firstName}.\n\n` : '';
          setSystemMessageEdit(namePrefix + t('defaultTemplate'));
        }
      }
    }
  }, [isOpen, defaultTab, defaultMemoryTab]);

  useEffect(() => {
    if (tab === 'instructions') {
      if (systemMessage) {
        setSystemMessageEdit(systemMessage);
      } else {
        const firstName = userName?.split(' ')[0] || '';
        const namePrefix = firstName ? `My name is ${firstName}.\n\n` : '';
        setSystemMessageEdit(namePrefix + t('defaultTemplate'));
      }
    }
  }, [tab]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSaveInstructions = async () => {
    await onSaveInstructions();
  };

  const handleCancelInstructions = () => {
    setSystemMessageEdit(systemMessage);
    onClose();
  };

  const tabCls = (active: boolean) =>
    `px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
      active
        ? d ? 'border-indigo-500 text-indigo-400' : 'border-indigo-600 text-indigo-600'
        : d ? 'border-transparent text-gray-400 hover:text-gray-200' : 'border-transparent text-gray-500 hover:text-gray-700'
    }`;

  const subTabCls = (active: boolean) =>
    `px-4 py-1.5 text-xs font-medium rounded-full transition-colors ${
      active
        ? d ? 'bg-indigo-600 text-white' : 'bg-indigo-600 text-white'
        : d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
    }`;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`backdrop-blur-md rounded-xl shadow-xl w-full flex flex-col ${
        tab === 'tasks' ? 'max-w-4xl max-h-[90dvh]' : 'max-w-2xl max-h-[85dvh]'
      } ${d ? 'bg-gray-800/95 border border-gray-700' : 'bg-white/95 border border-gray-200'}`}>

        {/* Header */}
        <div className={`px-6 pt-5 pb-0 border-b ${d ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <img src="/icon-nobg-purple.svg" alt="Allerac" className="w-6 h-6" />
              <h2 className={`text-lg font-semibold ${d ? 'text-gray-100' : 'text-gray-900'}`}>My Allerac</h2>
            </div>
            <button onClick={onClose} className={`transition-colors ${d ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Main tabs */}
          <div className="flex gap-1">
            <button onClick={() => setTab('instructions')} className={tabCls(tab === 'instructions')}>Instructions</button>
            <button onClick={() => setTab('memory')} className={tabCls(tab === 'memory')}>Memory</button>
            <button onClick={() => setTab('tasks')} className={tabCls(tab === 'tasks')}>Tasks</button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Instructions ── */}
          {tab === 'instructions' && (
            <div className="p-6 flex flex-col gap-4 h-full">
              <p className={`text-sm ${d ? 'text-gray-400' : 'text-gray-600'}`}>{t('description')}</p>
              <textarea
                value={systemMessageEdit}
                onChange={e => setSystemMessageEdit(e.target.value)}
                placeholder={t('placeholder')}
                rows={12}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm resize-none ${
                  d ? 'border-gray-600 bg-gray-700 text-gray-100 placeholder-gray-500' : 'border-gray-300 bg-white text-gray-900'
                }`}
              />
              <p className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>{t('privacy')}</p>
              <div className="flex gap-3">
                <button
                  onClick={handleSaveInstructions}
                  disabled={!systemMessageEdit.trim()}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('save')}
                </button>
                <button
                  onClick={handleCancelInstructions}
                  className={`flex-1 px-4 py-2 rounded-md transition-colors ${d ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          )}

          {/* ── Memory ── */}
          {tab === 'memory' && userId && githubToken && (
            <div className="p-6 flex flex-col gap-4">
              {/* Sub-tabs */}
              <div className="flex gap-2">
                <button onClick={() => setMemoryTab('conversations')} className={subTabCls(memoryTab === 'conversations')}>Conversations</button>
                <button onClick={() => setMemoryTab('documents')} className={subTabCls(memoryTab === 'documents')}>Documents</button>
              </div>
              {memoryTab === 'conversations' && (
                <ConversationMemoriesView githubToken={githubToken} userId={userId} isDarkMode={isDarkMode} />
              )}
              {memoryTab === 'documents' && (
                <DocumentUpload githubToken={githubToken} userId={userId} isDarkMode={isDarkMode} />
              )}
            </div>
          )}

          {/* ── Tasks ── */}
          {tab === 'tasks' && (
            <ScheduledJobsModal
              isOpen
              onClose={() => {}}
              isDarkMode={isDarkMode}
              userId={userId}
              inline
            />
          )}

        </div>
      </div>
    </div>
  );
}

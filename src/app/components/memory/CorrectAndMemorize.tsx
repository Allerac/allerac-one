'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import * as memoryActions from '@/app/actions/memory';

interface CorrectAndMemorizeProps {
  isOpen: boolean;
  onClose: () => void;
  llmResponse: string;
  conversationId: string | null;
  userId: string | null;
  githubToken: string;
  isDarkMode: boolean;
}

export default function CorrectAndMemorize({
  isOpen,
  onClose,
  llmResponse,
  conversationId,
  userId,
  githubToken,
  isDarkMode,
}: CorrectAndMemorizeProps) {
  const t = useTranslations('teach');
  const [correction, setCorrection] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [emotion, setEmotion] = useState<-1 | 0 | 1>(0);
  const [importance, setImportance] = useState<'low' | 'medium' | 'high'>('medium');

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCorrection('');
      setResult(null);
      setEmotion(0);
      setImportance('medium');
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!correction.trim() || !userId || !conversationId) return;

    setIsSaving(true);
    try {
      const importanceValue = importance === 'low' ? 1 : importance === 'medium' ? 5 : 10;
      const memoryContent = `User preference: When the AI said "${llmResponse.slice(0, 100)}...", the user corrected: "${correction}" (emotion: ${emotion}, importance: ${importanceValue})`;

      const res = await memoryActions.saveCorrectionMemory(
        conversationId,
        userId,
        memoryContent,
        importanceValue,
        emotion
      );

      if (res.success) {
        setResult({ success: true, message: 'Correction saved to memory! The AI will remember this in future conversations.' });
        setTimeout(() => {
          onClose();
        }, 2500);
      } else {
        throw new Error(res.error);
      }
    } catch (error) {
      setResult({
        success: false,
        message: `Error saving correction: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !conversationId || !userId || !githubToken) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const selectClass = `w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none cursor-pointer ${
    isDarkMode
      ? 'border-gray-600 bg-gray-700 text-gray-100'
      : 'border-gray-300 bg-white text-gray-900'
  }`;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4"
      onClick={handleBackdropClick}
    >
      <div
        className={`backdrop-blur-md shadow-xl w-full sm:max-w-lg sm:rounded-lg rounded-t-2xl overflow-hidden ${
          isDarkMode
            ? 'bg-gray-800/95 border-t sm:border border-gray-700'
            : 'bg-white/95 border-t sm:border border-gray-200'
        }`}
      >
        {/* Mobile drag indicator */}
        <div className="flex justify-center pt-2 sm:hidden">
          <div className={`w-10 h-1 rounded-full ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} />
        </div>

        {/* Header */}
        <div className={`px-4 py-3 sm:p-4 border-b flex items-center justify-between ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <h2 className={`text-base sm:text-lg font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              {t('title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 sm:p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-4">
          {/* AI response preview */}
          <div className={`p-3 rounded-lg ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <p className={`text-xs font-medium mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('aiResponse')}</p>
            <p className={`text-sm leading-relaxed line-clamp-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {llmResponse.slice(0, 200)}{llmResponse.length > 200 ? '…' : ''}
            </p>
          </div>

          {/* Correction input */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('howShouldBe')}
              <span className={`ml-1 font-normal text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('aiWillMemorize')}</span>
            </label>
            <input
              type="text"
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !isSaving && correction.trim()) handleSave(); }}
              placeholder={t('placeholder')}
              disabled={isSaving}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                isDarkMode
                  ? 'border-gray-600 bg-gray-700 text-gray-100 placeholder-gray-500'
                  : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'
              }`}
            />
          </div>

          {/* Dropdowns */}
          <div className="grid grid-cols-2 gap-4">
            {/* Importance */}
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {t('importance')}
              </label>
              <div className="relative">
                <select
                  value={importance}
                  onChange={(e) => setImportance(e.target.value as 'low' | 'medium' | 'high')}
                  disabled={isSaving}
                  className={selectClass}
                >
                  <option value="low">{t('low')}</option>
                  <option value="medium">{t('medium')}</option>
                  <option value="high">{t('high')}</option>
                </select>
                <div className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Emotion */}
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {t('emotion')}
              </label>
              <div className="relative">
                <select
                  value={emotion}
                  onChange={(e) => setEmotion(Number(e.target.value) as -1 | 0 | 1)}
                  disabled={isSaving}
                  className={selectClass}
                >
                  <option value={-1}>{t('frustrated')}</option>
                  <option value={0}>{t('neutral')}</option>
                  <option value={1}>{t('happy')}</option>
                </select>
                <div className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Result message */}
          {result && (
            <div className={`p-3 rounded-lg text-sm ${
              result.success
                ? isDarkMode ? 'bg-green-900/30 text-green-300' : 'bg-green-50 text-green-700'
                : isDarkMode ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'
            }`}>
              {result.message}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={isSaving || !correction.trim()}
              className="flex-1 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {isSaving ? t('saving') : t('saveToMemory')}
            </button>
            <button
              onClick={onClose}
              disabled={isSaving}
              className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                isDarkMode
                  ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

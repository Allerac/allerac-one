'use client';

import { useState } from 'react';
import * as memoryActions from '@/app/actions/memory';

interface CorrectAndMemorizeProps {
  llmResponse: string;
  conversationId: string | null;
  userId: string | null;
  githubToken: string;
  isDarkMode: boolean;
  showInput?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
}

export default function CorrectAndMemorize({
  llmResponse,
  conversationId,
  userId,
  githubToken,
  isDarkMode,
  showInput: showInputProp,
  onOpen,
  onClose
}: CorrectAndMemorizeProps) {
  const [internalShowInput, setInternalShowInput] = useState(false);
  const showInput = showInputProp !== undefined ? showInputProp : internalShowInput;
  const [correction, setCorrection] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [emotion, setEmotion] = useState(0);      // -1 = negative, 0 = neutral, 1 = positive
  const [importance, setImportance] = useState(5); // 1-10 scale: 3 = low, 5 = medium, 8 = high

  const handleSave = async () => {
    if (!correction.trim() || !userId || !conversationId) {
      alert('Please write your correction');
      return;
    }

    setIsSaving(true);

    try {
      // Create memory with user correction and emotion
      const memoryContent = `User preference: When the AI said "${llmResponse.slice(0, 100)}...", the user corrected: "${correction}" (emotion: ${emotion}, importance: ${importance})`;

      const result = await memoryActions.saveCorrectionMemory(
        conversationId,
        userId,
        memoryContent,
        importance,
        emotion
      );

      if (result.success) {
        setResult({
          success: true,
          message: '✓ Correction saved to memory! The AI will remember this in future conversations.'
        });
        setTimeout(() => {
          if (onClose) onClose();
          else setInternalShowInput(false);
          setCorrection('');
          setResult(null);
        }, 3000);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error saving correction:', error);
      setResult({
        success: false,
        message: `Error saving correction: ${error instanceof Error ? error.message : JSON.stringify(error)}`
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!conversationId || !userId || !githubToken) {
    return null;
  }

  return (
    <div className="mt-2">
      {!showInput ? (
        <button
          onClick={() => {
            if (onOpen) onOpen();
            else setInternalShowInput(true);
          }}
          className={`text-xs flex items-center gap-1 ${isDarkMode
              ? 'text-purple-400 hover:text-purple-300'
              : 'text-purple-600 hover:text-purple-800'
            }`}
          title="Correct and save to memory"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Correct & Memorize
        </button>
      ) : (
        <div
          className={`flex flex-col gap-2 p-3 rounded-lg border max-w-full sm:max-w-md mx-auto ${isDarkMode
              ? 'bg-purple-900/20 border-purple-800'
              : 'bg-purple-50 border-purple-200'
            }`}
          style={{ minWidth: 0 }}
        >
          <label className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
            How should it be? (The AI will memorize your preference)
          </label>
          <input
            type="text"
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSaving) {
                handleSave();
              }
            }}
            placeholder="e.g., For me 18°C is warm..."
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 truncate ${isDarkMode
                ? 'border-gray-600 bg-gray-800 text-gray-100'
                : 'border-gray-300 bg-white text-gray-900'
              }`}
            disabled={isSaving}
            autoFocus
            style={{ minWidth: 0 }}
          />
          <div
            className="w-full flex flex-col gap-2 mt-2 sm:flex-row sm:gap-2 sm:justify-end sm:items-center"
          >
            {/* Importance slider (1-10 scale: 3=Low, 5=Med, 8=High) */}
            <div className="flex flex-col items-center px-1 flex-1 min-w-0 sm:items-center sm:justify-center">
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={importance}
                onChange={e => setImportance(Number(e.target.value))}
                className="w-full max-w-[6rem] sm:w-24 accent-purple-500"
                disabled={isSaving}
                title="Importance"
                style={{ maxWidth: '100%' }}
              />
              <div className="flex justify-between w-full text-xs mt-1 select-none">
                <span className={
                  importance <= 3
                    ? (isDarkMode ? 'text-pink-300' : 'text-pink-600')
                    : 'text-gray-400'
                }>Low</span>
                <span className={
                  importance > 3 && importance < 7
                    ? (isDarkMode ? 'text-yellow-200' : 'text-yellow-600')
                    : 'text-gray-400'
                }>Med</span>
                <span className={
                  importance >= 7
                    ? (isDarkMode ? 'text-green-300' : 'text-green-700')
                    : 'text-gray-400'
                }>High</span>
              </div>
            </div>
            {/* Emotion slider */}
            <div className="flex flex-col items-center px-1 flex-1 min-w-0 sm:items-center sm:justify-center">
              <input
                type="range"
                min={-1}
                max={1}
                step={1}
                value={emotion}
                onChange={e => setEmotion(Number(e.target.value))}
                className="w-full max-w-[6rem] sm:w-24 accent-purple-500"
                disabled={isSaving}
                title="Emotion"
                style={{ maxWidth: '100%' }}
              />
              <div className="flex justify-between w-full text-xs mt-1 select-none">
                <span className={emotion === -1 ? (isDarkMode ? 'text-pink-300' : 'text-pink-600') : 'text-gray-400'}>😡</span>
                <span className={emotion === 0 ? (isDarkMode ? 'text-yellow-200' : 'text-yellow-600') : 'text-gray-400'}>😐</span>
                <span className={emotion === 1 ? (isDarkMode ? 'text-green-300' : 'text-green-700') : 'text-gray-400'}>🥰</span>
              </div>
            </div>
            <div className="flex flex-row gap-1 mt-2 sm:mt-0 sm:flex-row sm:gap-1 sm:items-center justify-end">
              <button
                onClick={handleSave}
                disabled={isSaving || !correction.trim()}
                className="w-10 h-10 flex items-center justify-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-transparent border-none shadow-none p-0"
                style={{ boxShadow: 'none', border: 'none' }}
                title="Save"
              >
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </span>
                ) : (
                  <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => {
                  if (onClose) onClose();
                  else setInternalShowInput(false);
                  setCorrection('');
                  setResult(null);
                }}
                disabled={isSaving}
                className={`px-2 py-2 text-sm rounded-lg transition-colors ${isDarkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                  }`}
                style={{ minWidth: 0 }}
              >
                ✕
              </button>
            </div>
          </div>
          {result && (
            <div className={`text-xs mt-1 p-2 rounded ${result.success
                ? isDarkMode
                  ? 'bg-green-900/30 text-green-300'
                  : 'bg-green-100 text-green-800'
                : isDarkMode
                  ? 'bg-red-900/30 text-red-300'
                  : 'bg-red-100 text-red-800'
              }`}>
              {result.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { supabase } from '@/app/clients/supabase';

interface CorrectAndMemorizeProps {
  llmResponse: string;
  conversationId: string | null;
  userId: string | null;
  githubToken: string;
  isDarkMode: boolean;
}

export default function CorrectAndMemorize({ 
  llmResponse, 
  conversationId, 
  userId, 
  githubToken,
  isDarkMode 
}: CorrectAndMemorizeProps) {
  const [showInput, setShowInput] = useState(false);
  const [correction, setCorrection] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSave = async () => {
    if (!correction.trim() || !userId || !conversationId) {
      alert('Please write your correction');
      return;
    }

    setIsSaving(true);

    try {
      // Create memory with user correction
      const memoryContent = `User preference: When the AI said "${llmResponse.slice(0, 100)}...", the user corrected: "${correction}"`;

      // First check if a summary already exists
      const { data: existing } = await supabase
        .from('conversation_summaries')
        .select('id, summary')
        .eq('conversation_id', conversationId)
        .single();

      if (existing) {
        // Append to existing summary
        const updatedSummary = `${existing.summary}\n\n${memoryContent}`;
        const { error } = await supabase
          .from('conversation_summaries')
          .update({
            summary: updatedSummary,
            key_topics: ['preference', 'correction'],
            importance_score: 8
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Create new summary
        const { error } = await supabase
          .from('conversation_summaries')
          .insert({
            user_id: userId,
            conversation_id: conversationId,
            summary: memoryContent,
            key_topics: ['preference', 'correction'],
            importance_score: 8,
            message_count: 1
          });

        if (error) throw error;
      }

      setResult({
        success: true,
        message: '✓ Correction saved to memory! The AI will remember this in future conversations.'
      });

      // Auto-close after 3 seconds
      setTimeout(() => {
        setShowInput(false);
        setCorrection('');
        setResult(null);
      }, 3000);

    } catch (error) {
      console.error('Error saving correction:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      setResult({
        success: false,
        message: `Error saving correction: ${error instanceof Error ? error.message : JSON.stringify(error)}`
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!conversationId || !userId || !githubToken) {
    return null; // Don't show if required context is missing
  }

  return (
    <div className="mt-2">
      {!showInput ? (
        <button
          onClick={() => setShowInput(true)}
          className={`text-xs flex items-center gap-1 ${
            isDarkMode 
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
        <div className={`flex flex-col gap-2 p-3 rounded-lg border ${
          isDarkMode 
            ? 'bg-purple-900/20 border-purple-800' 
            : 'bg-purple-50 border-purple-200'
        }`}>
          <label className={`text-xs font-medium ${
            isDarkMode ? 'text-gray-300' : 'text-gray-700'
          }`}>
            How should it be? (The AI will memorize your preference)
          </label>
          
          <div className="flex gap-2">
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
              className={`flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                isDarkMode 
                  ? 'border-gray-600 bg-gray-800 text-gray-100' 
                  : 'border-gray-300 bg-white text-gray-900'
              }`}
              disabled={isSaving}
              autoFocus
            />
            
            <button
              onClick={handleSave}
              disabled={isSaving || !correction.trim()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 
                       text-white text-sm rounded-lg transition-colors"
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </span>
              ) : (
                '💾'
              )}
            </button>
            
            <button
              onClick={() => {
                setShowInput(false);
                setCorrection('');
                setResult(null);
              }}
              disabled={isSaving}
              className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                isDarkMode 
                  ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
                  : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
              }`}
            >
              ✕
            </button>
          </div>

          {result && (
            <div className={`text-xs mt-1 p-2 rounded ${
              result.success 
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

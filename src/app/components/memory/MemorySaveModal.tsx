'use client';

import { useEffect } from 'react';

interface MemorySaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  isDarkMode: boolean;
  result: {
    success: boolean;
    message: string;
    summary?: string;
    importance?: number;
    topics?: string[];
  } | null;
}

export default function MemorySaveModal({ 
  isOpen, 
  onClose, 
  loading, 
  result,
  isDarkMode 
}: MemorySaveModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, loading]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-2xl ${isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white'}`}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              {loading ? 'Saving to Memory...' : result?.success ? 'Saved Successfully!' : 'Unable to Save'}
            </h2>
            {!loading && (
              <button
                onClick={onClose}
                className={`transition-colors ${isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mb-4"></div>
              <p className={`text-center ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Analyzing conversation and generating memory...
              </p>
            </div>
          )}

          {!loading && result && (
            <div className="space-y-4">
              {result.success ? (
                <>
                  <div className={`flex items-center gap-3 p-4 border rounded-lg ${isDarkMode ? 'bg-green-900/20 border-green-800' : 'bg-green-50 border-green-200'}`}>
                    <svg className={`h-8 w-8 flex-shrink-0 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className={`font-medium ${isDarkMode ? 'text-green-300' : 'text-green-800'}`}>{result.message}</p>
                  </div>

                  {result.importance !== undefined && (
                    <div className={`p-4 border rounded-lg ${isDarkMode ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-200'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Importance Score:</span>
                        <span className="px-3 py-1 bg-blue-600 text-white rounded-lg font-bold">
                          {result.importance}/10
                        </span>
                      </div>
                      <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        This score helps prioritize which memories to recall in future conversations.
                      </p>
                    </div>
                  )}

                  {result.topics && result.topics.length > 0 && (
                    <div className={`p-4 border rounded-lg ${isDarkMode ? 'bg-purple-900/20 border-purple-800' : 'bg-purple-50 border-purple-200'}`}>
                      <h3 className={`font-semibold mb-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Key Topics:</h3>
                      <div className="flex flex-wrap gap-2">
                        {result.topics.map((topic, idx) => (
                          <span
                            key={idx}
                            className="px-3 py-1 bg-purple-600 text-white rounded-lg text-sm"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.summary && (
                    <div className={`p-4 border rounded-lg ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                      <h3 className={`font-semibold mb-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Memory Summary:</h3>
                      <p className={`leading-relaxed ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{result.summary}</p>
                    </div>
                  )}

                  <div className="pt-4">
                    <button
                      onClick={onClose}
                      className="w-full px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className={`flex items-center gap-3 p-4 border rounded-lg ${isDarkMode ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'}`}>
                    <svg className={`h-8 w-8 flex-shrink-0 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className={isDarkMode ? 'text-red-300' : 'text-red-800'}>{result.message}</p>
                  </div>

                  <div className="pt-4">
                    <button
                      onClick={onClose}
                      className={`w-full px-6 py-3 font-semibold rounded-lg transition-colors ${isDarkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-600 text-white hover:bg-gray-700'}`}
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

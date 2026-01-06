'use client';

import { useState, useEffect } from 'react';

interface ConversationMemoriesViewProps {
  supabase: any;
  githubToken: string;
  userId: string;
  isDarkMode: boolean;
}

export default function ConversationMemoriesView({ 
  supabase, 
  githubToken, 
  userId,
  isDarkMode
}: ConversationMemoriesViewProps) {
  const [memories, setMemories] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [memoryToDelete, setMemoryToDelete] = useState<{ id: string; summary: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadMemories();
  }, []);

  const loadMemories = async () => {
    setIsLoading(true);
    try {
      const { ConversationMemoryService } = await import('@/app/services/memory/conversation-memory.service');
      const memoryService = new ConversationMemoryService(supabase, githubToken);
      
      const [summaries, statistics] = await Promise.all([
        memoryService.getRecentSummaries(userId, 10, 1),
        memoryService.getSummaryStats(userId),
      ]);
      
      setMemories(summaries);
      setStats(statistics);
    } catch (error) {
      console.error('Error loading memories:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClick = (memoryId: string, summary: string) => {
    setMemoryToDelete({ id: memoryId, summary });
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!memoryToDelete) return;

    setIsDeleting(true);
    try {
      const { ConversationMemoryService } = await import('@/app/services/memory/conversation-memory.service');
      const memoryService = new ConversationMemoryService(supabase, githubToken);
      await memoryService.deleteSummary(memoryToDelete.id);
      await loadMemories();
      setDeleteConfirmOpen(false);
      setMemoryToDelete(null);
    } catch (error) {
      console.error('Error deleting memory:', error);
      alert('Failed to delete memory');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <div className="text-center text-gray-500 py-8">Loading memories...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      {stats && (
        <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-blue-200'} border rounded-lg p-4`}>
          <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-blue-900'} mb-2`}>Memory Statistics</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className={`${isDarkMode ? 'text-blue-400' : 'text-blue-600'} font-medium`}>{stats.totalSummaries}</p>
              <p className={isDarkMode ? 'text-gray-400' : 'text-blue-700'}>Conversations</p>
            </div>
            <div>
              <p className={`${isDarkMode ? 'text-blue-400' : 'text-blue-600'} font-medium`}>{stats.totalMessages}</p>
              <p className={isDarkMode ? 'text-gray-400' : 'text-blue-700'}>Messages</p>
            </div>
            <div>
              <p className={`${isDarkMode ? 'text-blue-400' : 'text-blue-600'} font-medium`}>{stats.averageImportance}/10</p>
              <p className={isDarkMode ? 'text-gray-400' : 'text-blue-700'}>Avg Importance</p>
            </div>
          </div>
        </div>
      )}

      {/* Memories List */}
      {memories.length === 0 ? (
        <div className={`text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} py-8`}>
          <p>No conversation memories yet.</p>
          <p className="text-sm mt-2">Have at least 4 messages in a conversation, then switch to a new one to create a summary.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {memories.map((memory) => (
            <div
              key={memory.id}
              className={`${isDarkMode ? 'border-gray-700 hover:border-gray-600' : 'border-gray-200 hover:border-blue-300'} border rounded-lg p-4 transition-colors`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {new Date(memory.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    <span className={`text-xs px-2 py-0.5 ${isDarkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-700'} rounded`}>
                      Importance: {memory.importance_score}/10
                    </span>
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {memory.message_count} messages
                    </span>
                  </div>
                  <p className={`text-sm ${isDarkMode ? 'text-gray-100' : 'text-gray-900'} mb-2`}>{memory.summary}</p>
                  {memory.key_topics && memory.key_topics.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {memory.key_topics.map((topic: string, idx: number) => (
                        <span
                          key={idx}
                          className={`text-xs px-2 py-0.5 ${isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'} rounded`}
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteClick(memory.id, memory.summary)}
                  className="text-gray-400 hover:text-red-600 transition-colors"
                  title="Delete memory"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && memoryToDelete && (
        <div className={`fixed inset-0 ${isDarkMode ? 'bg-black/50' : 'bg-black/30'} backdrop-blur-sm flex items-center justify-center z-50 p-4`}>
          <div className={`${isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white'} rounded-lg max-w-lg w-full shadow-2xl`}>
            <div className="p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'} mb-2`}>
                    Delete Memory?
                  </h3>
                  <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'} mb-3`}>
                    Are you sure you want to delete this memory? This action cannot be undone.
                  </p>
                  <div className={`p-3 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'} border rounded-lg`}>
                    <p className={`text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-700'} line-clamp-3`}>
                      {memoryToDelete.summary}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setDeleteConfirmOpen(false);
                    setMemoryToDelete(null);
                  }}
                  disabled={isDeleting}
                  className={`px-4 py-2 ${isDarkMode ? 'text-gray-200 bg-gray-700 hover:bg-gray-600' : 'text-gray-700 bg-gray-100 hover:bg-gray-200'} rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>Delete</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

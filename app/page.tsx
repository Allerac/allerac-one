'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/app/clients/supabase';
import { Message, Conversation, MemorySaveResult, Model } from './types';
import { MODELS } from './services/llm/models';
import { TOOLS } from './tools/tools';
import { ChatSupabaseService } from './services/database/supabase.service';
import { ChatMessageService } from './services/chat/chat-message.service';
import { MemorySummaryService } from './services/memory/memory-summary.service';
import CorrectAndMemorize from './components/memory/CorrectAndMemorize';
import SidebarMobile from './components/layout/SidebarMobile';
import SidebarDesktop from './components/layout/SidebarDesktop';
import ChatHeader from './components/chat/ChatHeader';
import ChatMessages from './components/chat/ChatMessages';
import ChatInput from './components/chat/ChatInput';
import MemorySaveModal from './components/memory/MemorySaveModal';
import ConversationMemoriesView from './components/memory/ConversationMemoriesView';
import TokenConfiguration from './components/settings/TokenConfiguration';
import MemorySettingsModal from './components/memory/MemorySettingsModal';
import DocumentsModal from './components/documents/DocumentsModal';
import MemoriesModal from './components/memory/MemoriesModal';
import UserSettingsModal from './components/auth/UserSettingsModal';
import LoginModal from './components/auth/LoginModal';

export default function AdminChat() {
  // Modal/event listeners for sidebar configuration actions
  useEffect(() => {
    const openTokenModal = () => setIsTokenModalOpen(true);
    const openMemorySettingsModal = () => setIsEditingSettings(true);
    const openUserSettingsModal = () => setIsUserSettingsOpen(true);
    const openDocumentsModal = () => setIsDocumentModalOpen(true);
    const openMemoriesModal = () => setIsMemoryModalOpen(true);
    const handleLogout = () => {
      // Clear session and reload
      supabase.auth.signOut().then(() => window.location.reload());
    };
    window.addEventListener('openTokenModal', openTokenModal);
    window.addEventListener('openMemorySettingsModal', openMemorySettingsModal);
    window.addEventListener('openUserSettingsModal', openUserSettingsModal);
    window.addEventListener('openDocumentsModal', openDocumentsModal);
    window.addEventListener('openMemoriesModal', openMemoriesModal);
    window.addEventListener('logout', handleLogout);
    return () => {
      window.removeEventListener('openTokenModal', openTokenModal);
      window.removeEventListener('openMemorySettingsModal', openMemorySettingsModal);
      window.removeEventListener('openUserSettingsModal', openUserSettingsModal);
      window.removeEventListener('openDocumentsModal', openDocumentsModal);
      window.removeEventListener('openMemoriesModal', openMemoriesModal);
      window.removeEventListener('logout', handleLogout);
    };
  }, []);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [tavilyApiKey, setTavilyApiKey] = useState('');
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [tavilyKeyInput, setTavilyKeyInput] = useState('');
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState('deepseek-r1:8b');
  const [systemMessage, setSystemMessage] = useState('');
  const [systemMessageEdit, setSystemMessageEdit] = useState('');
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isUserSettingsOpen, setIsUserSettingsOpen] = useState(false);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [isMemorySaveModalOpen, setIsMemorySaveModalOpen] = useState(false);
  const [memorySaveLoading, setMemorySaveLoading] = useState(false);
  const [currentConversationHasMemory, setCurrentConversationHasMemory] = useState(false);
  const [memorySaveResult, setMemorySaveResult] = useState<MemorySaveResult | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize services
  const chatService = new ChatSupabaseService(supabase);
  const chatMessageService = new ChatMessageService({
    supabase,
    githubToken,
    tavilyApiKey,
    userId,
    selectedModel,
    systemMessage,
    currentConversationId,
    setCurrentConversationId,
    messages,
    setMessages,
    MODELS,
    TOOLS,
    onConversationCreated: () => {
      if (userId) loadConversations(userId);
    },
  });

  useEffect(() => {
    checkAuth();
    const savedTheme = localStorage.getItem('chatTheme');
    if (savedTheme) {
      setIsDarkMode(savedTheme === 'dark');
    }
  }, []);

  // Load system message when userId becomes available
  useEffect(() => {
    if (userId) {
      loadSystemMessage();
    }
  }, [userId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        setIsAuthenticated(true);
        setUserId(session.user.id);
        
        // Extract user name and email
        const email = session.user.email || '';
        setUserEmail(email);
        const name = session.user.user_metadata?.full_name || email.split('@')[0];
        setUserName(name);
        
        // Load API keys from localStorage first, then fallback to environment
        const savedToken = localStorage.getItem('github_token') || process.env.NEXT_PUBLIC_GITHUB_TOKEN || '';
        const savedTavilyKey = localStorage.getItem('tavily_api_key') || process.env.NEXT_PUBLIC_TAVILY_API_KEY || '';
        
        setGithubToken(savedToken);
        setTavilyApiKey(savedTavilyKey);
        
        // Show token modal if no GitHub token is configured
        if (!savedToken) {
          setIsTokenModalOpen(true);
        }
        
        // Load conversations and system message
        await loadConversations(session.user.id);
        // Don't load system message here - will be loaded by useEffect when userId is set
      } else {
        setIsAuthenticated(false);
        setIsLoginModalOpen(true);
      }
    } catch (error) {
      console.error('Auth error:', error);
      setIsAuthenticated(false);
      setIsLoginModalOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    localStorage.setItem('chatTheme', newTheme ? 'dark' : 'light');
  };

  const loadSystemMessage = async () => {
    if (!userId) return;
    
    const message = await chatService.loadSystemMessage(userId);
    setSystemMessage(message);
    setSystemMessageEdit(message);
  };

  const saveSystemMessage = async () => {
    if (!userId) return;

    const result = await chatService.saveSystemMessage(userId, systemMessageEdit);
    
    if (result.success) {
      setSystemMessage(systemMessageEdit);
      setIsEditingSettings(false);
      // Reload from database to ensure sync
      await loadSystemMessage();
      alert('Settings saved successfully!');
    } else {
      console.error('Error saving system message:', result.error);
      alert('Error saving settings');
    }
  };

  const loadConversations = async (uid: string) => {
    const data = await chatService.loadConversations(uid);
    setConversations(data);
  };

  const loadConversation = async (conversationId: string) => {
    // Before loading new conversation, try to summarize the current one
    if (currentConversationId && currentConversationId !== conversationId && githubToken && userId) {
      console.log(`[Memory] Switching from conversation ${currentConversationId} to ${conversationId}`);
      try {
        const { ConversationMemoryService } = await import('@/app/services/memory/conversation-memory.service');
        const memoryService = new ConversationMemoryService(supabase, githubToken);
        
        // Check if current conversation should be summarized
        const shouldSummarize = await memoryService.shouldSummarizeConversation(currentConversationId);
        console.log(`[Memory] Should summarize ${currentConversationId}:`, shouldSummarize);
        
        if (shouldSummarize) {
          console.log(`[Memory] Generating summary for conversation ${currentConversationId}...`);
          // Generate summary in background (don't wait for it)
          memoryService.generateConversationSummary(currentConversationId, userId)
            .then(summary => console.log('[Memory] Summary generated:', summary))
            .catch(err => console.error('[Memory] Failed to generate summary:', err));
        }
      } catch (error) {
        console.error('[Memory] Error in summary generation:', error);
      }
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading conversation:', error);
      return;
    }

    const loadedMessages = data?.map(msg => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
      timestamp: new Date(msg.created_at),
    })) || [];

    setMessages(loadedMessages);
    setCurrentConversationId(conversationId);

    // Check if this conversation already has a memory
    const { data: existingMemory } = await supabase
      .from('conversation_summaries')
      .select('id')
      .eq('conversation_id', conversationId)
      .single();
    
    setCurrentConversationHasMemory(!!existingMemory);
  };

  const handleGenerateSummary = async () => {
    // Open modal and show loading
    setIsMemorySaveModalOpen(true);
    setMemorySaveLoading(true);
    setMemorySaveResult(null);

    try {
      const memorySummaryService = new MemorySummaryService(supabase, githubToken);
      const result = await memorySummaryService.generateAndSaveSummary(
        currentConversationId!,
        userId!,
        messages
      );
      
      setMemorySaveResult(result);
      
      // Update conversation memory flag if successful
      if (result.success) {
        setCurrentConversationHasMemory(true);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setMemorySaveResult({
        success: false,
        message: 'An unexpected error occurred'
      });
    } finally {
      setMemorySaveLoading(false);
    }
  };

  const handleLogin = async (email: string, password: string) => {
    if (!email || !password) {
      throw new Error('Please fill in email and password.');
    }
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) throw error;
    
    if (data.user) {
      setIsAuthenticated(true);
      setUserId(data.user.id);
      setIsLoginModalOpen(false);
      
      // Load API keys and conversations
      const savedToken = localStorage.getItem('github_token') || process.env.NEXT_PUBLIC_GITHUB_TOKEN || '';
      const savedTavilyKey = localStorage.getItem('tavily_api_key') || process.env.NEXT_PUBLIC_TAVILY_API_KEY || '';
      
      setGithubToken(savedToken);
      setTavilyApiKey(savedTavilyKey);
      
      if (!savedToken) {
        setIsTokenModalOpen(true);
      }
      
      await loadConversations(data.user.id);
      // System message will be loaded by useEffect when userId is set
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setIsAuthenticated(false);
      setUserId(null);
      setMessages([]);
      setConversations([]);
      setCurrentConversationId(null);
      setIsLoginModalOpen(true);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleSaveToken = async () => {
    if (!userId) return;
    
    const newGithubToken = tokenInput.trim();
    const newTavilyKey = tavilyKeyInput.trim();
    
    if (!newGithubToken && !newTavilyKey) return;
    
    try {
      // Save to localStorage
      if (newGithubToken) {
        localStorage.setItem('github_token', newGithubToken);
        setGithubToken(newGithubToken);
        setTokenInput('');
      }
      if (newTavilyKey) {
        localStorage.setItem('tavily_api_key', newTavilyKey);
        setTavilyApiKey(newTavilyKey);
        setTavilyKeyInput('');
      }
      setIsTokenModalOpen(false);
    } catch (error) {
      console.error('Error saving API keys:', error);
      alert('Error saving keys. Please try again.');
    }
  };

  const handleSendMessage = async () => {
    if (isSending) return;
    setIsSending(true);
    try {
      await chatMessageService.sendMessage(inputMessage);
      setInputMessage('');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setCurrentConversationId(null);
  };

  const deleteConversation = async (conversationId: string) => {
    const result = await chatService.deleteConversation(conversationId);

    if (!result.success) {
      return;
    }

    if (currentConversationId === conversationId) {
      clearChat();
    }

    if (userId) await loadConversations(userId);
  };

  if (isLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        isDarkMode={isDarkMode}
        onLogin={handleLogin}
      />

      {!isAuthenticated ? null : (
      <>
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar + Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile Sidebar (< lg breakpoint) */}
        <div className="lg:hidden">
          <SidebarMobile
            isSidebarOpen={isSidebarOpen}
            isDarkMode={isDarkMode}
            toggleTheme={toggleTheme}
            clearChat={clearChat}
            conversations={conversations}
            currentConversationId={currentConversationId}
            loadConversation={loadConversation}
            deleteConversation={deleteConversation}
            MODELS={MODELS}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            setIsTokenModalOpen={setIsTokenModalOpen}
            setSystemMessageEdit={setSystemMessageEdit}
            systemMessage={systemMessage}
            setIsEditingSettings={setIsEditingSettings}
            setIsDocumentModalOpen={setIsDocumentModalOpen}
            setIsMemoryModalOpen={setIsMemoryModalOpen}
            setIsUserSettingsOpen={setIsUserSettingsOpen}
            handleLogout={handleLogout}
          />
        </div>

        {/* Desktop Sidebar (>= lg breakpoint) */}
        <div className="hidden lg:block">
          <SidebarDesktop
            isSidebarCollapsed={isSidebarCollapsed}
            setIsSidebarCollapsed={setIsSidebarCollapsed}
            isDarkMode={isDarkMode}
            toggleTheme={toggleTheme}
            clearChat={clearChat}
            conversations={conversations}
            currentConversationId={currentConversationId}
            loadConversation={loadConversation}
            deleteConversation={deleteConversation}
            MODELS={MODELS}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            setIsTokenModalOpen={setIsTokenModalOpen}
            setSystemMessageEdit={setSystemMessageEdit}
            systemMessage={systemMessage}
            setIsEditingSettings={setIsEditingSettings}
            setIsDocumentModalOpen={setIsDocumentModalOpen}
            setIsMemoryModalOpen={setIsMemoryModalOpen}
            setIsUserSettingsOpen={setIsUserSettingsOpen}
            handleLogout={handleLogout}
          />
        </div>

        {/* Main Chat Area */}
        <div className={`flex-1 flex flex-col ${
          isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'
        }`}>
          {/* Header */}
          <ChatHeader
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
            isDarkMode={isDarkMode}
            selectedModel={selectedModel}
            MODELS={MODELS}
            currentConversationId={currentConversationId}
            currentConversationHasMemory={currentConversationHasMemory}
            handleGenerateSummary={handleGenerateSummary}
          />

          {/* Messages Container */}
          <div className={`flex-1 overflow-y-auto ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
            {messages.length === 0 ? (
              /* Empty State - Gemini Style */
              <div className="h-full flex flex-col items-center justify-center px-4">
                <div className="w-full max-w-2xl">
                  <div className="text-center mb-12">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-6">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                    </div>
                    <h3 className={`text-2xl font-semibold mb-8 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>How can I help you today?</h3>
                    
                    {/* Input Box in Empty State */}
                    <div className="mt-8">
                      <ChatInput
                        inputMessage={inputMessage}
                        setInputMessage={setInputMessage}
                        handleKeyPress={handleKeyPress}
                        handleSendMessage={handleSendMessage}
                        isSending={isSending}
                        githubToken={githubToken}
                        isDarkMode={isDarkMode}
                        setIsDocumentModalOpen={setIsDocumentModalOpen}
                        placeholder="Ask me anything..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Messages View */
              <ChatMessages
                messages={messages}
                isSending={isSending}
                selectedModel={selectedModel}
                MODELS={MODELS}
                isDarkMode={isDarkMode}
                currentConversationId={currentConversationId}
                userId={userId}
                githubToken={githubToken}
                messagesEndRef={messagesEndRef}
              />
            )}
          </div>

          {/* Input Area - Only show when there are messages */}
          {messages.length > 0 && (
          <div className={`border-t ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
            <div className="max-w-3xl mx-auto px-4 py-4">
              {!githubToken && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">
                    ⚠️ Please configure your GitHub token in Settings to start chatting
                  </p>
                </div>
              )}
              <ChatInput
                inputMessage={inputMessage}
                setInputMessage={setInputMessage}
                handleKeyPress={handleKeyPress}
                handleSendMessage={handleSendMessage}
                isSending={isSending}
                githubToken={githubToken}
                isDarkMode={isDarkMode}
                setIsDocumentModalOpen={setIsDocumentModalOpen}
              />
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Token Configuration Modal */}
      <TokenConfiguration
        isOpen={isTokenModalOpen}
        onClose={() => {
          setIsTokenModalOpen(false);
          setTokenInput('');
          setTavilyKeyInput('');
        }}
        isDarkMode={isDarkMode}
        githubToken={githubToken}
        tavilyApiKey={tavilyApiKey}
        tokenInput={tokenInput}
        setTokenInput={setTokenInput}
        tavilyKeyInput={tavilyKeyInput}
        setTavilyKeyInput={setTavilyKeyInput}
        onSave={handleSaveToken}
      />

      {/* Memory Settings Modal */}
      <MemorySettingsModal
        isOpen={isEditingSettings}
        onClose={() => setIsEditingSettings(false)}
        isDarkMode={isDarkMode}
        systemMessageEdit={systemMessageEdit}
        setSystemMessageEdit={setSystemMessageEdit}
        systemMessage={systemMessage}
        onSave={saveSystemMessage}
      />

      {/* Documents Modal */}
      <DocumentsModal
        isOpen={isDocumentModalOpen}
        onClose={() => setIsDocumentModalOpen(false)}
        isDarkMode={isDarkMode}
        userId={userId}
        githubToken={githubToken}
      />

      {/* Memories Modal */}
      <MemoriesModal
        isOpen={isMemoryModalOpen}
        onClose={() => setIsMemoryModalOpen(false)}
        isDarkMode={isDarkMode}
        userId={userId}
        githubToken={githubToken}
        supabase={supabase}
      />

      {/* Memory Save Modal */}
      <MemorySaveModal
        isOpen={isMemorySaveModalOpen}
        onClose={() => {
          setIsMemorySaveModalOpen(false);
          setMemorySaveResult(null);
        }}
        loading={memorySaveLoading}
        result={memorySaveResult}
        isDarkMode={isDarkMode}
      />

      {/* User Settings Modal */}
      <UserSettingsModal
        isOpen={isUserSettingsOpen}
        onClose={() => setIsUserSettingsOpen(false)}
        isDarkMode={isDarkMode}
        userName={userName}
        userEmail={userEmail}
        userId={userId}
      />
      </>
      )}
    </div>
  );
}

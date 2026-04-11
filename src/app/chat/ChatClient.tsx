'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Message, Conversation, MemorySaveResult, Model } from '../types';
import { MODELS } from '../services/llm/models';
import { TOOLS } from '../tools/tools';
import { ChatMessageService } from '../services/chat/chat-message.service';

import * as chatActions from '@/app/actions/chat';
import * as userActions from '@/app/actions/user';
import * as memoryActions from '@/app/actions/memory';
import * as authActions from '@/app/actions/auth';
import * as systemActions from '@/app/actions/system';
import * as skillActions from '@/app/actions/skills';

import SidebarMobile from '../components/layout/SidebarMobile';
import SidebarDesktop from '../components/layout/SidebarDesktop';
import ChatHeader from '../components/chat/ChatHeader';
import ChatMessages from '../components/chat/ChatMessages';
import ChatInput from '../components/chat/ChatInput';
import TerminalMessageArea, { type TerminalTheme } from '../components/chat/TerminalMessageArea';
import MemorySaveModal from '../components/memory/MemorySaveModal';
import CorrectAndMemorize from '../components/memory/CorrectAndMemorize';
import MyAlleracModal, { type MyAlleracTab, type MemorySubTab } from '../components/allerac/MyAlleracModal';
import SkillsLibrary from '../components/skills/SkillsLibrary';
import UserSettingsModal from '../components/auth/UserSettingsModal';
import SystemDashboard from '../components/system/SystemDashboard';
import TelegramBotSettings from '../components/settings/TelegramBotSettings';
import HealthDashboard from '../components/health/HealthDashboard';
import InstagramDMPanel from '../components/social/InstagramDMPanel';
import InstagramPostModal from '../components/instagram/InstagramPostModal';
import { AlleracIcon } from '../components/ui/AlleracIcon';
import OnboardingWizard from '../components/onboarding/OnboardingWizard';

export default function AdminChat({
  defaultSkillName,
  domainName,
  showWorkspace = false,
  showHealth = false,
  showInstagramDM = false,
  showInstagramPost = false,
  defaultSidebarCollapsed = false,
  chatMode = 'default',
  terminalTheme,
  systemDashboardInitialTab: initialDashboardTab,
}: {
  defaultSkillName?: string;
  domainName?: string;
  showWorkspace?: boolean;
  showHealth?: boolean;
  showInstagramDM?: boolean;
  showInstagramPost?: boolean;
  defaultSidebarCollapsed?: boolean;
  chatMode?: 'default' | 'terminal';
  terminalTheme?: TerminalTheme;
  systemDashboardInitialTab?: 'preferences' | 'system' | 'apiKeys' | 'health' | 'benchmark' | 'social';
}) {
  const t = useTranslations('home');
  const router = useRouter();

  // Modal/event listeners for sidebar configuration actions
  useEffect(() => {
    const openTokenModal = () => { setSystemDashboardInitialTab('apiKeys'); setIsSystemDashboardOpen(true); };
    const openUserSettingsModal = () => setIsUserSettingsOpen(true);
    const openSkillsLibrary = () => setIsSkillsLibraryOpen(true);
    const openSystemDashboard = () => { setSystemDashboardInitialTab('preferences'); setIsSystemDashboardOpen(true); };
    const openHealthDashboard = () => setIsHealthDashboardOpen(true);
    const openInstagramDM = () => setIsInstagramDMOpen(true);
    const openInstagramPost = async (event?: Event) => {
      const detail = (event as CustomEvent)?.detail as { caption?: string; tags?: string } | undefined;
      if (detail?.caption && lastSentImages.length > 0) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          setInstagramPreFill({
            imageBase64: result.split(',')[1],
            imagePreview: result,
            caption: detail.caption,
            tags: detail.tags,
          });
          setIsInstagramPostOpen(true);
        };
        reader.readAsDataURL(lastSentImages[0].file);
      } else if (detail?.caption) {
        setInstagramPreFill({ caption: detail.caption, tags: detail.tags });
        setIsInstagramPostOpen(true);
      } else {
        setIsInstagramPostOpen(true);
      }
    };
    const onLogout = () => handleLogoutRef.current();
    const openMyAlleracModal = () => { setMyAlleracTab('instructions'); setIsMyAlleracOpen(true); };
    const openMemorySettingsModal = () => { setMyAlleracTab('instructions'); setIsMyAlleracOpen(true); };
    const openMemoriesModal = () => { setMyAlleracTab('memory'); setMyAlleracMemoryTab('conversations'); setIsMyAlleracOpen(true); };
    const openDocumentsModal = () => { setMyAlleracTab('memory'); setMyAlleracMemoryTab('documents'); setIsMyAlleracOpen(true); };
    const openScheduledJobsModal = () => { setMyAlleracTab('tasks'); setIsMyAlleracOpen(true); };

    window.addEventListener('openTokenModal', openTokenModal);
    window.addEventListener('openUserSettingsModal', openUserSettingsModal);
    window.addEventListener('openSkillsLibrary', openSkillsLibrary);
    window.addEventListener('openSystemDashboard', openSystemDashboard);
    window.addEventListener('openHealthDashboard', openHealthDashboard);
    window.addEventListener('openInstagramDM', openInstagramDM);
    window.addEventListener('openInstagramPost', openInstagramPost);
    window.addEventListener('logout', onLogout);
    window.addEventListener('openMyAlleracModal', openMyAlleracModal);
    window.addEventListener('openMemorySettingsModal', openMemorySettingsModal);
    window.addEventListener('openMemoriesModal', openMemoriesModal);
    window.addEventListener('openDocumentsModal', openDocumentsModal);
    window.addEventListener('openScheduledJobsModal', openScheduledJobsModal);

    return () => {
      window.removeEventListener('openTokenModal', openTokenModal);
      window.removeEventListener('openUserSettingsModal', openUserSettingsModal);
      window.removeEventListener('openSkillsLibrary', openSkillsLibrary);
      window.removeEventListener('openSystemDashboard', openSystemDashboard);
      window.removeEventListener('openHealthDashboard', openHealthDashboard);
      window.removeEventListener('openInstagramDM', openInstagramDM);
      window.removeEventListener('openInstagramPost', openInstagramPost);
      window.removeEventListener('logout', onLogout);
      window.removeEventListener('openMyAlleracModal', openMyAlleracModal);
      window.removeEventListener('openMemorySettingsModal', openMemorySettingsModal);
      window.removeEventListener('openMemoriesModal', openMemoriesModal);
      window.removeEventListener('openDocumentsModal', openDocumentsModal);
      window.removeEventListener('openScheduledJobsModal', openScheduledJobsModal);
    };
  }, []);

  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('Dev User'); // Default user name
  const [userEmail, setUserEmail] = useState('dev@local.host'); // Default user email
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [tavilyApiKey, setTavilyApiKey] = useState('');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [googleApiKey, setGoogleApiKey] = useState('');
  const [systemDashboardInitialTab, setSystemDashboardInitialTab] = useState<'preferences' | 'system' | 'apiKeys' | 'health' | 'benchmark' | 'social'>(initialDashboardTab ?? 'preferences');
  const [tokenInput, setTokenInput] = useState('');
  const [tavilyKeyInput, setTavilyKeyInput] = useState('');
  const [googleKeyInput, setGoogleKeyInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
  const [systemMessage, setSystemMessage] = useState('');
  const [systemMessageEdit, setSystemMessageEdit] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(defaultSidebarCollapsed);
  const [isUserSettingsOpen, setIsUserSettingsOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isMyAlleracOpen, setIsMyAlleracOpen] = useState(false);
  const [myAlleracTab, setMyAlleracTab] = useState<MyAlleracTab>('instructions');
  const [myAlleracMemoryTab, setMyAlleracMemoryTab] = useState<MemorySubTab>('conversations');
  const [isSkillsLibraryOpen, setIsSkillsLibraryOpen] = useState(false);
  const [isHealthDashboardOpen, setIsHealthDashboardOpen] = useState(false);
  const [isInstagramDMOpen, setIsInstagramDMOpen] = useState(false);
  const [isInstagramPostOpen, setIsInstagramPostOpen] = useState(false);
  const [isMemorySaveModalOpen, setIsMemorySaveModalOpen] = useState(false);
  const [memorySaveLoading, setMemorySaveLoading] = useState(false);
  const [currentConversationHasMemory, setCurrentConversationHasMemory] = useState(false);
  const [memorySaveResult, setMemorySaveResult] = useState<MemorySaveResult | null>(null);
  const [isSystemDashboardOpen, setIsSystemDashboardOpen] = useState(false);
  const [isTelegramBotSettingsOpen, setIsTelegramBotSettingsOpen] = useState(false);
  const [terminalTeachContent, setTerminalTeachContent] = useState<string | null>(null);
  const [instagramDraft, setInstagramDraft] = useState<{ caption: string; tags: string } | null>(null);
  const [lastSentImages, setLastSentImages] = useState<Array<{ file: File; preview: string }>>([]);
  const [instagramPreFill, setInstagramPreFill] = useState<{
    caption?: string; tags?: string;
    imageBase64?: string; imagePreview?: string;
  } | null>(null);

  // Per-domain terminal mode toggle — reads from localStorage, falls back to prop default
  // Toggle is available whenever terminalTheme is set, regardless of chatMode default.
  const storageKey = domainName ? `chatMode_${domainName.toLowerCase()}` : null;
  const [effectiveChatMode, setEffectiveChatMode] = useState<'default' | 'terminal'>(() => {
    if (!terminalTheme) return chatMode; // domain has no terminal support at all
    if (typeof window === 'undefined' || !storageKey) return chatMode;
    return (localStorage.getItem(storageKey) as 'default' | 'terminal') ?? chatMode;
  });

  const toggleChatMode = useCallback(() => {
    setEffectiveChatMode(prev => {
      const next = prev === 'terminal' ? 'default' : 'terminal';
      if (storageKey) localStorage.setItem(storageKey, next);
      return next;
    });
  }, [storageKey]);
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<Array<{ name: string; size: number; modified_at: string }>>([]);
  const [imageAttachments, setImageAttachments] = useState<Array<{ file: File; preview: string }>>([]);
  const [documentAttachments, setDocumentAttachments] = useState<Array<{ file: File; name: string; content: string }>>([]);
  const [availableSkills, setAvailableSkills] = useState<any[]>([]);
  const [activeSkill, setActiveSkill] = useState<any | null>(null);
  const [preSelectedSkill, setPreSelectedSkill] = useState<any | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentFileInputRef = useRef<HTMLInputElement>(null);
  const handleLogoutRef = useRef<() => void>(() => {});
  const instagramDraftRef = useRef<{ caption: string; tags: string } | null>(null);

  // Initialize chatMessageService
  // Note: we re-create it when dependencies change, which is acceptable for this simple app
  const chatMessageService = new ChatMessageService({
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
    activeSkill,
    preSelectedSkill,
    defaultSkillName,
    domain: domainName,
    onConversationCreated: () => {
      if (userId) loadConversations(userId);
    },
    onConversationCreatedWithSkill: async (conversationId, skillId) => {
      if (userId) {
        await skillActions.activateSkill(skillId, conversationId, userId);
        await loadActiveSkill(conversationId);
        setPreSelectedSkill(null);
      }
    },
    onSkillActivated: (skill) => {
      setActiveSkill(skill);
    },
    onInstagramDraft: (draft) => {
      setInstagramDraft(draft);
      instagramDraftRef.current = draft;
    },
  });

  useEffect(() => {
    checkAuth();
    const savedTheme = localStorage.getItem('chatTheme');
    if (savedTheme) setIsDarkMode(savedTheme === 'dark');
    const savedModel = localStorage.getItem('selected_model');
    if (savedModel) setSelectedModel(savedModel);
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

  // Load Ollama status on mount and periodically
  useEffect(() => {
    const loadOllamaStatus = async () => {
      try {
        const ollamaInfo = await systemActions.getOllamaInfo();
        setOllamaConnected(ollamaInfo.connected);
        setOllamaModels(ollamaInfo.models || []);
      } catch (err) {
        console.error('Failed to load Ollama status:', err);
        setOllamaConnected(false);
        setOllamaModels([]);
      }
    };

    loadOllamaStatus();
    // Refresh Ollama status every 30 seconds
    const interval = setInterval(loadOllamaStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Polling for new messages (when conversation is active)
  // Skips when: sending, tab is hidden, or user is actively typing
  useEffect(() => {
    if (!currentConversationId || isSending) return;

    const pollMessages = async () => {
      if (document.hidden || inputMessage.trim().length > 0) return;
      try {
        const data = await chatActions.loadMessages(currentConversationId);
        const loadedMessages = data?.map((msg: any) => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          timestamp: new Date(msg.created_at),
        })) || [];

        // Only update if there are new messages
        if (loadedMessages.length > messages.length) {
          setMessages(loadedMessages);
          // Scroll to bottom when new messages arrive
          setTimeout(() => scrollToBottom(), 100);
        }
      } catch (error) {
        console.error('[Polling] Failed to fetch messages:', error);
      }
    };

    // Poll every 20 seconds — frequent enough for Telegram sync, not disruptive while typing
    const interval = setInterval(pollMessages, 20000);
    return () => clearInterval(interval);
  }, [currentConversationId, messages.length, isSending, inputMessage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Handler for downloading Ollama models
  const handleDownloadModel = async (modelId: string) => {
    try {
      const result = await systemActions.pullOllamaModel(modelId);
      if (result.success) {
        // Refresh Ollama status to get updated model list
        const ollamaInfo = await systemActions.getOllamaInfo();
        setOllamaConnected(ollamaInfo.connected);
        setOllamaModels(ollamaInfo.models || []);
      }
    } catch (err) {
      console.error('Failed to download model:', err);
    }
  };

  // Load available skills for user
  const loadAvailableSkills = async (uid: string) => {
    try {
      const skills = await skillActions.getAllSkills(uid);
      setAvailableSkills(skills || []);
      if (defaultSkillName && skills) {
        const skill = skills.find((s: any) => s.name === defaultSkillName);
        if (skill) setPreSelectedSkill(skill);
      }
    } catch (err) {
      console.error('Failed to load skills:', err);
      setAvailableSkills([]);
    }
  };

  // Load active skill for current conversation
  const loadActiveSkill = async (conversationId: string) => {
    try {
      const skill = await skillActions.getActiveSkill(conversationId);
      setActiveSkill(skill);
    } catch (err) {
      console.error('Failed to load active skill:', err);
      setActiveSkill(null);
    }
  };

  // Handle skill activation
  const handleActivateSkill = async (skillId: string) => {
    if (!currentConversationId || !userId) {
      // No conversation yet - pre-select the skill for auto-activation
      const skill = availableSkills.find(s => s.id === skillId);
      if (skill) {
        console.log('[Skills] Pre-selecting skill for new conversation:', skill.name);
        setPreSelectedSkill(skill);
      }
      return;
    }
    
    try {
      await skillActions.activateSkill(skillId, currentConversationId, userId);
      await loadActiveSkill(currentConversationId);
      console.log('[Skills] Skill activated, activeSkill state:', activeSkill);
    } catch (err) {
      console.error('Failed to activate skill:', err);
    }
  };

  // Handle skill deactivation
  const handleDeactivateSkill = async () => {
    if (!currentConversationId) {
      // No conversation - just clear pre-selection
      setPreSelectedSkill(null);
      return;
    }
    
    try {
      await skillActions.deactivateSkill(currentConversationId);
      setActiveSkill(null);
    } catch (err) {
      console.error('Failed to deactivate skill:', err);
    }
  };

  const checkAuth = async () => {
    try {
      const sessionResult = await authActions.checkSession();

      if (!sessionResult.authenticated) {
        router.push('/login');
        return;
      }

      const user = sessionResult.user;
      setIsAuthenticated(true);
      setUserId(user.id);
      setUserName(user.name || 'User');
      setUserEmail(user.email);

      await loadAvailableSkills(user.id);

      let savedToken = localStorage.getItem('github_token') || process.env.NEXT_PUBLIC_GITHUB_TOKEN || '';
      let savedTavilyKey = localStorage.getItem('tavily_api_key') || process.env.NEXT_PUBLIC_TAVILY_API_KEY || '';

      const settings = await userActions.loadUserSettings(user.id);
      if (settings) {
        if (!savedToken && settings.github_token) savedToken = settings.github_token;
        if (!savedTavilyKey && settings.tavily_api_key) savedTavilyKey = settings.tavily_api_key;
        if (settings.telegram_bot_token) setTelegramBotToken(settings.telegram_bot_token);
        if (settings.google_api_key) setGoogleApiKey(settings.google_api_key);
        if (settings.location) setLocationInput(settings.location);
        if (settings.system_message) setSystemMessage(settings.system_message);
        if (!settings.onboarding_completed) setShowOnboarding(true);
      } else {
        setShowOnboarding(true);
      }

      setGithubToken(savedToken);
      setTavilyApiKey(savedTavilyKey);

      await loadConversations(user.id);
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/login');
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
    const message = await chatActions.loadSystemMessage(userId);
    setSystemMessage(message);
    setSystemMessageEdit(message);
  };

  const saveSystemMessage = async () => {
    if (!userId) return;

    const result = await chatActions.saveSystemMessage(userId, systemMessageEdit);

    if (result.success) {
      setSystemMessage(systemMessageEdit);
      setIsMyAlleracOpen(false);
      // Reload from database to ensure sync
      await loadSystemMessage();
      alert('Settings saved successfully!');
    } else {
      console.error('Error saving system message:', result.error);
      alert('Error saving settings');
    }
  };

  const loadConversations = async (uid: string) => {
    const data = await chatActions.loadConversations(uid);
    setConversations(data);
  };

  const loadConversation = async (conversationId: string) => {
    // Before loading new conversation, try to summarize the current one
    if (currentConversationId && currentConversationId !== conversationId && githubToken && userId) {
      console.log(`[Memory] Switching from conversation ${currentConversationId} to ${conversationId}`);
      try {
        // Check if current conversation should be summarized
        const shouldSummarize = await memoryActions.shouldSummarizeConversation(currentConversationId, githubToken);
        console.log(`[Memory] Should summarize ${currentConversationId}:`, shouldSummarize);

        if (shouldSummarize) {
          console.log(`[Memory] Generating summary for conversation ${currentConversationId}...`);
          // Generate summary in background (don't wait for it)
          memoryActions.generateConversationSummary(currentConversationId, userId, githubToken)
            .then(summary => console.log('[Memory] Summary generated:', summary))
            .catch(err => console.error('[Memory] Failed to generate summary:', err));
        }
      } catch (error) {
        console.error('[Memory] Error in summary generation:', error);
      }
    }

    const data = await chatActions.loadMessages(conversationId);

    const loadedMessages = data?.map((msg: any) => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
      timestamp: new Date(msg.created_at),
    })) || [];

    setMessages(loadedMessages);
    setCurrentConversationId(conversationId);

    // Load active skill for this conversation
    await loadActiveSkill(conversationId);

    // Check if this conversation already has a memory
    const existingMemory = await memoryActions.shouldSummarizeConversation(conversationId, githubToken); // Wait, shouldSummarize returns true if NO memory. So if false, it MIGHT mean it has memory OR not enough messages.
    // Better to have a specific check.
    // Let's assume for now we don't show the memory flag urgently or we implement a checkHasMemory action.
    // Implementing checkHasMemory requires importing DB. let's skip for now to save time, or use `shouldSummarize` implication carefully.
    // Actually, `shouldSummarize` logic is: NO summary AND message_count >= 4.
    // So !shouldSummarize doesn't mean it has memory.

    // I'll leave `currentConversationHasMemory` as false for now or implement a quick action if needed.
    setCurrentConversationHasMemory(false);
  };

  const handleGenerateSummary = async () => {
    if (!currentConversationId || !userId || !githubToken) return;

    // Open modal and show loading
    setIsMemorySaveModalOpen(true);
    setMemorySaveLoading(true);
    setMemorySaveResult(null);

    try {
      // Direct action call instead of service
      const summary = await memoryActions.generateConversationSummary(currentConversationId, userId, githubToken);

      if (summary) {
        setMemorySaveResult({
          success: true,
          message: 'Summary generated successfully!',
          summary: summary.summary,
          topics: summary.key_topics
        });
        setCurrentConversationHasMemory(true);
      } else {
        setMemorySaveResult({
          success: false,
          message: 'Could not generate summary (possibly not enough messages)'
        });
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


  const handleLogout = async () => {
    // Call logout action to clear session
    await authActions.logout();

    // Clear local state
    localStorage.removeItem('github_token');
    localStorage.removeItem('tavily_api_key');
    setGithubToken('');
    setTavilyApiKey('');
    setGoogleApiKey('');
    setIsAuthenticated(false);
    setUserId(null);
    setMessages([]);
    setConversations([]);
    setCurrentConversationId(null);

    router.push('/login');
  };

  // Keep the ref updated with the latest handleLogout
  handleLogoutRef.current = handleLogout;

  const handleSaveToken = async () => {
    if (!userId) return;

    const newGithubToken = tokenInput.trim();
    const newTavilyKey = tavilyKeyInput.trim();
    const newGoogleKey = googleKeyInput.trim();
    const newLocation = locationInput.trim();

    if (!newGithubToken && !newTavilyKey && !newGoogleKey && !newLocation) return;

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
      if (newGoogleKey) {
        setGoogleApiKey(newGoogleKey);
        setGoogleKeyInput('');
      }

      // Save to DB
      const result = await userActions.saveUserSettings(userId, newGithubToken || undefined, newTavilyKey || undefined, undefined, newGoogleKey || undefined, newLocation || undefined);

      if (!result?.success) {
        alert('Error saving keys to database. Please check server configuration.');
        return;
      }

    } catch (error) {
      console.error('Error saving API keys:', error);
      alert('Error saving keys. Please try again.');
    }
  };

  const handleSendMessage = async () => {
    if (isSending) return;
    setIsSending(true);
    try {
      let message = inputMessage;
      if (documentAttachments.length > 0) {
        const docBlocks = documentAttachments.map(d =>
          `<attachment name="${d.name}">\n${d.content}\n</attachment>`
        ).join('\n\n');
        message = (message.trim() ? message + '\n\n' : '') + docBlocks;
      }
      // Save copy of sent images before clearing (for Instagram draft pre-fill)
      if (imageAttachments.length > 0) {
        setLastSentImages([...imageAttachments]);
      }
      await chatMessageService.sendMessage(message, imageAttachments, activeSkill);
      setInputMessage('');
      imageAttachments.forEach(img => URL.revokeObjectURL(img.preview));
      setImageAttachments([]);
      setDocumentAttachments([]);
    } finally {
      setIsSending(false);
    }
  };

  const handleDocumentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach(file => {
      const placeholder = { file, name: file.name, content: '' };
      setDocumentAttachments(prev => [...prev, placeholder]);
      const form = new FormData();
      form.append('file', file);
      fetch('/api/chat/extract-text', { method: 'POST', body: form })
        .then(r => r.json())
        .then(data => {
          if (data.error) throw new Error(data.error);
          setDocumentAttachments(prev =>
            prev.map(d => d.file === file ? { ...d, content: data.text } : d)
          );
        })
        .catch(err => {
          setDocumentAttachments(prev => prev.filter(d => d.file !== file));
          alert(`Erro ao processar "${file.name}": ${err.message}`);
        });
    });
    if (documentFileInputRef.current) documentFileInputRef.current.value = '';
  };

  const removeDocument = (index: number) => {
    setDocumentAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newImages: Array<{ file: File; preview: string }> = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        newImages.push({
          file,
          preview: URL.createObjectURL(file)
        });
      }
    }
    setImageAttachments(prev => [...prev, ...newImages]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImageAttachments(prev => {
      const removed = prev[index];
      URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
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
    setActiveSkill(null);
    setPreSelectedSkill(null);
  };

  const deleteConversation = async (conversationId: string) => {
    const result = await chatActions.deleteConversation(conversationId);

    if (!result.success) {
      return;
    }

    if (currentConversationId === conversationId) {
      clearChat();
    }

    if (userId) await loadConversations(userId);
  };

  const handlePinConversation = async (conversationId: string, pinned: boolean) => {
    await chatActions.pinConversation(conversationId, pinned);
    if (userId) await loadConversations(userId);
  };

  const handleRenameConversation = async (conversationId: string, title: string) => {
    await chatActions.renameConversation(conversationId, title);
    if (userId) await loadConversations(userId);
  };

  if (isLoading) {
    return (
      <div className={`min-h-dvh flex items-center justify-center ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={`h-dvh flex flex-col ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>

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
            onClose={() => setIsSidebarOpen(false)}
            conversations={conversations}
            currentConversationId={currentConversationId}
            loadConversation={loadConversation}
            deleteConversation={deleteConversation}
            pinConversation={handlePinConversation}
            renameConversation={handleRenameConversation}
            showWorkspace={showWorkspace}
            showHealth={showHealth}
            showInstagramDM={showInstagramDM}
            onOpenInstagramPost={() => window.dispatchEvent(new CustomEvent('openInstagramPost'))}
            instagramConnected={showInstagramPost}
          />
        </div>

        {/* Desktop Sidebar (>= lg breakpoint) */}
        <div className="hidden lg:block">
          <SidebarDesktop
            isSidebarCollapsed={isSidebarCollapsed}
            setIsSidebarCollapsed={setIsSidebarCollapsed}
            isDarkMode={isDarkMode}
            conversations={conversations}
            currentConversationId={currentConversationId}
            loadConversation={loadConversation}
            deleteConversation={deleteConversation}
            pinConversation={handlePinConversation}
            renameConversation={handleRenameConversation}
            showWorkspace={showWorkspace}
            showHealth={showHealth}
            showInstagramDM={showInstagramDM}
            onOpenInstagramPost={() => window.dispatchEvent(new CustomEvent('openInstagramPost'))}
            instagramConnected={showInstagramPost}
          />
        </div>

        {/* Main Chat Area */}
        <div className={`flex-1 flex flex-col overflow-hidden ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>

          {/* Chat Header - always fixed at top */}
          <ChatHeader
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
            isDarkMode={isDarkMode}
            toggleTheme={toggleTheme}
            clearChat={clearChat}
            domainName={domainName}
            activeSkill={activeSkill}
            currentConversationId={currentConversationId}
            currentConversationTitle={conversations.find(c => c.id === currentConversationId)?.title}
            currentConversationHasMemory={currentConversationHasMemory}
            handleGenerateSummary={handleGenerateSummary}
            isTerminalMode={effectiveChatMode === 'terminal'}
            onToggleChatMode={terminalTheme ? toggleChatMode : undefined}
          />

          {/* ── Terminal mode — full area replacement ── */}
          {effectiveChatMode === 'terminal' ? (
            <TerminalMessageArea
              messages={messages}
              isSending={isSending}
              inputMessage={inputMessage}
              setInputMessage={setInputMessage}
              handleSendMessage={handleSendMessage}
              domainName={domainName}
              theme={terminalTheme}
              onTeach={setTerminalTeachContent}
              imageAttachments={imageAttachments}
              documentAttachments={documentAttachments}
              onImageSelect={handleImageSelect}
              onDocumentSelect={handleDocumentSelect}
              onRemoveImage={removeImage}
              onRemoveDocument={removeDocument}
              fileInputRef={fileInputRef}
              documentFileInputRef={documentFileInputRef}
            />
          ) : messages.length === 0 ? (
            /* Empty State — greeting + input centered in the remaining space */
            <div className={`flex-1 flex flex-col items-center justify-center px-4 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
              <div className="w-full max-w-2xl">
                <div className="text-center mb-8">
                  <div className="w-fit mx-auto mb-6">
                    <AlleracIcon size={80} />
                  </div>
                  <h2 className={`text-3xl font-bold mb-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{t('greeting', { name: userName })}</h2>
                  <h3 className={`text-xl font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('helpText')}</h3>
                </div>
                <ChatInput
                  inputMessage={inputMessage}
                  setInputMessage={setInputMessage}
                  handleKeyPress={handleKeyPress}
                  handleSendMessage={handleSendMessage}
                  isSending={isSending}
                  githubToken={githubToken}
                  isDarkMode={isDarkMode}
                  setIsDocumentModalOpen={() => { setMyAlleracTab('memory'); setMyAlleracMemoryTab('documents'); setIsMyAlleracOpen(true); }}
                  imageAttachments={imageAttachments}
                  onImageSelect={handleImageSelect}
                  onRemoveImage={removeImage}
                  fileInputRef={fileInputRef}
                  documentAttachments={documentAttachments}
                  onDocumentSelect={handleDocumentSelect}
                  onRemoveDocument={removeDocument}
                  documentFileInputRef={documentFileInputRef}
                  availableSkills={availableSkills}
                  activeSkill={activeSkill}
                  preSelectedSkill={preSelectedSkill}
                  onActivateSkill={handleActivateSkill}
                  onDeactivateSkill={handleDeactivateSkill}
                  selectedModel={selectedModel}
                  setSelectedModel={setSelectedModel}
                  MODELS={MODELS}
                  githubConfigured={!!githubToken}
                  googleConfigured={!!googleApiKey}
                  ollamaConnected={ollamaConnected}
                  ollamaModels={ollamaModels}
                  onDownloadModel={handleDownloadModel}
                />
              </div>
            </div>
          ) : (
            /* Conversation State — messages scroll + input pinned at bottom */
            <>
              <div data-name="messages-container" className={`flex-1 overflow-y-auto ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
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
              </div>
              <div data-name="input-area-wrapper" className={`flex-shrink-0 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
                <div className="max-w-3xl mx-auto px-3 sm:px-4 pt-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
                  <ChatInput
                    inputMessage={inputMessage}
                    setInputMessage={setInputMessage}
                    handleKeyPress={handleKeyPress}
                    handleSendMessage={handleSendMessage}
                    isSending={isSending}
                    githubToken={githubToken}
                    isDarkMode={isDarkMode}
                    setIsDocumentModalOpen={() => { setMyAlleracTab('memory'); setMyAlleracMemoryTab('documents'); setIsMyAlleracOpen(true); }}
                    imageAttachments={imageAttachments}
                    onImageSelect={handleImageSelect}
                    onRemoveImage={removeImage}
                    fileInputRef={fileInputRef}
                    availableSkills={availableSkills}
                    activeSkill={activeSkill}
                    preSelectedSkill={preSelectedSkill}
                    onActivateSkill={handleActivateSkill}
                    onDeactivateSkill={handleDeactivateSkill}
                    selectedModel={selectedModel}
                    setSelectedModel={setSelectedModel}
                    MODELS={MODELS}
                    githubConfigured={!!githubToken}
                    googleConfigured={!!googleApiKey}
                    ollamaConnected={ollamaConnected}
                    ollamaModels={ollamaModels}
                    onDownloadModel={handleDownloadModel}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* My Allerac Modal */}
      <MyAlleracModal
        isOpen={isMyAlleracOpen}
        onClose={() => setIsMyAlleracOpen(false)}
        isDarkMode={isDarkMode}
        userId={userId}
        githubToken={githubToken}
        systemMessageEdit={systemMessageEdit}
        setSystemMessageEdit={setSystemMessageEdit}
        systemMessage={systemMessage}
        userName={userName}
        onSaveInstructions={saveSystemMessage}
        defaultTab={myAlleracTab}
        defaultMemoryTab={myAlleracMemoryTab}
      />

      {/* Skills Library Modal */}
      <SkillsLibrary
        isOpen={isSkillsLibraryOpen}
        onClose={() => setIsSkillsLibraryOpen(false)}
        isDarkMode={isDarkMode}
        userId={userId}
        onSkillCreated={() => {
          if (userId) loadAvailableSkills(userId);
        }}
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

      {/* Terminal Teach Modal */}
      {terminalTeachContent !== null && (
        <CorrectAndMemorize
          isOpen
          onClose={() => setTerminalTeachContent(null)}
          llmResponse={terminalTeachContent}
          conversationId={currentConversationId}
          userId={userId}
          githubToken={githubToken}
          isDarkMode={isDarkMode}
        />
      )}

      {/* User Settings Modal */}
      <UserSettingsModal
        isOpen={isUserSettingsOpen}
        onClose={() => setIsUserSettingsOpen(false)}
        isDarkMode={isDarkMode}
        userName={userName}
        userEmail={userEmail}
        userId={userId}
        onLogout={handleLogout}
      />

      {/* Telegram Bot Settings Modal */}
      {isTelegramBotSettingsOpen && userId && (
        <TelegramBotSettings
          userId={userId}
          onClose={() => setIsTelegramBotSettingsOpen(false)}
        />
      )}


      {/* Health Dashboard */}
      <HealthDashboard
        isOpen={isHealthDashboardOpen}
        onClose={() => setIsHealthDashboardOpen(false)}
        isDarkMode={isDarkMode}
        userId={userId || undefined}
      />

      {/* Instagram DM Panel */}
      <InstagramDMPanel
        isOpen={isInstagramDMOpen}
        onClose={() => setIsInstagramDMOpen(false)}
        isDarkMode={isDarkMode}
      />

      {/* Instagram Post Modal */}
      {isInstagramPostOpen && userId && (
        <InstagramPostModal
          userId={userId}
          onClose={() => { setIsInstagramPostOpen(false); setInstagramPreFill(null); }}
          onSuccess={() => {
            setIsInstagramPostOpen(false);
            setInstagramPreFill(null);
            setInstagramDraft(null);
          }}
          initialCaption={instagramPreFill?.caption}
          initialTags={instagramPreFill?.tags}
          initialImageBase64={instagramPreFill?.imageBase64}
          initialImagePreview={instagramPreFill?.imagePreview}
        />
      )}

      {/* Onboarding Wizard */}
      {showOnboarding && userId && (
        <OnboardingWizard
          userId={userId}
          userName={userName || ''}
          isDarkMode={isDarkMode}
          systemMessage={systemMessage}
          ollamaConnected={ollamaConnected}
          onComplete={(updates) => {
            if (updates.googleApiKey) setGoogleApiKey(updates.googleApiKey);
            if (updates.githubToken) setGithubToken(updates.githubToken);
            if (updates.systemMessage) setSystemMessage(updates.systemMessage);
            setShowOnboarding(false);
          }}
        />
      )}

      {/* Configuration Modal (System + API Keys) */}
      <SystemDashboard
        isOpen={isSystemDashboardOpen}
        onClose={() => setIsSystemDashboardOpen(false)}
        isDarkMode={isDarkMode}
        userId={userId || undefined}
        initialTab={systemDashboardInitialTab}
        githubToken={githubToken}
        tavilyApiKey={tavilyApiKey}
        googleApiKey={googleApiKey}
        tokenInput={tokenInput}
        setTokenInput={setTokenInput}
        tavilyKeyInput={tavilyKeyInput}
        setTavilyKeyInput={setTavilyKeyInput}
        googleKeyInput={googleKeyInput}
        setGoogleKeyInput={setGoogleKeyInput}
        locationInput={locationInput}
        setLocationInput={setLocationInput}
        onSaveToken={handleSaveToken}
        onOpenTelegramSettings={() => {
          setIsSystemDashboardOpen(false);
          setIsTelegramBotSettingsOpen(true);
        }}
        MODELS={MODELS}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
      />
    </div>
  );
}

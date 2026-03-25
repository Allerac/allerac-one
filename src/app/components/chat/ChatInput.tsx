'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { AlleracIcon } from '../ui/AlleracIcon';

interface ChatInputProps {
  inputMessage: string;
  setInputMessage: (message: string) => void;
  handleKeyPress: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleSendMessage: () => void;
  isSending: boolean;
  githubToken: string;
  isDarkMode: boolean;
  setIsDocumentModalOpen: (open: boolean) => void;
  imageAttachments?: Array<{ file: File; preview: string }>;
  onImageSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage?: (index: number) => void;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
  documentAttachments?: Array<{ file: File; name: string; content: string }>;
  onDocumentSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveDocument?: (index: number) => void;
  documentFileInputRef?: React.RefObject<HTMLInputElement | null>;
  // Skills props
  availableSkills?: any[];
  activeSkill?: any | null;
  preSelectedSkill?: any | null;
  onActivateSkill?: (skillId: string) => void;
  onDeactivateSkill?: () => void;
  // Model props
  selectedModel?: string;
  setSelectedModel?: (model: string) => void;
  MODELS?: any[];
  githubConfigured?: boolean;
  googleConfigured?: boolean;
  ollamaConnected?: boolean;
  ollamaModels?: any[];
  onDownloadModel?: (modelName: string) => void;
}

export default function ChatInput({
  inputMessage,
  setInputMessage,
  handleKeyPress,
  handleSendMessage,
  isSending,
  githubToken,
  isDarkMode,
  setIsDocumentModalOpen,
  imageAttachments = [],
  onImageSelect,
  onRemoveImage,
  fileInputRef,
  documentAttachments = [],
  onDocumentSelect,
  onRemoveDocument,
  documentFileInputRef,
  selectedModel,
  setSelectedModel,
  MODELS = [],
  githubConfigured = false,
  googleConfigured = false,
  ollamaConnected = false,
  ollamaModels = [],
  onDownloadModel,
}: ChatInputProps) {
  const t = useTranslations('chat');
  const attachDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentModel = MODELS.find(m => m.id === selectedModel);
  const currentModelConfig = currentModel;

  const CATEGORY_ORDER = ['Fast', 'Thinking', 'Pro'] as const;
  const CATEGORY_ICONS: Record<string, string> = { Fast: '⚡', Thinking: '🧠', Pro: '✨' };

  const modelsByCategory = CATEGORY_ORDER.reduce<Record<string, typeof MODELS>>((acc, cat) => {
    acc[cat] = MODELS.filter(m => m.category === cat);
    return acc;
  }, {});
  const isProviderReady =
    currentModelConfig?.provider === 'ollama' ? ollamaConnected :
    currentModelConfig?.provider === 'gemini' ? googleConfigured :
    githubConfigured;

  const providerHint = !isProviderReady
    ? currentModelConfig?.provider === 'ollama'
      ? t('ollamaNotConnected')
      : currentModelConfig?.provider === 'gemini'
      ? t('googleNotConfigured')
      : t('githubNotConfigured')
    : null;

  // Auto-resize textarea as content changes
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [inputMessage]);

  // Refocus textarea after message is sent
  useEffect(() => {
    if (!isSending) textareaRef.current?.focus();
  }, [isSending]);

  // Close dropdowns on ESC or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const attachDropdown = document.getElementById('chat-input-attach-dropdown');
        const modelDropdown = document.getElementById('chat-input-model-dropdown');
        attachDropdown?.classList.add('hidden');
        modelDropdown?.classList.add('hidden');
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (attachDropdownRef.current && !attachDropdownRef.current.contains(e.target as Node)) {
        const dropdown = document.getElementById('chat-input-attach-dropdown');
        dropdown?.classList.add('hidden');
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        const dropdown = document.getElementById('chat-input-model-dropdown');
        dropdown?.classList.add('hidden');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, []);

  return (
    <div data-name="chat-input-box" className={`rounded-2xl shadow-lg ${isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
      {/* Image + document previews */}
      {(imageAttachments.length > 0 || documentAttachments.length > 0) && (
        <div className={`m-2 flex flex-wrap gap-2 p-2 rounded-lg ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-100'}`}>
          {imageAttachments.map((img, index) => (
            <div key={`img-${index}`} className="relative group">
              <img
                src={img.preview}
                alt={`Preview ${index + 1}`}
                className="w-20 h-20 object-cover rounded border-2 border-brand-500"
              />
              <button
                onClick={() => onRemoveImage?.(index)}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
          {documentAttachments.map((doc, index) => {
            const processing = doc.content === '';
            return (
              <div
                key={`doc-${index}`}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs max-w-[180px] group ${
                  isDarkMode ? 'bg-gray-600 text-gray-200' : 'bg-white border border-gray-200 text-gray-700'
                }`}
              >
                {processing ? (
                  <div className="h-3.5 w-3.5 shrink-0 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                <span className="truncate flex-1">{doc.name}</span>
                {!processing && (
                  <button
                    onClick={() => onRemoveDocument?.(index)}
                    className={`shrink-0 rounded transition-colors ${isDarkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onImageSelect}
        className="hidden"
      />
      <input
        ref={documentFileInputRef}
        type="file"
        accept=".txt,.md,.markdown,.csv,.json,.xml,.html,.ts,.tsx,.js,.jsx,.py,.rb,.go,.rs,.java,.c,.cpp,.sh,.yaml,.yml,.toml,.ini,.env,.sql,.pdf"
        multiple
        onChange={onDocumentSelect}
        className="hidden"
      />
      
      {/* Line 1: Text input */}
      <textarea
        ref={textareaRef}
        value={inputMessage}
        onChange={(e) => setInputMessage(e.target.value)}
        onKeyDown={handleKeyPress}
        placeholder={t('typeMessage')}
        className={`w-full px-4 pt-3 pb-2 focus:outline-none resize-none disabled:opacity-50 bg-transparent overflow-y-auto ${isDarkMode ? 'text-gray-100 placeholder-gray-400' : 'text-black placeholder-gray-400'}`}
        rows={1}
        disabled={isSending}
        style={{ minHeight: '48px', maxHeight: '200px', lineHeight: '28px' }}
      />
      
      {/* Provider hint */}
      {providerHint && (
        <div className={`mx-3 mb-1 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 ${isDarkMode ? 'bg-amber-900/30 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
          </svg>
          {providerHint}
        </div>
      )}

      {/* Line 2: Action buttons */}
      <div className="flex items-center justify-between px-2 pb-2">
        {/* Left side: Tool buttons */}
        <div className="flex items-center gap-1">
          {/* Attachments dropdown (+ button) */}
          <div className="relative" ref={attachDropdownRef}>
            <button
              onClick={() => {
                const dropdown = document.getElementById('chat-input-attach-dropdown');
                dropdown?.classList.toggle('hidden');
              }}
              className={`w-11 h-11 rounded-lg transition-all flex items-center justify-center ${
                isDarkMode
                  ? 'hover:bg-gray-600 text-gray-400'
                  : 'hover:bg-gray-200 text-gray-600'
              }`}
              title={t('addAttachment')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>

            {/* Attachment dropdown menu */}
            <div
              id="chat-input-attach-dropdown"
              className={`hidden absolute left-0 bottom-full mb-2 w-48 rounded-lg shadow-lg z-50 ${
                isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
              }`}
            >
              <div className="py-1">
                <button
                  onClick={() => {
                    fileInputRef?.current?.click();
                    document.getElementById('chat-input-attach-dropdown')?.classList.add('hidden');
                  }}
                  className={`w-full px-4 py-2 text-left flex items-center gap-3 transition-colors ${
                    isDarkMode
                      ? 'hover:bg-gray-700 text-gray-300'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm">{t('image')}</span>
                </button>
                <button
                  onClick={() => {
                    documentFileInputRef?.current?.click();
                    document.getElementById('chat-input-attach-dropdown')?.classList.add('hidden');
                  }}
                  className={`w-full px-4 py-2 text-left flex items-center gap-3 transition-colors ${
                    isDarkMode
                      ? 'hover:bg-gray-700 text-gray-300'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm">{t('document')}</span>
                </button>
              </div>
            </div>
          </div>
          
        </div>
        
        {/* Right side: Send button */}
        <div className="flex items-center gap-1">
          {/* Send button */}
          <button
            onClick={handleSendMessage}
            disabled={isSending || (!inputMessage.trim() && imageAttachments.length === 0 && documentAttachments.length === 0) || documentAttachments.some(d => d.content === '') || !isProviderReady}
            className={`w-11 h-11 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center ${
              (inputMessage.trim() || imageAttachments.length > 0 || documentAttachments.length > 0) && !isSending
                ? 'bg-brand-900 hover:bg-brand-950 text-white'
                : isDarkMode
                ? 'bg-gray-600 text-gray-400'
                : 'bg-gray-300 text-gray-500'
            }`}
          >
            {isSending ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-7-7l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

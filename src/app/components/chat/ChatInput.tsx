'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

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
  ollamaConnected?: boolean;
  ollamaModels?: any[];
  onDownloadModel?: (modelName: string) => void;
  // Memory props
  currentConversationId?: string | null;
  currentConversationHasMemory?: boolean;
  handleGenerateSummary?: () => void;
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
  availableSkills = [],
  activeSkill = null,
  preSelectedSkill = null,
  onActivateSkill,
  onDeactivateSkill,
  selectedModel,
  setSelectedModel,
  MODELS = [],
  githubConfigured = false,
  ollamaConnected = false,
  ollamaModels = [],
  onDownloadModel,
  currentConversationId = null,
  currentConversationHasMemory = false,
  handleGenerateSummary,
}: ChatInputProps) {
  const t = useTranslations('chat');
  const currentSkill = activeSkill || preSelectedSkill;
  const dropdownRef = useRef<HTMLDivElement>(null);
  const attachDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const currentModel = MODELS.find(m => m.id === selectedModel);

  // Close dropdowns on ESC or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const skillsDropdown = document.getElementById('chat-input-skills-dropdown');
        const attachDropdown = document.getElementById('chat-input-attach-dropdown');
        const modelDropdown = document.getElementById('chat-input-model-dropdown');
        skillsDropdown?.classList.add('hidden');
        attachDropdown?.classList.add('hidden');
        modelDropdown?.classList.add('hidden');
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        const dropdown = document.getElementById('chat-input-skills-dropdown');
        dropdown?.classList.add('hidden');
      }
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
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div data-name="chat-input-box" className={`rounded-2xl shadow-lg ${isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
      {/* Image previews */}
      {imageAttachments.length > 0 && (
        <div className={`m-2 flex flex-wrap gap-2 p-2 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
          {imageAttachments.map((img, index) => (
            <div key={index} className="relative group">
              <img 
                src={img.preview} 
                alt={`Preview ${index + 1}`}
                className="w-20 h-20 object-cover rounded border-2 border-blue-500"
              />
              <button
                onClick={() => onRemoveImage?.(index)}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onImageSelect}
        className="hidden"
      />
      
      {/* Line 1: Text input */}
      <textarea
        value={inputMessage}
        onChange={(e) => setInputMessage(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder={t('typeMessage')}
        className={`w-full px-4 pt-3 pb-2 focus:outline-none resize-none disabled:opacity-50 bg-transparent ${isDarkMode ? 'text-gray-100 placeholder-gray-400' : 'text-black placeholder-gray-400'}`}
        rows={1}
        disabled={isSending || !githubToken}
        style={{ minHeight: '48px', maxHeight: '200px', lineHeight: '28px' }}
      />
      
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
              className={`w-9 h-9 rounded-lg transition-all flex items-center justify-center ${
                isDarkMode
                  ? 'hover:bg-gray-600 text-gray-400'
                  : 'hover:bg-gray-200 text-gray-600'
              }`}
              title="Add attachment"
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
                  <span className="text-sm">Image</span>
                </button>
                <button
                  onClick={() => {
                    setIsDocumentModalOpen?.(true);
                    document.getElementById('chat-input-attach-dropdown')?.classList.add('hidden');
                  }}
                  className={`w-full px-4 py-2 text-left flex items-center gap-3 transition-colors ${
                    isDarkMode
                      ? 'hover:bg-gray-700 text-gray-300'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <span className="text-sm">Document</span>
                </button>
              </div>
            </div>
          </div>
          
          {/* Skills dropdown */}
          {availableSkills.length > 0 && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => {
                  const dropdown = document.getElementById('chat-input-skills-dropdown');
                  if (dropdown) dropdown.classList.toggle('hidden');
                }}
                className={`px-3 h-9 rounded-lg flex items-center gap-1.5 transition-all text-sm ${
                  currentSkill
                    ? 'bg-purple-500 hover:bg-purple-600 text-white'
                    : isDarkMode
                    ? 'hover:bg-gray-600 text-gray-400'
                    : 'hover:bg-gray-200 text-gray-600'
                }`}
                title={currentSkill ? currentSkill.display_name || currentSkill.name : 'Select Skill'}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {currentSkill && <span className="max-w-[100px] truncate">{currentSkill.display_name || currentSkill.name}</span>}
              </button>
              
              <div
                id="chat-input-skills-dropdown"
                className={`hidden absolute bottom-full mb-2 left-0 w-64 sm:w-80 max-w-[85vw] rounded-lg shadow-lg z-50 ${
                  isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                }`}
              >
                {currentSkill && (
                  <button
                    onClick={() => {
                      onDeactivateSkill?.();
                      document.getElementById('chat-input-skills-dropdown')?.classList.add('hidden');
                    }}
                    className={`w-full px-4 py-3 text-left border-b flex items-center gap-2 ${
                      isDarkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="text-red-500 font-medium">Deactivate Skill</span>
                  </button>
                )}
                
                <div className="max-h-96 overflow-y-auto">
                  {availableSkills.map((skill) => (
                    <button
                      key={skill.id}
                      onClick={() => {
                        onActivateSkill?.(skill.id);
                        document.getElementById('chat-input-skills-dropdown')?.classList.add('hidden');
                      }}
                      className={`w-full px-4 py-3 text-left border-b transition-colors last:border-b-0 ${
                        currentSkill?.id === skill.id
                          ? isDarkMode
                            ? 'bg-purple-900 border-purple-700'
                            : 'bg-purple-50 border-purple-200'
                          : isDarkMode
                          ? 'border-gray-700 hover:bg-gray-700'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-medium ${
                          currentSkill?.id === skill.id
                            ? 'text-purple-400'
                            : isDarkMode
                            ? 'text-gray-200'
                            : 'text-gray-900'
                        }`}>
                          {skill.display_name || skill.name}
                        </span>
                        {currentSkill?.id === skill.id && (
                          <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                      </div>
                      {skill.description && (
                        <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {skill.description}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Memory button - show after skills */}
          {currentConversationId && (
            <button
              onClick={handleGenerateSummary}
              disabled={isSending}
              className={`w-9 h-9 rounded-lg transition-all flex items-center justify-center ${
                isDarkMode
                  ? 'hover:bg-gray-600 text-gray-400'
                  : 'hover:bg-gray-200 text-gray-600'
              } disabled:opacity-50`}
              title={currentConversationHasMemory
                ? 'This conversation is already saved in memory'
                : 'Save this conversation to long-term memory'
              }
            >
              {currentConversationHasMemory ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              )}
            </button>
          )}
        </div>
        
        {/* Right side: Model selector + Send button */}
        <div className="flex items-center gap-1">
          {MODELS.length > 0 && (
            <div className="relative" ref={modelDropdownRef}>
              <button
                onClick={() => {
                  const dropdown = document.getElementById('chat-input-model-dropdown');
                  if (dropdown) dropdown.classList.toggle('hidden');
                }}
                className={`px-3 h-9 rounded-lg flex items-center gap-1.5 transition-all text-sm ${
                  isDarkMode
                    ? 'hover:bg-gray-600 text-gray-300'
                    : 'hover:bg-gray-200 text-gray-700'
                }`}
                title={currentModel?.name || 'Select Model'}
              >
                <span className="max-w-32 truncate">{currentModel?.name || 'Model'}</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Model dropdown menu */}
              <div
                id="chat-input-model-dropdown"
                className={`hidden absolute right-0 bottom-full mb-2 w-64 sm:w-80 max-w-[85vw] rounded-lg shadow-lg z-50 ${
                  isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                }`}
              >
                <div className="max-h-96 overflow-y-auto">
                  {MODELS.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => {
                        setSelectedModel?.(model.id);
                        document.getElementById('chat-input-model-dropdown')?.classList.add('hidden');
                      }}
                      disabled={model.provider === 'ollama' && !ollamaConnected && !model.requiresToken}
                      className={`w-full px-4 py-3 text-left border-b transition-colors last:border-b-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                        selectedModel === model.id
                          ? isDarkMode
                            ? 'bg-blue-900 border-blue-700'
                            : 'bg-blue-50 border-blue-200'
                          : isDarkMode
                          ? 'border-gray-700 hover:bg-gray-700'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-medium ${selectedModel === model.id ? 'text-blue-400' : isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>
                          {model.name}
                        </span>
                        {selectedModel === model.id && (
                          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Send button */}
          <button
            onClick={handleSendMessage}
            disabled={isSending || (!inputMessage.trim() && imageAttachments.length === 0) || !githubToken}
            className={`w-9 h-9 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center ${
              (inputMessage.trim() || imageAttachments.length > 0) && !isSending
                ? 'bg-blue-900 hover:bg-blue-950 text-white'
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

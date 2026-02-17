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
}: ChatInputProps) {
  const t = useTranslations('chat');
  const currentSkill = activeSkill || preSelectedSkill;
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on ESC or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const dropdown = document.getElementById('chat-input-skills-dropdown');
        dropdown?.classList.add('hidden');
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        const dropdown = document.getElementById('chat-input-skills-dropdown');
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
    <div className={`border rounded-2xl ${isDarkMode ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'}`}>
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
          {/* Image upload button */}
          <button
            onClick={() => fileInputRef?.current?.click()}
            className={`w-9 h-9 rounded-lg transition-all flex items-center justify-center ${
              isDarkMode
                ? 'hover:bg-gray-600 text-gray-400'
                : 'hover:bg-gray-200 text-gray-600'
            }`}
            title="Attach image"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          
          {/* Document upload button */}
          <button
            onClick={() => setIsDocumentModalOpen(true)}
            className={`w-9 h-9 rounded-lg transition-all flex items-center justify-center ${
              isDarkMode
                ? 'hover:bg-gray-600 text-gray-400'
                : 'hover:bg-gray-200 text-gray-600'
            }`}
            title={t('attachFile')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          
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
                className={`hidden absolute bottom-full mb-2 right-0 w-72 sm:w-80 max-w-[90vw] rounded-lg shadow-lg z-50 ${
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
        </div>
        
        {/* Right side: Send button */}
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
  );
}

'use client';

import { useTranslations } from 'next-intl';

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
}: ChatInputProps) {
  const t = useTranslations('chat');

  return (
    <div className="relative">
      {/* Image previews */}
      {imageAttachments.length > 0 && (
        <div className={`mb-2 flex flex-wrap gap-2 p-2 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
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
      
      <textarea
        value={inputMessage}
        onChange={(e) => setInputMessage(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder={t('typeMessage')}
        className={`w-full px-4 py-3 pl-24 pr-14 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:opacity-50 ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100 placeholder-gray-400' : 'border-gray-300 bg-white text-black placeholder-gray-400'}`}
        rows={1}
        disabled={isSending || !githubToken}
        style={{ minHeight: '52px', maxHeight: '200px', lineHeight: '28px' }}
      />
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onImageSelect}
        className="hidden"
      />
      
      {/* Image upload button */}
      <button
        onClick={() => fileInputRef?.current?.click()}
        className={`absolute left-2 bottom-[10px] w-10 h-10 rounded-full transition-all flex items-center justify-center ${
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
        className={`absolute left-12 bottom-[10px] w-10 h-10 rounded-full transition-all flex items-center justify-center ${
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
      
      <button
        onClick={handleSendMessage}
        disabled={isSending || (!inputMessage.trim() && imageAttachments.length === 0) || !githubToken}
        className={`absolute right-2 bottom-[10px] w-10 h-10 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center ${
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
  );
}

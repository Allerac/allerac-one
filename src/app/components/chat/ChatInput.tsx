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
}: ChatInputProps) {
  const t = useTranslations('chat');

  return (
    <div className="relative">
      <textarea
        value={inputMessage}
        onChange={(e) => setInputMessage(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder={t('typeMessage')}
        className={`w-full px-4 py-3 pl-12 pr-14 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:opacity-50 ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100 placeholder-gray-400' : 'border-gray-300 bg-white text-black placeholder-gray-400'}`}
        rows={1}
        disabled={isSending || !githubToken}
        style={{ minHeight: '52px', maxHeight: '200px', lineHeight: '28px' }}
      />
      <button
        onClick={() => setIsDocumentModalOpen(true)}
        className={`absolute left-2 bottom-[10px] w-10 h-10 rounded-full transition-all flex items-center justify-center ${
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
        disabled={isSending || !inputMessage.trim() || !githubToken}
        className={`absolute right-2 bottom-[10px] w-10 h-10 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center ${
          inputMessage.trim() && !isSending
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

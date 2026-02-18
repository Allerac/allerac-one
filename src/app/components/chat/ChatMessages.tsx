'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message, Model, MessageContentPart } from '../../types';
import CorrectAndMemorize from '../memory/CorrectAndMemorize';

interface ChatMessagesProps {
  messages: Message[];
  isSending: boolean;
  selectedModel: string;
  MODELS: Model[];
  isDarkMode: boolean;
  currentConversationId: string | null;
  userId: string | null;
  githubToken: string;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

import React, { useState, useEffect, useRef } from 'react';
// ...existing code...

export default function ChatMessages({
  messages,
  isSending,
  selectedModel,
  MODELS,
  isDarkMode,
  currentConversationId,
  userId,
  githubToken,
  messagesEndRef
}: ChatMessagesProps) {
  // Controla qual mensagem tem o menu aberto (índice)
  const [openMenuIdx, setOpenMenuIdx] = useState<number | null>(null);
  const [showCorrectAndMemorize, setShowCorrectAndMemorize] = useState<number | null>(null);
  const menuRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  // Close menu on ESC or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenuIdx(null);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (openMenuIdx !== null) {
        const menuRef = menuRefs.current[openMenuIdx];
        if (menuRef && !menuRef.contains(e.target as Node)) {
          setOpenMenuIdx(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openMenuIdx]);

  // Helper to render message content (text or multimodal)
  const renderContent = (content: string | MessageContentPart[], role: 'user' | 'assistant'): any => {
    if (typeof content === 'string') {
      return content;
    }
    
    // Multimodal content - render text and images
    if (role === 'user') {
      // For user messages, show images inline
      const textParts = content.filter(part => part.type === 'text').map(part => part.text);
      const imageParts = content.filter(part => part.type === 'image_url');
      
      return (
        <div className="space-y-2">
          {textParts.length > 0 && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {textParts.join('\n')}
            </p>
          )}
          {imageParts.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {imageParts.map((img, idx) => (
                <img
                  key={idx}
                  src={img.image_url?.url}
                  alt={`Uploaded ${idx + 1}`}
                  className="max-w-xs rounded-lg border-2 border-blue-500/30"
                  style={{ maxHeight: '200px' }}
                />
              ))}
            </div>
          )}
        </div>
      );
    } else {
      // For assistant messages, just extract text
      const textParts = content.filter(part => part.type === 'text').map(part => part.text).join('\n');
      return textParts || '[Image content]';
    }
  };

  return (
    <div data-name="chat-messages-wrapper" className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <div className="space-y-6">
        {messages.map((message, index) => (
          <div key={index} className={`${message.role === 'user' ? 'flex justify-end' : ''}`}>
            {/* User message - simple bubble on right */}
            {message.role === 'user' ? (
              <div className="max-w-[80%]">
                <div className={`rounded-2xl py-3 px-4 ${
                  isDarkMode
                    ? 'bg-gray-800 text-gray-100'
                    : 'bg-gray-100 text-black'
                }`}>
                  <div className="text-sm leading-relaxed">
                    {typeof message.content === 'string' ? (
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    ) : (
                      renderContent(message.content, 'user')
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Assistant message - compact layout with icon on top */
              <div className="w-full">
                {/* Header: Icon and Menu */}
                <div className="flex items-start justify-between mb-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">{MODELS.find((m: Model) => m.id === selectedModel)?.icon || '🤖'}</span>
                  </div>
                  
                  {/* 3-dot menu */}
                  <div className="relative" ref={el => { menuRefs.current[index] = el; }}>
                    <button
                      onClick={() => setOpenMenuIdx(openMenuIdx === index ? null : index)}
                      className={`p-1 rounded-lg transition-colors ${
                        isDarkMode
                          ? 'hover:bg-gray-700 text-gray-400'
                          : 'hover:bg-gray-200 text-gray-600'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>

                    {/* Dropdown menu */}
                    {openMenuIdx === index && (
                      <div className={`absolute right-0 top-full mt-1 w-48 rounded-lg shadow-xl border z-50 ${
                        isDarkMode
                          ? 'bg-gray-800 border-gray-700'
                          : 'bg-white border-gray-200'
                      }`}>
                        <button
                          onClick={() => {
                            setShowCorrectAndMemorize(index);
                            setOpenMenuIdx(null);
                          }}
                          className={`w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors ${
                            isDarkMode
                              ? 'hover:bg-gray-700 text-gray-300'
                              : 'hover:bg-gray-100 text-gray-700'
                          }`}
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span>Correct & Memorize</span>
                        </button>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(
                              typeof message.content === 'string' 
                                ? message.content 
                                : renderContent(message.content, 'assistant') as string
                            );
                            setOpenMenuIdx(null);
                          }}
                          className={`w-full px-4 py-3 text-left text-sm border-t flex items-center gap-3 transition-colors ${
                            isDarkMode
                              ? 'hover:bg-gray-700 text-gray-300 border-gray-700'
                              : 'hover:bg-gray-100 text-gray-700 border-gray-200'
                          }`}
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                          </svg>
                          <span>Copy</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Message content */}
                <div className={`text-sm leading-relaxed prose prose-sm max-w-none ${isDarkMode ? 'prose-invert prose-headings:text-gray-100 prose-p:text-gray-100 prose-li:text-gray-100 prose-strong:text-gray-100 prose-code:text-gray-100 prose-pre:bg-gray-900 prose-pre:text-gray-100' : 'prose-headings:text-black prose-p:text-black prose-li:text-black prose-strong:text-black prose-code:text-black prose-pre:bg-gray-100 prose-pre:text-black'} prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-a:font-medium prose-hr:hidden prose-p:my-2 prose-headings:my-3`}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ node, ...props }) => (
                        <a
                          {...props}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 hover:underline font-medium transition-colors"
                        />
                      ),
                      hr: () => null,
                    }}
                  >
                    {typeof message.content === 'string' ? message.content : renderContent(message.content, 'assistant')}
                  </ReactMarkdown>
                </div>

                {/* Correct & Memorize modal */}
                {showCorrectAndMemorize === index && (
                  <div className="mt-3">
                    <CorrectAndMemorize
                      llmResponse={typeof message.content === 'string' ? message.content : renderContent(message.content, 'assistant') as string}
                      conversationId={currentConversationId}
                      userId={userId}
                      githubToken={githubToken}
                      isDarkMode={isDarkMode}
                      showInput={true}
                      onOpen={() => {}}
                      onClose={() => setShowCorrectAndMemorize(null)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        
        
        {isSending && (
          <div className="flex gap-0 flex-row">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <span className="text-sm">{MODELS.find((m: Model) => m.id === selectedModel)?.icon || '🤖'}</span>
            </div>
            <div className="flex-1 ml-3">
              <div className="py-3">
                <div className="flex items-end gap-1 pb-1">
                  <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkMode ? 'bg-gray-500' : 'bg-gray-400'}`} style={{ animationDelay: '0ms' }}></div>
                  <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkMode ? 'bg-gray-500' : 'bg-gray-400'}`} style={{ animationDelay: '150ms' }}></div>
                  <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkMode ? 'bg-gray-500' : 'bg-gray-400'}`} style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div ref={messagesEndRef} />
    </div>
  );
}

'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message, Model } from '../../types';
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

import React, { useState } from 'react';
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
  // Controla qual mensagem tem o CorrectAndMemorize aberto (índice)
  const [openCorrectionIdx, setOpenCorrectionIdx] = useState<number | null>(null);

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <div className="space-y-6">
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === 'user' ? 'flex-row-reverse' : 'gap-0 flex-row'}`}>
            {message.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                <span className="text-sm">{MODELS.find((m: Model) => m.id === selectedModel)?.icon || '🤖'}</span>
              </div>
            )}
            <div className={message.role === 'user' ? 'max-w-[70%]' : 'flex-1 ml-3'}>
              <div className={`rounded-2xl py-3 ${
                message.role === 'user'
                  ? isDarkMode
                    ? 'bg-gray-800 text-gray-100 px-4'
                    : 'bg-gray-100 text-black px-4'
                  : isDarkMode
                  ? 'text-gray-100'
                  : 'text-black'
              }`}>
                {message.role === 'assistant' ? (
                  <div className={`text-sm leading-relaxed prose prose-sm max-w-none ${isDarkMode ? 'prose-invert prose-headings:text-gray-100 prose-p:text-gray-100 prose-li:text-gray-100 prose-strong:text-gray-100 prose-code:text-gray-100 prose-pre:bg-gray-900 prose-pre:text-gray-100' : 'prose-headings:text-black prose-p:text-black prose-li:text-black prose-strong:text-black prose-code:text-black prose-pre:bg-gray-100 prose-pre:text-black'} prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-a:font-medium`}>
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
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <p className={`text-xs mt-1 ${message.role === 'user' ? 'px-2' : ''} ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
                {message.role === 'assistant' && (
                  <CorrectAndMemorize
                    llmResponse={message.content}
                    conversationId={currentConversationId}
                    userId={userId}
                    githubToken={githubToken}
                    isDarkMode={isDarkMode}
                    showInput={openCorrectionIdx === index}
                    onOpen={() => setOpenCorrectionIdx(index)}
                    onClose={() => setOpenCorrectionIdx(null)}
                  />
                )}
              </div>
            </div>
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

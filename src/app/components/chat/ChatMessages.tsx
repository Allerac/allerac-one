'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message, Model, MessageContentPart } from '../../types';
import CorrectAndMemorize from '../memory/CorrectAndMemorize';
import { AlleracIcon } from '../ui/AlleracIcon';
import { AlleracAnimatedIcon } from '../ui/AlleracAnimatedIcon';
import { AgentRunView } from '../agents/AgentRunView';

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

// Splits a user message into document blocks and remaining text
// Format: <attachment name="filename">\ncontent\n</attachment>
function parseDocBlocks(text: string): Array<{ type: 'doc'; name: string; content: string } | { type: 'text'; content: string }> {
  const parts: Array<{ type: 'doc'; name: string; content: string } | { type: 'text'; content: string }> = [];
  const blockRegex = /<attachment name="(.+?)">\n([\s\S]*?)\n<\/attachment>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim();
      if (before) parts.push({ type: 'text', content: before });
    }
    parts.push({ type: 'doc', name: match[1], content: match[2] });
    lastIndex = match.index + match[0].length;
  }
  const remaining = text.slice(lastIndex).trim();
  if (remaining) parts.push({ type: 'text', content: remaining });
  return parts;
}

function CollapsibleDocBlock({ name, content, isDarkMode }: { name: string; content: string; isDarkMode: boolean }) {
  const [open, setOpen] = useState(false);
  const lineCount = content.split('\n').length;
  const charCount = content.length;
  const sizeLabel = charCount > 1000 ? `${Math.round(charCount / 1000)}k chars` : `${charCount} chars`;
  return (
    <div className={`rounded-lg border overflow-hidden mb-2 ${isDarkMode ? 'border-gray-600 bg-gray-700/50' : 'border-gray-200 bg-gray-50'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${isDarkMode ? 'hover:bg-gray-600/50' : 'hover:bg-gray-100'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className={`text-xs font-medium truncate flex-1 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{name}</span>
        <span className={`text-xs shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{lineCount} lines · {sizeLabel}</span>
        <svg className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className={`px-3 pb-3 pt-1 border-t ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`}>
          <pre className={`text-xs whitespace-pre-wrap break-words max-h-80 overflow-y-auto leading-relaxed ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{content}</pre>
        </div>
      )}
    </div>
  );
}

function extractThinking(content: string): { thinking: string; isComplete: boolean; displayContent: string } | null {
  if (typeof content !== 'string') return null;
  // Complete block
  const match = content.match(/^<think>([\s\S]*?)<\/think>\s*/);
  if (match) {
    return { thinking: match[1].trim(), isComplete: true, displayContent: content.slice(match[0].length) };
  }
  // Incomplete block (still streaming)
  if (content.startsWith('<think>') && !content.includes('</think>')) {
    return { thinking: content.slice(7).trim(), isComplete: false, displayContent: '' };
  }
  return null;
}

function CodeBlock({ code, language, isDarkMode }: { code: string; language: string; isDarkMode: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className={`relative group my-3 rounded-xl overflow-hidden border ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
      <div className={`flex items-center justify-between px-4 py-2 text-xs font-mono ${isDarkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
        <span>{language}</span>
        <button onClick={copy} className={`flex items-center gap-1.5 transition-colors ${isDarkMode ? 'hover:text-gray-200' : 'hover:text-gray-700'}`}>
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-green-500">Copied</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={isDarkMode ? oneDark : oneLight}
        customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.8rem', lineHeight: '1.6' }}
        showLineNumbers={code.split('\n').length > 5}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

export default function ChatMessages({
  messages,
  isSending,
  selectedModel,
  MODELS,
  isDarkMode,
  currentConversationId,
  userId,
  githubToken,
  messagesEndRef,
}: ChatMessagesProps) {
  // Controla qual mensagem tem o menu aberto (índice)
  const [openMenuIdx, setOpenMenuIdx] = useState<number | null>(null);
  const [showCorrectAndMemorize, setShowCorrectAndMemorize] = useState<number | null>(null);
  const [expandedThinking, setExpandedThinking] = useState<Set<number>>(new Set());
  const menuRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  // Live elapsed timer while the model is responding
  const [liveElapsed, setLiveElapsed] = useState(0);
  const sendStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (isSending) {
      sendStartRef.current = Date.now();
      setLiveElapsed(0);
      const interval = setInterval(() => {
        setLiveElapsed(Date.now() - (sendStartRef.current ?? Date.now()));
      }, 100);
      return () => clearInterval(interval);
    } else {
      sendStartRef.current = null;
    }
  }, [isSending]);

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
    document.addEventListener('pointerdown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handleClickOutside);
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
                  className="max-w-xs rounded-lg border-2 border-brand-500/30"
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
                    {typeof message.content === 'string' ? (() => {
                      const parts = parseDocBlocks(message.content);
                      const hasDoc = parts.some(p => p.type === 'doc');
                      if (!hasDoc) return <p className="whitespace-pre-wrap break-words">{message.content}</p>;
                      return (
                        <div>
                          {parts.map((part, i) =>
                            part.type === 'doc'
                              ? <CollapsibleDocBlock key={i} name={part.name} content={part.content} isDarkMode={isDarkMode} />
                              : <p key={i} className="whitespace-pre-wrap break-words">{part.content}</p>
                          )}
                        </div>
                      );
                    })() : (
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
                  {/* Agent icon */}
                  <AlleracAnimatedIcon
                    size={32}
                    isDarkMode={isDarkMode}
                    isThinking={isSending && index === messages.length - 1}
                  />

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
                          <span>Teach</span>
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
                {(() => {
                  const rawContent = typeof message.content === 'string'
                    ? message.content
                    : renderContent(message.content, 'assistant') as string;
                  const thinkResult = extractThinking(rawContent);
                  const displayContent = thinkResult ? thinkResult.displayContent : rawContent;
                  const isThinkingExpanded = expandedThinking.has(index) || (thinkResult != null && !thinkResult.isComplete);

                  return (
                    <>
                      {thinkResult && (
                        <div className={`mb-3 rounded-lg border text-xs ${
                          isDarkMode ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'
                        }`}>
                          <button
                            onClick={() => setExpandedThinking(prev => {
                              const next = new Set(prev);
                              if (next.has(index)) next.delete(index);
                              else next.add(index);
                              return next;
                            })}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors rounded-lg ${
                              isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                            <span className="font-medium">
                              {thinkResult.isComplete ? 'Reasoning' : (
                                <span className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse inline-block" />
                                  Thinking…
                                </span>
                              )}
                            </span>
                            {thinkResult.isComplete && (
                              <svg
                                className={`w-3 h-3 ml-auto transition-transform ${isThinkingExpanded ? 'rotate-180' : ''}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            )}
                          </button>
                          {isThinkingExpanded && thinkResult.thinking && (
                            <div className={`px-3 pb-3 text-xs leading-relaxed whitespace-pre-wrap font-mono border-t ${
                              isDarkMode ? 'border-gray-700 text-gray-500' : 'border-gray-200 text-gray-400'
                            }`}>
                              <div className="pt-2">{thinkResult.thinking}</div>
                            </div>
                          )}
                        </div>
                      )}
                      <div className={`text-sm leading-relaxed prose prose-sm max-w-none ${isDarkMode ? 'prose-invert prose-headings:text-gray-100 prose-p:text-gray-100 prose-li:text-gray-100 prose-strong:text-gray-100 prose-code:text-gray-100 prose-pre:bg-gray-900 prose-pre:text-gray-100' : 'text-gray-900 prose-headings:text-gray-900 prose-p:text-gray-900 prose-li:text-gray-900 prose-strong:text-gray-900 prose-code:text-gray-900 prose-pre:bg-gray-100 prose-pre:text-gray-900'} prose-a:text-brand-600 prose-a:no-underline hover:prose-a:underline prose-a:font-medium prose-hr:hidden prose-p:my-2 prose-headings:my-3`}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ node, ...props }) => (
                              <a
                                {...props}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-600 hover:text-brand-800 hover:underline font-medium transition-colors"
                              />
                            ),
                            hr: () => null,
                            code({ node, className, children, ...props }: any) {
                              const match = /language-(\w+)/.exec(className || '');
                              const isBlock = !!match;
                              const code = String(children).replace(/\n$/, '');
                              if (!isBlock) {
                                return (
                                  <code className={`px-1.5 py-0.5 rounded text-xs font-mono ${isDarkMode ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-800'}`} {...props}>
                                    {children}
                                  </code>
                                );
                              }
                              return (
                                <CodeBlock code={code} language={match[1]} isDarkMode={isDarkMode} />
                              );
                            },
                          }}
                        >
                          {displayContent}
                        </ReactMarkdown>
                      </div>

                      {/* Workspace link — shown when AI created files in /workspace/projects */}
                      {(() => {
                        const text = typeof message.content === 'string' ? message.content : '';
                        // Capture the project folder name (no extension = it's a directory)
                        // Handle both: /workspace/projects/NAME and /workspace/projects/{UUID}/NAME
                        const matches = [...text.matchAll(/\/workspace\/projects\/(?:\w+-\w+-\w+-\w+-\w+\/)?([^\/\s]+)(?:\/|$)/g)];
                        const unique = [...new Set(matches.map(m => m[1]))];
                        if (unique.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {unique.map(name => (
                              <a
                                key={name}
                                href={`/workspace/${name}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                                  isDarkMode
                                    ? 'border-indigo-800 bg-indigo-950/40 text-indigo-400 hover:bg-indigo-900/60 hover:text-indigo-300'
                                    : 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                                }`}
                              >
                                <span>📁</span>
                                <span>Open in Workspace: {name}</span>
                                <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Instagram draft action card */}
                      {message.actions?.map((action, idx) => {
                        if (action.type === 'instagram_draft') {
                          return (
                            <div
                              key={idx}
                              className={`mt-3 p-3 rounded-lg border ${
                                isDarkMode
                                  ? 'border-pink-500/30 bg-pink-500/5'
                                  : 'border-pink-200 bg-pink-50'
                              }`}
                            >
                              <div
                                className={`text-xs mb-2 font-medium ${
                                  isDarkMode ? 'text-pink-400' : 'text-pink-600'
                                }`}
                              >
                                Post preparado para o Instagram
                              </div>
                              <button
                                onClick={() => {
                                  // Use image_url from action if available, otherwise extract from message text
                                  let imageUrl: string | undefined = (action as any).image_url;
                                  if (!imageUrl && typeof message.content === 'string') {
                                    const match = message.content.match(/\[Image URLs?(?:\s+for reference)?:\s*([^\]]+)\]/);
                                    if (match && match[1]) {
                                      // Get the first URL if multiple are listed
                                      const urls = match[1].split(',').map((u: string) => u.trim());
                                      imageUrl = urls[0];
                                    }
                                  }
                                  console.log('[ChatMessages] Dispatching openInstagramPost with:', {
                                    caption: action.caption,
                                    tags: action.tags,
                                    image_url: imageUrl,
                                  });
                                  window.dispatchEvent(
                                    new CustomEvent('openInstagramPost', {
                                      detail: {
                                        caption: action.caption,
                                        tags: action.tags,
                                        image_url: imageUrl,
                                      },
                                    })
                                  );
                                }}
                                className={`flex items-center gap-2 px-4 py-2 text-white text-sm rounded-lg transition-opacity ${
                                  isDarkMode
                                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90'
                                    : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90'
                                }`}
                              >
                                <span>Revisar e Postar no Instagram</span>
                              </button>
                            </div>
                          );
                        }
                        if (action.type === 'agent_run') {
                          return (
                            <div key={idx} className="mt-3">
                              <AgentRunView
                                runId={(action as any).agentRunId}
                                isDarkMode={isDarkMode}
                              />
                            </div>
                          );
                        }
                        return null;
                      })}
                    </>
                  );
                })()}

                {/* Response time */}
                {(() => {
                  const isStreaming = isSending && index === messages.length - 1;
                  const ms = isStreaming ? liveElapsed : message.responseTime;
                  if (!ms) return null;
                  const s = (ms / 1000).toFixed(1);
                  return (
                    <div className={`mt-2 text-xs ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                      {isStreaming ? `${s}s...` : `${s}s`}
                    </div>
                  );
                })()}

              </div>
            )}
          </div>
        ))}
        
        
        {/* Thinking indicator — spinning ring on icon before first token arrives */}
        {isSending && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="relative flex-shrink-0 w-8 h-8">
            <div
              className="absolute rounded-full animate-spin"
              style={{
                inset: '-2px',
                background: 'conic-gradient(from 0deg, transparent, #6366f1 40%, #a5b4fc 60%, transparent)',
                animationDuration: '2s',
              }}
            />
            <div className="w-full h-full rounded-full flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #6366f1, #1e1b4b)', position: 'relative', zIndex: 1 }}>
              <AlleracIcon size={18} />
            </div>
          </div>
        )}
      </div>
      <div ref={messagesEndRef} />

      {/* Correct & Memorize modal — rendered once outside the loop */}
      {showCorrectAndMemorize !== null && messages[showCorrectAndMemorize] && (
        <CorrectAndMemorize
          isOpen={true}
          onClose={() => setShowCorrectAndMemorize(null)}
          llmResponse={
            typeof messages[showCorrectAndMemorize].content === 'string'
              ? messages[showCorrectAndMemorize].content as string
              : renderContent(messages[showCorrectAndMemorize].content, 'assistant') as string
          }
          conversationId={currentConversationId}
          userId={userId}
          githubToken={githubToken}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  );
}

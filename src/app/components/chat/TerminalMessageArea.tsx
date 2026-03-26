'use client';

/**
 * TerminalMessageArea
 *
 * Retro CRT terminal rendering of chat messages.
 * Replaces ChatMessages + ChatInput for domains with chatMode="terminal".
 *
 * Features:
 *  - User messages rendered as "> prompt"
 *  - Assistant messages as plain terminal output
 *  - Code blocks with ASCII box borders, language label, and [copy] button
 *  - [teach] [copy] actions on each assistant message
 *  - Blinking cursor while streaming
 *  - Simple `> _` input line at the bottom
 *  - Per-domain color themes (code, health, finance, recipes, write)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Message } from '@/app/types';

// ── Theme definitions ─────────────────────────────────────────────────────────

export type TerminalTheme = 'code' | 'health' | 'finance' | 'recipes' | 'write' | 'social';

interface ThemeConfig {
  bg: string;
  primary: string;    // user text, cursor, prompt '>'
  secondary: string;  // assistant text
  codeLabel: string;  // code block language label
  dim: string;        // borders, dim chrome, 'processing...'
  action: string;     // [copy] [teach] action buttons
  bootLabel: string;  // second line of boot header
  scanline: string;   // scanline overlay color
}

const THEMES: Record<TerminalTheme, ThemeConfig> = {
  code: {
    bg: '#0d0d0d',
    primary: '#00ff41',
    secondary: '#e0e0e0',
    codeLabel: '#8be9fd',
    dim: '#3a3a3a',
    action: '#555',
    bootLabel: 'Programmer mode active. Shift+Enter for newline.',
    scanline: 'rgba(0,0,0,0.07)',
  },
  health: {
    bg: '#060d14',
    primary: '#00d4ff',
    secondary: '#c8e8f0',
    codeLabel: '#4fc3f7',
    dim: '#1a3040',
    action: '#2a5070',
    bootLabel: 'Health monitoring active. Shift+Enter for newline.',
    scanline: 'rgba(0,30,50,0.12)',
  },
  finance: {
    bg: '#0a0800',
    primary: '#f0c040',
    secondary: '#d4c090',
    codeLabel: '#ffd700',
    dim: '#302800',
    action: '#504010',
    bootLabel: 'Financial analysis active. Shift+Enter for newline.',
    scanline: 'rgba(30,20,0,0.12)',
  },
  recipes: {
    bg: '#120900',
    primary: '#ff9f43',
    secondary: '#e8c8a0',
    codeLabel: '#ffb347',
    dim: '#3a1a00',
    action: '#5a2a00',
    bootLabel: 'Recipe mode active. Shift+Enter for newline.',
    scanline: 'rgba(40,10,0,0.10)',
  },
  write: {
    bg: '#0c0905',
    primary: '#e2c9a0',
    secondary: '#c8b090',
    codeLabel: '#c9a870',
    dim: '#2a1e10',
    action: '#4a3820',
    bootLabel: 'Writer mode active. Shift+Enter for newline.',
    scanline: 'rgba(30,15,0,0.10)',
  },
  social: {
    bg: '#0d0610',
    primary: '#e040fb',
    secondary: '#e8c0f0',
    codeLabel: '#f48fb1',
    dim: '#3a1a45',
    action: '#5a2070',
    bootLabel: 'Social media mode active. Shift+Enter for newline.',
    scanline: 'rgba(30,0,40,0.12)',
  },
};

// ── Markdown → terminal text ──────────────────────────────────────────────────

interface Segment {
  type: 'text' | 'code';
  content: string;
  lang?: string;
}

function parseSegments(raw: string): Segment[] {
  const segments: Segment[] = [];
  const codeBlockRe = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = codeBlockRe.exec(raw)) !== null) {
    if (m.index > last) {
      segments.push({ type: 'text', content: raw.slice(last, m.index) });
    }
    segments.push({ type: 'code', lang: m[1] || 'code', content: m[2].trimEnd() });
    last = m.index + m[0].length;
  }
  if (last < raw.length) {
    segments.push({ type: 'text', content: raw.slice(last) });
  }
  return segments;
}

function renderTextLine(line: string): string {
  if (/^#{1,3}\s/.test(line)) {
    const text = line.replace(/^#+\s+/, '');
    return `\n${text}\n${'═'.repeat(Math.min(text.length, 60))}`;
  }
  if (/^\s*[-*+]\s/.test(line)) return line.replace(/^(\s*)[-*+]\s/, '$1• ');
  if (/^\s*\d+\.\s/.test(line)) return line;
  if (/^[-*_]{3,}$/.test(line.trim())) return '─'.repeat(60);
  return line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/_(.+?)_/g, '$1');
}

// ── CodeBlock component ───────────────────────────────────────────────────────

function CodeBlock({ lang, content, theme }: { lang: string; content: string; theme: ThemeConfig }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const lines = content.split('\n');
  const maxLen = Math.max(...lines.map(l => l.length), lang.length + 4, 20);
  const width = Math.min(maxLen + 4, 100);
  const copyLabel = copied ? '✓ copied' : 'copy';
  // Space for copy button + padding
  const copySpace = copyLabel.length + 3;
  const dashes = Math.max(0, width - lang.length - 4 - copySpace);

  return (
    <div style={{ margin: '6px 0', fontFamily: 'inherit' }}>
      {/* Header: ┌─ lang ──── [copy] ┐ */}
      <div style={{ color: theme.dim, display: 'flex', alignItems: 'center' }}>
        <span>{'┌─ '}</span>
        <span style={{ color: theme.codeLabel }}>{lang}</span>
        <span>{' ' + '─'.repeat(dashes) + ' '}</span>
        <button
          onClick={handleCopy}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: copied ? theme.primary : theme.action,
            fontFamily: 'inherit',
            fontSize: 'inherit',
            lineHeight: 'inherit',
          }}
        >
          [{copyLabel}]
        </button>
        <span>{' ┐'}</span>
      </div>
      {/* Code lines */}
      {lines.map((line, i) => (
        <div key={i}>
          <span style={{ color: theme.dim }}>│ </span>
          <span style={{ color: theme.secondary }}>{line}</span>
        </div>
      ))}
      <div style={{ color: theme.dim }}>{'└' + '─'.repeat(width - 2) + '┘'}</div>
    </div>
  );
}

// ── AssistantOutput component ─────────────────────────────────────────────────

function AssistantOutput({
  content,
  isStreaming,
  theme,
  onTeach,
}: {
  content: string;
  isStreaming: boolean;
  theme: ThemeConfig;
  onTeach?: (content: string) => void;
}) {
  const [cursorOn, setCursorOn] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isStreaming) return;
    const t = setInterval(() => setCursorOn(v => !v), 530);
    return () => clearInterval(t);
  }, [isStreaming]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const segments = parseSegments(content);

  return (
    <div style={{ marginBottom: 12 }}>
      {segments.map((seg, si) => {
        if (seg.type === 'code') {
          return <CodeBlock key={si} lang={seg.lang ?? 'code'} content={seg.content} theme={theme} />;
        }
        return (
          <div key={si}>
            {seg.content.split('\n').map((line, li) => (
              <div
                key={li}
                style={{
                  color: theme.secondary,
                  minHeight: '1.5em',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {renderTextLine(line)}
              </div>
            ))}
          </div>
        );
      })}
      {isStreaming && (
        <span style={{ color: theme.primary, opacity: cursorOn ? 1 : 0 }}>▋</span>
      )}
      {/* Action row — shown only when not streaming */}
      {!isStreaming && content && (
        <div style={{ marginTop: 6, display: 'flex', gap: 12 }}>
          {onTeach && (
            <button
              onClick={() => onTeach(content)}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                color: theme.action, fontFamily: 'inherit', fontSize: '11px',
              }}
            >
              [teach]
            </button>
          )}
          <button
            onClick={handleCopy}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: copied ? theme.primary : theme.action, fontFamily: 'inherit', fontSize: '11px',
            }}
          >
            {copied ? '[✓ copied]' : '[copy]'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface TerminalMessageAreaProps {
  messages: Message[];
  isSending: boolean;
  inputMessage: string;
  setInputMessage: (v: string) => void;
  handleSendMessage: () => void;
  domainName?: string;
  theme?: TerminalTheme;
  onTeach?: (content: string) => void;
  // Attachments
  imageAttachments?: Array<{ file: File; preview: string }>;
  documentAttachments?: Array<{ file: File; name: string; content: string }>;
  onImageSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDocumentSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage?: (index: number) => void;
  onRemoveDocument?: (index: number) => void;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
  documentFileInputRef?: React.RefObject<HTMLInputElement | null>;
}

const MONO: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", "Courier New", monospace',
};

export default function TerminalMessageArea({
  messages,
  isSending,
  inputMessage,
  setInputMessage,
  handleSendMessage,
  domainName = 'Code',
  theme: themeName = 'code',
  onTeach,
  imageAttachments = [],
  documentAttachments = [],
  onImageSelect,
  onDocumentSelect,
  onRemoveImage,
  onRemoveDocument,
  fileInputRef,
  documentFileInputRef,
}: TerminalMessageAreaProps) {
  const theme = THEMES[themeName];
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const [cursorOn, setCursorOn] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setCursorOn(v => !v), 530);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isSending && inputMessage.trim()) handleSendMessage();
    }
  }, [isSending, inputMessage, handleSendMessage]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  }, [setInputMessage]);

  return (
    <div
      style={{
        ...MONO,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: theme.bg,
        overflow: 'hidden',
        backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 1px, ${theme.scanline} 1px, ${theme.scanline} 2px)`,
      }}
    >
      {/* ── Scrollable message area ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 8px' }}>

        {/* Boot header */}
        <div style={{ color: theme.dim, marginBottom: 16, fontSize: '12px' }}>
          <div style={{ color: theme.primary }}>Allerac {domainName} Terminal v1.0</div>
          <div>{theme.bootLabel}</div>
          <div>{'─'.repeat(52)}</div>
        </div>

        {/* Messages */}
        {messages.map((msg, i) => {
          const isLast = i === messages.length - 1;
          const isStreaming = isSending && isLast && msg.role === 'assistant';

          if (msg.role === 'user') {
            const text = typeof msg.content === 'string'
              ? msg.content
              : msg.content.find((c: any) => c.type === 'text')?.text ?? '';
            return (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: theme.primary, flexShrink: 0, marginTop: 1 }}>{'>'}</span>
                  <span style={{ color: theme.primary, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {text}
                  </span>
                </div>
              </div>
            );
          }

          if (msg.role === 'assistant') {
            return (
              <AssistantOutput
                key={i}
                content={typeof msg.content === 'string' ? msg.content : ''}
                isStreaming={isStreaming}
                theme={theme}
                onTeach={onTeach}
              />
            );
          }

          return null;
        })}

        {/* Typing indicator */}
        {isSending && (messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant') && (
          <div style={{ color: theme.primary, opacity: cursorOn ? 1 : 0 }}>▋</div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ── */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${theme.dim}`, background: theme.bg, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>

        {/* Attachment preview strip */}
        {(imageAttachments.length > 0 || documentAttachments.length > 0) && (
          <div style={{ padding: '6px 20px 0', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {imageAttachments.map((img, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <img src={img.preview} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 2, border: `1px solid ${theme.dim}` }} />
                <button
                  onClick={() => onRemoveImage?.(i)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.dim, fontFamily: 'inherit', fontSize: '11px', padding: 0 }}
                >
                  [✕]
                </button>
              </div>
            ))}
            {documentAttachments.map((doc, i) => (
              <span key={i} style={{ color: theme.codeLabel, fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}>
                [{doc.name}
                <button
                  onClick={() => onRemoveDocument?.(i)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.dim, fontFamily: 'inherit', fontSize: '11px', padding: 0 }}
                >
                  ✕
                </button>
                ]
              </span>
            ))}
          </div>
        )}

        {/* Input row */}
        <div style={{ padding: '10px 20px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ color: theme.primary, flexShrink: 0, fontSize: '13px', lineHeight: 1.6, paddingTop: '1px' }}>{'>'}</span>
          <textarea
            ref={inputRef}
            value={inputMessage}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={isSending ? '' : 'type your question...'}
            disabled={isSending}
            rows={1}
            style={{
              ...MONO,
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: theme.primary,
              fontSize: '13px',
              lineHeight: 1.6,
              resize: 'none',
              caretColor: theme.primary,
              padding: 0,
              minHeight: '22px',
              maxHeight: '160px',
              overflowY: 'auto',
            }}
          />
          {/* Attachment buttons */}
          {!isSending && (onImageSelect || onDocumentSelect) && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0, paddingTop: '1px' }}>
              {onImageSelect && (
                <button
                  onClick={() => fileInputRef?.current?.click()}
                  title="Attach image"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.action, fontFamily: 'inherit', fontSize: '11px', padding: 0 }}
                >
                  [img]
                </button>
              )}
              {onDocumentSelect && (
                <button
                  onClick={() => documentFileInputRef?.current?.click()}
                  title="Attach document"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.action, fontFamily: 'inherit', fontSize: '11px', padding: 0 }}
                >
                  [doc]
                </button>
              )}
            </div>
          )}
          {isSending && (
            <span style={{ color: theme.dim, fontSize: '11px', flexShrink: 0, paddingTop: '2px' }}>
              processing...
            </span>
          )}
        </div>
      </div>

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onImageSelect} />
      <input ref={documentFileInputRef} type="file" accept=".txt,.md,.pdf,.csv,.json,.ts,.tsx,.js,.jsx,.py,.html,.css,.xml,.yaml,.yml" multiple style={{ display: 'none' }} onChange={onDocumentSelect} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
        textarea::placeholder { color: ${theme.dim}; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: ${theme.bg}; }
        ::-webkit-scrollbar-thumb { background: ${theme.dim}; border-radius: 2px; }
      `}</style>
    </div>
  );
}

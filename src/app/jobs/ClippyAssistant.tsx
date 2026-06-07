'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { MODELS } from '@/app/services/llm/models';
import type { Message } from '@/app/types';
import ChatMessages from '@/app/components/chat/ChatMessages';
import { AlleracIcon } from '@/app/components/ui/AlleracIcon';
import { saveSelectedModel } from '@/app/actions/user';
import { generateClippyBubble } from '@/app/actions/clippy';

// ── Stapler SVG ───────────────────────────────────────────────────────────────
// Closed: grampeador isométrico Win95
// Open:   os dois braços formam o A do Allerac

function StaplerSVG({ isOpen, pressed, hovered }: { isOpen: boolean; pressed: boolean; hovered: boolean }) {
  return (
    <svg viewBox="0 0 72 62" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ width: 80, height: 68, display: 'block', filter: pressed ? 'brightness(0.85)' : undefined }}>

      {/* ── FECHADO — espelhado: hinge à esquerda, boca à direita ── */}
      <g style={{ opacity: isOpen ? 0 : 1, transition: 'opacity 0.22s ease' }}
         transform="scale(-1,1) translate(-72,0)">

        {/* Sombra */}
        <ellipse cx="32" cy="59" rx="28" ry="3" fill="rgba(0,0,0,0.22)"/>

        {/* BASE — topo (isométrico) */}
        <polygon points="4,34 58,34 64,28 10,28" fill="#d4d0cc"/>
        {/* BASE — frente */}
        <rect x="4" y="34" width="54" height="13" fill="#c0c0c0"/>
        {/* BASE — lado direito */}
        <polygon points="58,34 64,28 64,41 58,47" fill="#888"/>
        {/* BASE — contorno */}
        <polygon points="4,28 10,28 64,28 64,41 58,47 4,47"
          fill="none" stroke="#111" strokeWidth="1.5" strokeLinejoin="round"/>
        <line x1="4"  y1="34" x2="58" y2="34" stroke="#111" strokeWidth="1"/>
        <line x1="58" y1="34" x2="64" y2="28" stroke="#111" strokeWidth="1"/>
        {/* BASE — highlights */}
        <line x1="4"  y1="28" x2="64" y2="28" stroke="white" strokeWidth="1.5"/>
        <line x1="4"  y1="28" x2="4"  y2="47" stroke="white" strokeWidth="1.5"/>
        <line x1="4"  y1="47" x2="58" y2="47" stroke="#555"  strokeWidth="1"/>
        {/* Slot de agrafos */}
        <rect x="16" y="45" width="22" height="2" rx="1" fill="#777"/>
        <rect x="16" y="45" width="22" height="1" rx="1" fill="#aaa"/>

        {/* HINGE strip */}
        <rect x="4" y="28" width="54" height="6" fill="#a8a8a8"/>
        <line x1="4"  y1="28" x2="58" y2="28" stroke="white" strokeWidth="1"/>
        <line x1="4"  y1="34" x2="58" y2="34" stroke="#666"  strokeWidth="1"/>
        <rect x="4" y="28" width="54" height="6" fill="none" stroke="#111" strokeWidth="1"/>
        {/* Rebites laterais */}
        <circle cx="12" cy="31" r="2.5" fill="#707070" stroke="#444" strokeWidth="0.5"/>
        <circle cx="12" cy="30.4" r="0.8" fill="#bbb"/>
        <circle cx="50" cy="31" r="2.5" fill="#707070" stroke="#444" strokeWidth="0.5"/>
        <circle cx="50" cy="30.4" r="0.8" fill="#bbb"/>
        {/* Hinge pivot — círculo indigo no fundo direito (igual ao estado aberto) */}
        <circle cx="62" cy="31" r="5" fill="#4338ca" stroke="#111" strokeWidth="1.5"/>
        <circle cx="61" cy="30" r="1.6" fill="white" opacity="0.65"/>

        {/* BRAÇO SUPERIOR — topo */}
        <polygon points="6,14 58,14 64,8 12,8" fill="#dddad5"/>
        {/* BRAÇO — frente */}
        <rect x="6" y="14" width="52" height="14" fill="#cacaca"/>
        {/* BRAÇO — lado direito */}
        <polygon points="58,14 64,8 64,22 58,28" fill="#909090"/>
        {/* BRAÇO — contorno */}
        <polygon points="6,8 12,8 64,8 64,22 58,28 6,28"
          fill="none" stroke="#111" strokeWidth="1.5" strokeLinejoin="round"/>
        <line x1="6"  y1="14" x2="58" y2="14" stroke="#111" strokeWidth="1"/>
        <line x1="58" y1="14" x2="64" y2="8"  stroke="#111" strokeWidth="1"/>
        {/* BRAÇO — highlights */}
        <line x1="6"  y1="8"  x2="64" y2="8"  stroke="white" strokeWidth="1.5"/>
        <line x1="6"  y1="8"  x2="6"  y2="28" stroke="white" strokeWidth="1.5"/>
        <line x1="6"  y1="28" x2="58" y2="28" stroke="#555"  strokeWidth="1"/>
        <line x1="58" y1="28" x2="64" y2="22" stroke="#555"  strokeWidth="1"/>
        {/* Label bump */}
        <rect x="20" y="12" width="24" height="4" rx="1" fill="#b8b8b8" stroke="#999" strokeWidth="0.5"/>

        {/* ── Olhos na face frontal do braço superior ── */}
        <g className="clippy-blink">
          <circle cx="20" cy="21" r="3.5" fill="white" stroke="#33333355" strokeWidth="0.5"/>
          <circle cx="20" cy="21" r="2.2" fill="#1a1066"/>
          <circle cx="18.8" cy="19.8" r="0.9" fill="white"/>
        </g>
        <g className="clippy-blink">
          <circle cx="44" cy="21" r="3.5" fill="white" stroke="#33333355" strokeWidth="0.5"/>
          <circle cx="44" cy="21" r="2.2" fill="#1a1066"/>
          <circle cx="42.8" cy="19.8" r="0.9" fill="white"/>
        </g>
        {/* Boca — na base, um pouco acima do centro */}
        <path d={hovered ? "M 14,38 Q 32,44 50,38" : "M 18,38 Q 32,43 46,38"}
          stroke="#55555599" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
      </g>

      {/* ── ABERTO — forma o A do Allerac ───────────────────── */}
      <g style={{ opacity: isOpen ? 1 : 0, transition: 'opacity 0.22s ease' }}>

        {/* Braço esquerdo */}
        <polygon points="4,60 16,60 38,4 30,4" fill="#c8c8c8"/>
        <polygon points="4,60 7,60 32,4 30,4"   fill="#e2e0dc"/>
        <polygon points="13,60 16,60 38,4 35,4"  fill="#909090"/>
        <polygon points="4,60 16,60 38,4 30,4"
          fill="none" stroke="#111" strokeWidth="1.5" strokeLinejoin="round"/>
        <line x1="4"  y1="60" x2="30" y2="4" stroke="white" strokeWidth="1"/>
        <line x1="16" y1="60" x2="38" y2="4" stroke="#555"  strokeWidth="1"/>

        {/* Braço direito */}
        <polygon points="34,4 42,4 68,60 56,60" fill="#c8c8c8"/>
        <polygon points="34,4 37,4 62,60 56,60"  fill="#e2e0dc"/>
        <polygon points="39,4 42,4 68,60 65,60"  fill="#909090"/>
        <polygon points="34,4 42,4 68,60 56,60"
          fill="none" stroke="#111" strokeWidth="1.5" strokeLinejoin="round"/>
        <line x1="34" y1="4"  x2="56" y2="60" stroke="white" strokeWidth="1"/>
        <line x1="42" y1="4"  x2="68" y2="60" stroke="#555"  strokeWidth="1"/>

        {/* Hinge — ponto no topo */}
        <circle cx="36" cy="8" r="6" fill="#4338ca" stroke="#111" strokeWidth="1.5"/>
        <circle cx="35" cy="7" r="2"  fill="white" opacity="0.65"/>

        {/* ── Olhos — mais próximos e acima ── */}
        <g className="clippy-blink">
          <circle cx="27" cy="24" r="4.5" fill="white" stroke="#33333355" strokeWidth="0.5"/>
          <circle cx="27" cy="24" r="2.8" fill="#1a1066"/>
          <circle cx="25.5" cy="22.5" r="1.1" fill="white"/>
        </g>
        <g className="clippy-blink">
          <circle cx="45" cy="24" r="4.5" fill="white" stroke="#33333355" strokeWidth="0.5"/>
          <circle cx="45" cy="24" r="2.8" fill="#1a1066"/>
          <circle cx="43.5" cy="22.5" r="1.1" fill="white"/>
        </g>
        {/* Boca — sorriso */}
        <path d="M 18,41 Q 36,50 54,41"
          stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        <path d="M 18,41 Q 36,50 54,41"
          stroke="#1a1066" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.4"/>
      </g>

    </svg>
  );
}

// ── Win95 styles ──────────────────────────────────────────────────────────────

const W95 = {
  raised: '#ffffff #808080 #808080 #ffffff' as const,
  inset:  '#808080 #ffffff #ffffff #808080' as const,
  pressed: '#808080 #ffffff #ffffff #808080' as const,
};

// ── ClippyAssistant ───────────────────────────────────────────────────────────

interface Props {
  userId: string;
  defaultSkillName?: string;
  displayName?: string;
  githubToken?: string;
  bottomOffset?: number;
}

export default function ClippyAssistant({ userId, defaultSkillName, displayName, githubToken = '', bottomOffset = 24 }: Props) {
  const locale = useLocale();
  const t = useTranslations('grampeador');

  const BUBBLES = [t('fallback0'), t('fallback1'), t('fallback2'), t('fallback3')];
  const [isOpen, setIsOpen]     = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [bubble, setBubble]     = useState<string | null>(BUBBLES[Math.floor(Math.random() * BUBBLES.length)]);
  const [messages, setMessages] = useState<Array<{ role: string; content: string; timestamp: Date; responseTime?: number }>>([]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const [convId, setConvId]     = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('selected_model') || 'gemini-2.5-flash' : 'gemini-2.5-flash'
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const windowRef      = useRef<HTMLDivElement>(null);

  // LLM-generated bubble (pre-generated, updated every 60s)
  const generatedRef = useRef<string>(BUBBLES[Math.floor(Math.random() * BUBBLES.length)]);

  const refreshBubble = useCallback(async () => {
    const result = await generateClippyBubble('jobs', locale);
    if (result) generatedRef.current = result;
  }, [locale]);

  // Generate on mount (silent, no loading state)
  useEffect(() => { refreshBubble(); }, [refreshBubble]);

  // Rotate every 60s in background
  useEffect(() => {
    const id = setInterval(refreshBubble, 60000);
    return () => clearInterval(id);
  }, [refreshBubble]);

  // Show initial bubble for 5s
  useEffect(() => {
    const t = setTimeout(() => setBubble(null), 5000);
    return () => clearTimeout(t);
  }, []);

  // Idle bubble every ~40s using the current generated phrase
  useEffect(() => {
    if (isOpen) return;
    const t = setInterval(() => {
      setBubble(generatedRef.current);
      setTimeout(() => setBubble(null), 5000);
    }, 40000);
    return () => clearInterval(t);
  }, [isOpen]);

  // Focus input when window opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [isOpen]);

  // Fechar ao clicar fora da janela ou pressionar Esc
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const handleClick = (e: MouseEvent) => {
      if (windowRef.current && !windowRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [isOpen]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    const requestStart = Date.now();

    setMessages(prev => [
      ...prev,
      { role: 'user', content: text, timestamp: new Date() },
      { role: 'assistant', content: '', timestamp: new Date() },
    ]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId: convId,
          model: selectedModel,
          provider: MODELS.find(m => m.id === selectedModel)?.provider || 'ollama',
          defaultSkillName,
          domain: 'jobs',
        }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: any;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === 'token') {
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: last.content + event.content };
              return msgs;
            });
          } else if (event.type === 'done') {
            const elapsed = Date.now() - requestStart;
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, responseTime: elapsed };
              return msgs;
            });
            if (event.conversationId) setConvId(event.conversationId);
          } else if (event.type === 'error') {
            setMessages(prev => {
              const msgs = [...prev];
              msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: `Erro: ${event.message}` };
              return msgs;
            });
          }
        }
      }
    } catch (err: any) {
      setMessages(prev => {
        const msgs = [...prev];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: `Erro: ${err.message}` };
        return msgs;
      });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, convId, selectedModel, defaultSkillName]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const toggleOpen = () => {
    setBubble(null);
    setIsOpen(v => !v);
  };

  return (
    <div ref={windowRef} style={{ position: 'fixed', bottom: bottomOffset, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>

      {/* ── Win95 chat window ── */}
      {isOpen && (
        <div className="clippy-window" style={{
          width: 'clamp(340px, 38vw, 620px)',
          maxWidth: 'calc(100vw - 32px)',
          height: 'clamp(460px, 70vh, 820px)',
          maxHeight: 'calc(100svh - 110px)',
          background: '#c0c0c0',
          border: '2px solid',
          borderColor: W95.raised,
          boxShadow: '4px 4px 0 #000000',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: '"MS Sans Serif", "Segoe UI", Arial, sans-serif',
          fontSize: 11,
        }}>
          {/* Title bar */}
          <div style={{
            background: 'linear-gradient(to right, #4338ca, #6366f1)',
            padding: '3px 4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            userSelect: 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlleracIcon size={16} />
              <span style={{ color: 'white', fontSize: 11, fontWeight: 'bold' }}>{t('title')}</span>
            </div>
            <div style={{ display: 'flex', gap: 2 }}>
              <button
                onClick={() => { setIsOpen(false); }}
                style={{
                  width: 16, height: 14, background: '#c0c0c0',
                  border: '1px solid', borderColor: W95.raised,
                  fontSize: 9, fontWeight: 'bold', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#000', padding: 0, lineHeight: 1,
                }}
              >✕</button>
            </div>
          </div>

          {/* Messages — reset font to app defaults, isolado do fontSize: 11 do Win95 wrapper */}
          <div style={{
            flex: 1,
            background: 'white',
            margin: '3px 3px 0 3px',
            border: '1px solid',
            borderColor: W95.inset,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            fontSize: '15px',
            fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, sans-serif',
          }}>
            {messages.length === 0 ? (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                color: '#808080', textAlign: 'center', padding: 16,
              }}>
                <div style={{ marginBottom: 12 }}><AlleracIcon size={48} /></div>
                <div style={{ fontWeight: 'bold', color: '#000', marginBottom: 4 }}>
                  {displayName ? t('greeting', { name: `, ${displayName}` }) : t('greetingNoName')}
                </div>
                <div>{t('helpPrompt')}</div>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <ChatMessages
                  messages={messages as unknown as Message[]}
                  isSending={sending}
                  selectedModel={selectedModel}
                  MODELS={MODELS}
                  isDarkMode={false}
                  currentConversationId={convId}
                  userId={userId}
                  githubToken={githubToken}
                  messagesEndRef={messagesEndRef}
                  domainSlug="jobs"
                />
              </div>
            )}
          </div>

          {/* Input area — textarea + botões integrados */}
          <div style={{ padding: '3px', flexShrink: 0 }}>
            <div style={{
              border: '2px solid',
              borderColor: W95.inset,
              background: 'white',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={t('placeholder')}
                disabled={sending}
                rows={3}
                style={{
                  resize: 'none',
                  border: 'none',
                  outline: 'none',
                  padding: '6px 8px 2px 8px',
                  fontSize: '14px',
                  fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, sans-serif',
                  background: 'white',
                  color: '#000',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
              {/* Bottom toolbar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 6px',
                background: 'white',
              }}>
                {/* Left icons */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {/* Attach */}
                  <button disabled style={{
                    width: 22, height: 22,
                    background: '#c0c0c0',
                    border: '2px solid', borderColor: W95.raised,
                    cursor: 'not-allowed', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    opacity: 0.6, padding: 0,
                  }} title={t('attach')}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                    </svg>
                  </button>
                  {/* Image */}
                  <button disabled style={{
                    width: 22, height: 22,
                    background: '#c0c0c0',
                    border: '2px solid', borderColor: W95.raised,
                    cursor: 'not-allowed', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    opacity: 0.6, padding: 0,
                  }} title={t('image')}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </button>
                </div>

                {/* Send button — ↑ arrow */}
                <button
                  onClick={send}
                  disabled={sending || !input.trim()}
                  style={{
                    width: 26, height: 26,
                    background: input.trim() && !sending ? '#6366f1' : '#c0c0c0',
                    border: '2px solid',
                    borderColor: input.trim() && !sending ? '#818cf8 #4338ca #4338ca #818cf8' : W95.raised,
                    cursor: input.trim() && !sending ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 0,
                    opacity: sending ? 0.5 : 1,
                  }}
                  title={t('send')}
                >
                  {sending ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? 'white' : '#808080'} strokeWidth="3" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10" strokeDasharray="40 20" strokeDashoffset="0">
                        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                      </circle>
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? 'white' : '#808080'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Speech bubble ── */}
      {bubble && !isOpen && (
        <div
          onClick={() => { setBubble(null); setIsOpen(true); }}
          style={{
            background: '#e8e8e8',
            border: '1px solid #808080',
            padding: '6px 10px',
            fontSize: 11,
            fontFamily: '"MS Sans Serif", "Segoe UI", Arial, sans-serif',
            color: '#111',
            maxWidth: 200,
            boxShadow: '2px 2px 0 #808080',
            cursor: 'pointer',
            position: 'relative',
          }}
        >
          {bubble}
          {/* Bubble tail */}
          <div style={{
            position: 'absolute', bottom: -9, right: 22,
            width: 0, height: 0,
            borderLeft: '9px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '9px solid #808080',
          }} />
          <div style={{
            position: 'absolute', bottom: -7, right: 23,
            width: 0, height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: '8px solid #ffffc0',
          }} />
        </div>
      )}

      {/* ── Stapler button — transparente, só o SVG flutua ── */}
      <button
        onClick={toggleOpen}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onMouseEnter={() => { setHovered(true); if (!isOpen) setBubble(generatedRef.current); }}
        onMouseLeave={() => { setPressed(false); setHovered(false); setBubble(null); }}
        title={t('title')}
        className={!isOpen && !pressed ? 'clippy-idle' : ''}
        style={{
          background: 'none',
          border: 'none',
          padding: '8px',
          margin: '-8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.75 : 1,
          transition: 'opacity 0.1s, filter 0.2s',
          filter: hovered && !isOpen
            ? 'drop-shadow(0 4px 12px rgba(99,102,241,0.7)) drop-shadow(0 0 6px rgba(99,102,241,0.4))'
            : 'drop-shadow(2px 4px 6px rgba(0,0,0,0.5))',
        }}
      >
        <StaplerSVG isOpen={isOpen} pressed={pressed} hovered={hovered && !isOpen} />
      </button>

    </div>
  );
}

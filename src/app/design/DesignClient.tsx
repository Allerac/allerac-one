'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MODELS } from '@/app/services/llm/models';

// ─── types ────────────────────────────────────────────────────────────────────

type ElementType = 'rect' | 'circle' | 'arrow' | 'text' | 'line' | 'diamond';

interface CanvasElement {
  id: string;
  type: ElementType;
  x?: number; y?: number; width?: number; height?: number;
  cx?: number; cy?: number; r?: number;
  x1?: number; y1?: number; x2?: number; y2?: number;
  label?: string;
  fill?: string; stroke?: string; strokeWidth?: number;
  fontSize?: number; bold?: boolean;
  color?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ─── theme ────────────────────────────────────────────────────────────────────

const DARK = {
  bg: '#1e1e2e', surface: '#2a2a3e', border: '#3a3a5c',
  text: '#cdd6f4', textMuted: '#a6adc8', textFaint: '#6c7086',
  canvas: '#181825', canvasGrid: '#2a2a3e',
  input: '#313244', btnPrimary: '#89b4fa', btnText: '#1e1e2e',
  msgUser: '#313244', msgAssistant: '#2a2a3e',
  elementFill: '#313244', elementStroke: '#89b4fa',
  scrollbar: '#45475a',
};

const LIGHT = {
  bg: '#f8f8fc', surface: '#ffffff', border: '#e0e0ef',
  text: '#1e1e2e', textMuted: '#5c5f77', textFaint: '#9ca3af',
  canvas: '#ffffff', canvasGrid: '#f0f0f8',
  input: '#f0f0f8', btnPrimary: '#4f46e5', btnText: '#ffffff',
  msgUser: '#eff6ff', msgAssistant: '#f8f8fc',
  elementFill: '#f0f0f8', elementStroke: '#4f46e5',
  scrollbar: '#d1d5db',
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseCanvasBlocks(text: string): { clean: string; elements: CanvasElement[] | null } {
  const match = text.match(/<canvas>([\s\S]*?)<\/canvas>/);
  if (!match) return { clean: text, elements: null };

  const clean = text.replace(/<canvas>[\s\S]*?<\/canvas>/g, '').trim();
  try {
    const parsed = JSON.parse(match[1].trim());
    const elements = (parsed.elements || []).map((el: any, i: number) => ({
      id: el.id || `el-${Date.now()}-${i}`,
      ...el,
    }));
    return { clean, elements };
  } catch {
    return { clean, elements: null };
  }
}

function arrowPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1; const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return '';
  const ux = dx / len; const uy = dy / len;
  const ax = x2 - ux * 12; const ay = y2 - uy * 12;
  const px = -uy * 5; const py = ux * 5;
  return `M${x1},${y1} L${x2},${y2} M${ax + px},${ay + py} L${x2},${y2} L${ax - px},${ay - py}`;
}

// ─── main component ───────────────────────────────────────────────────────────

export default function DesignClient({ userId }: { userId: string }) {
  const [isDark, setIsDark] = useState(true);
  const t = isDark ? DARK : LIGHT;

  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [codeValue, setCodeValue] = useState('[]');

  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Canvas ready. Describe what you want to draw — shapes, arrows, diagrams, wireframes.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('qwen2.5:3b');

  useEffect(() => {
    const saved = localStorage.getItem('selected_model');
    if (saved) setSelectedModel(saved);
  }, []);

  useEffect(() => {
    if (viewMode === 'preview') return; // don't overwrite while user is editing code
    setCodeValue(JSON.stringify(elements, null, 2));
  }, [elements]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchToCode = () => {
    setCodeValue(JSON.stringify(elements, null, 2));
    setViewMode('code');
  };

  const switchToPreview = () => {
    try {
      const parsed = JSON.parse(codeValue);
      const arr: any[] = Array.isArray(parsed) ? parsed : (parsed.elements ?? []);
      setElements(arr.map((el: any, i: number) => ({ id: el.id || `el-${Date.now()}-${i}`, ...el })));
    } catch { /* invalid JSON — keep current elements */ }
    setViewMode('preview');
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── send message ──────────────────────────────────────────────────────────

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);

    const canvasRect = svgRef.current?.getBoundingClientRect();
    const canvasW = canvasRect ? Math.round(canvasRect.width) : 800;
    const canvasH = canvasRect ? Math.round(canvasRect.height) : 600;
    const postContext = `Canvas dimensions: ${canvasW}×${canvasH}px. Use these exact pixel dimensions when positioning and centering elements in draw_canvas.`;

    setMessages(prev => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '' },
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
          defaultSkillName: 'design',
          domain: 'design',
          postContext,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

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

          if (event.type === 'tool_call' && event.name === 'draw_canvas') {
            const { elements: newEls, mode } = event.args ?? {};
            if (Array.isArray(newEls)) {
              const tagged: CanvasElement[] = newEls.map((el: any, i: number) => ({
                id: el.id || `el-${Date.now()}-${i}`,
                ...el,
              }));
              if (mode === 'append') {
                setElements(prev => [...prev, ...tagged]);
              } else {
                setElements(tagged);
              }
            }
          } else if (event.type === 'token') {
            fullContent += event.content;

            // Update the chat message with clean text (strip any legacy <canvas> blocks)
            const { clean } = parseCanvasBlocks(fullContent);
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: clean };
              return msgs;
            });

            // Fallback: if model outputs a <canvas> block in text, render it
            if (fullContent.includes('</canvas>')) {
              const { elements: parsed } = parseCanvasBlocks(fullContent);
              if (parsed) setElements(parsed);
            }
          } else if (event.type === 'done') {
            if (event.conversationId) setConvId(event.conversationId);
          } else if (event.type === 'error') {
            setMessages(prev => {
              const msgs = [...prev];
              msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: `Error: ${event.message}` };
              return msgs;
            });
          }
        }
      }
    } catch (err: any) {
      setMessages(prev => {
        const msgs = [...prev];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: `Error: ${err.message}` };
        return msgs;
      });
    } finally {
      setLoading(false);
    }
  }, [input, loading, convId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // ── render element ────────────────────────────────────────────────────────

  const renderElement = (el: CanvasElement) => {
    const isSelected = selected === el.id;
    const stroke = el.stroke || t.elementStroke;
    const fill = el.fill || (el.type === 'text' ? 'transparent' : t.elementFill);
    const sw = el.strokeWidth ?? 1.5;
    const selectionGlow = isSelected ? { filter: 'drop-shadow(0 0 4px #89b4fa)' } : {};

    const label = el.label ? (
      <text
        x={el.type === 'circle' ? el.cx : (el.x ?? 0) + (el.width ?? 0) / 2}
        y={el.type === 'circle' ? (el.cy ?? 0) + 5 : (el.y ?? 0) + (el.height ?? 0) / 2 + 5}
        textAnchor="middle"
        fontSize={el.fontSize ?? 13}
        fill={isDark ? '#cdd6f4' : '#1e1e2e'}
        fontWeight={el.bold ? 'bold' : 'normal'}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {el.label}
      </text>
    ) : null;

    const onClick = (e: React.MouseEvent) => { e.stopPropagation(); setSelected(el.id); };

    switch (el.type) {
      case 'rect':
        return (
          <g key={el.id} style={selectionGlow} onClick={onClick}>
            <rect x={el.x} y={el.y} width={el.width ?? 120} height={el.height ?? 60}
              rx={6} fill={fill} stroke={stroke} strokeWidth={sw} style={{ cursor: 'pointer' }} />
            {label}
          </g>
        );

      case 'circle':
        return (
          <g key={el.id} style={selectionGlow} onClick={onClick}>
            <circle cx={el.cx} cy={el.cy} r={el.r ?? 50}
              fill={fill} stroke={stroke} strokeWidth={sw} style={{ cursor: 'pointer' }} />
            {label}
          </g>
        );

      case 'diamond':
        const cx = (el.cx ?? el.x ?? 0) + (el.width ? el.width / 2 : 0);
        const cy = (el.cy ?? el.y ?? 0) + (el.height ? el.height / 2 : 0);
        const hw = (el.width ?? 100) / 2; const hh = (el.height ?? 60) / 2;
        const pts = `${cx},${cy - hh} ${cx + hw},${cy} ${cx},${cy + hh} ${cx - hw},${cy}`;
        return (
          <g key={el.id} style={selectionGlow} onClick={onClick}>
            <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} style={{ cursor: 'pointer' }} />
            {el.label && <text x={cx} y={cy + 5} textAnchor="middle" fontSize={el.fontSize ?? 13}
              fill={isDark ? '#cdd6f4' : '#1e1e2e'} style={{ pointerEvents: 'none', userSelect: 'none' }}>
              {el.label}
            </text>}
          </g>
        );

      case 'arrow':
        return (
          <g key={el.id} style={selectionGlow} onClick={onClick}>
            <path d={arrowPath(el.x1 ?? 0, el.y1 ?? 0, el.x2 ?? 100, el.y2 ?? 0)}
              stroke={el.color || stroke} strokeWidth={sw} fill="none"
              strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'pointer' }} />
            {el.label && (
              <text x={((el.x1 ?? 0) + (el.x2 ?? 100)) / 2}
                y={((el.y1 ?? 0) + (el.y2 ?? 0)) / 2 - 8}
                textAnchor="middle" fontSize={11}
                fill={isDark ? '#a6adc8' : '#5c5f77'}
                style={{ pointerEvents: 'none', userSelect: 'none' }}>
                {el.label}
              </text>
            )}
          </g>
        );

      case 'line':
        return (
          <line key={el.id} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
            stroke={el.color || stroke} strokeWidth={sw}
            strokeLinecap="round" style={{ cursor: 'pointer', ...selectionGlow }}
            onClick={onClick} />
        );

      case 'text':
        return (
          <text key={el.id} x={el.x ?? 100} y={el.y ?? 100}
            fontSize={el.fontSize ?? 14} fill={el.color || (isDark ? '#cdd6f4' : '#1e1e2e')}
            fontWeight={el.bold ? 'bold' : 'normal'}
            style={{ cursor: 'pointer', userSelect: 'none', ...selectionGlow }}
            onClick={onClick}>
            {el.label}
          </text>
        );

      default:
        return null;
    }
  };

  // ── grid pattern ──────────────────────────────────────────────────────────

  const gridId = 'design-grid';

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', height: '100dvh', background: t.bg, color: t.text, fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── canvas area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

        {/* toolbar */}
        <div style={{ height: 44, borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', background: t.surface, flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: t.text, marginRight: 8 }}>🎨 Design Canvas</span>

          {/* preview / code toggle */}
          <div style={{ display: 'flex', border: `1px solid ${t.border}`, borderRadius: 6, overflow: 'hidden' }}>
            {(['preview', 'code'] as const).map(mode => (
              <button
                key={mode}
                onClick={mode === 'preview' ? switchToPreview : switchToCode}
                style={{
                  padding: '3px 12px', fontSize: 11, border: 'none', cursor: 'pointer',
                  background: viewMode === mode ? t.btnPrimary : 'transparent',
                  color: viewMode === mode ? t.btnText : t.textMuted,
                  fontWeight: viewMode === mode ? 600 : 400,
                  textTransform: 'capitalize',
                }}>
                {mode}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />
          <button
            onClick={() => { setElements([]); setSelected(null); setCodeValue('[]'); }}
            style={{ padding: '4px 10px', fontSize: 11, borderRadius: 5, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, cursor: 'pointer' }}>
            Clear
          </button>
          <button
            onClick={() => setIsDark(d => !d)}
            style={{ padding: '4px 10px', fontSize: 11, borderRadius: 5, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, cursor: 'pointer' }}>
            {isDark ? '☀ Light' : '🌙 Dark'}
          </button>
        </div>

        {/* svg canvas — hidden in code mode but keep mounted so svgRef stays valid */}
        <svg
          ref={svgRef}
          style={{ flex: 1, background: t.canvas, cursor: 'default', display: viewMode === 'preview' ? undefined : 'none' }}
          onClick={() => setSelected(null)}
        >
          <defs>
            <pattern id={gridId} width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke={t.canvasGrid} strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${gridId})`} />
          {elements.map(renderElement)}
        </svg>

        {/* code editor */}
        {viewMode === 'code' && (
          <textarea
            value={codeValue}
            onChange={e => setCodeValue(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1, resize: 'none', background: t.canvas, color: t.text,
              border: 'none', outline: 'none', padding: 20,
              fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
              fontSize: 12, lineHeight: 1.7, tabSize: 2,
            }}
          />
        )}

        {viewMode === 'preview' && elements.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', top: 44 }}>
            <div style={{ textAlign: 'center', color: t.textFaint }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎨</div>
              <div style={{ fontSize: 13 }}>Describe what to draw in the chat</div>
              <div style={{ fontSize: 11, marginTop: 6, color: t.textFaint }}>
                "draw a login form wireframe" · "create a component diagram"
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── chat panel ── */}
      <div style={{ width: 340, borderLeft: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', background: t.surface }}>

        {/* header */}
        <div style={{ height: 44, borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: t.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>Assistant</span>
        </div>

        {/* messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '90%',
              background: msg.role === 'user' ? t.msgUser : t.msgAssistant,
              border: `1px solid ${t.border}`,
              borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              padding: '8px 12px',
              fontSize: 12,
              lineHeight: 1.6,
              color: t.text,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {msg.content || (msg.role === 'assistant' && loading && i === messages.length - 1
                ? <span style={{ color: t.textFaint }}>drawing…</span>
                : null)}
            </div>
          ))}
          <div ref={messagesEndRef} style={{ height: 12 }} />
        </div>

        {/* input */}
        <div style={{ padding: 12, borderTop: `1px solid ${t.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="Describe what to draw…"
              rows={2}
              style={{
                flex: 1, resize: 'none', background: t.input, border: `1px solid ${t.border}`,
                borderRadius: 8, padding: '8px 10px', fontSize: 12, color: t.text,
                outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                padding: '8px 14px', borderRadius: 8, border: 'none',
                background: loading || !input.trim() ? t.border : t.btnPrimary,
                color: loading || !input.trim() ? t.textFaint : t.btnText,
                cursor: loading || !input.trim() ? 'default' : 'pointer',
                fontSize: 14, fontWeight: 600, flexShrink: 0,
              }}
            >
              ↑
            </button>
          </div>
          <div style={{ fontSize: 10, color: t.textFaint, marginTop: 6 }}>
            Enter to send · Shift+Enter new line
          </div>
        </div>
      </div>
    </div>
  );
}

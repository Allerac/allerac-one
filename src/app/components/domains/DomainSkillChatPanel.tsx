'use client';

import { useState, useRef, useEffect } from 'react';
import { MODELS } from '@/app/services/llm/models';

interface ProposedChange {
  old: string;
  new: string;
  rationale: string;
  approved: boolean;
}

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  changes?: ProposedChange[];
  skipped?: number;
}

interface Props {
  skillId: string;
  skillName: string;
  domainSlug: string;
  defaultModelId: string | null;
  isDark: boolean;
  onApplied: (updatedContent: string) => void;
}

export default function DomainSkillChatPanel({ skillId, skillName, domainSlug, defaultModelId, isDark: d, onApplied }: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [applyingTurn, setApplyingTurn] = useState<number | null>(null);
  const [modelId, setModelId] = useState(defaultModelId ?? MODELS[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTurns([]);
    setError(null);
  }, [skillId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  const send = async () => {
    const message = input.trim();
    if (!message || sending) return;
    const model = MODELS.find(m => m.id === modelId);
    if (!model) return;

    setInput('');
    setError(null);
    const history = turns.map(t => ({ role: t.role, content: t.content }));
    const nextTurns = [...turns, { role: 'user' as const, content: message }];
    setTurns(nextTurns);
    setSending(true);

    try {
      const res = await fetch('/api/domains/skill-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillId, domainSlug, model: model.id, provider: model.provider, history, message,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      setTurns(prev => [...prev, {
        role: 'assistant',
        content: data.reply,
        changes: (data.changes ?? []).map((c: { old: string; new: string; rationale: string }) => ({ ...c, approved: true })),
        skipped: data.skipped ?? 0,
      }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setTurns(prev => prev.slice(0, -1));
      setInput(message);
    } finally {
      setSending(false);
    }
  };

  const toggleChange = (turnIndex: number, changeIndex: number) => {
    setTurns(prev => prev.map((t, i) => i !== turnIndex ? t : {
      ...t,
      changes: t.changes?.map((c, j) => j === changeIndex ? { ...c, approved: !c.approved } : c),
    }));
  };

  const applyTurn = async (turnIndex: number) => {
    const turn = turns[turnIndex];
    const approved = turn.changes?.filter(c => c.approved) ?? [];
    if (approved.length === 0) return;
    setApplyingTurn(turnIndex);
    setError(null);
    try {
      const res = await fetch('/api/domains/skill-chat/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId, changes: approved.map(({ old, new: next, rationale }) => ({ old, new: next, rationale })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Apply failed');
      onApplied(data.updatedContent);
      setTurns(prev => prev.map((t, i) => i !== turnIndex ? t : { ...t, changes: [] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setApplyingTurn(null);
    }
  };

  return (
    <div className={`flex flex-col h-full ${d ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className={`px-4 py-3 border-b flex items-center justify-between flex-shrink-0 ${d ? 'border-gray-700' : 'border-gray-200'}`}>
        <div>
          <h3 className={`text-sm font-semibold ${d ? 'text-gray-100' : 'text-gray-900'}`}>Skill Assistant</h3>
          <p className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>Improving: {skillName}</p>
        </div>
        <select
          value={modelId}
          onChange={e => setModelId(e.target.value)}
          className={`text-xs px-2 py-1 rounded border ${d ? 'border-gray-600 bg-gray-800 text-gray-200' : 'border-gray-300 bg-white text-gray-700'}`}
        >
          {MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {turns.length === 0 && (
          <p className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>
            Describe what you&rsquo;d like to change about this skill&rsquo;s behavior — tone, rules, format — and I&rsquo;ll propose targeted edits to its system prompt for you to review.
          </p>
        )}
        {turns.map((turn, i) => (
          <div key={i} className={`flex flex-col gap-2 ${turn.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[90%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
              turn.role === 'user'
                ? 'bg-indigo-600 text-white'
                : d ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900 border border-gray-200'
            }`}>
              {turn.content}
            </div>

            {turn.changes && turn.changes.length > 0 && (
              <div className="w-full flex flex-col gap-2">
                <span className={`text-[10px] uppercase tracking-wide ${d ? 'text-gray-500' : 'text-gray-400'}`}>
                  Proposed changes — {turn.changes.filter(c => c.approved).length}/{turn.changes.length} approved
                  {!!turn.skipped && ` · ${turn.skipped} skipped (no longer matched)`}
                </span>
                {turn.changes.map((change, j) => (
                  <div key={j} className={`border rounded-lg overflow-hidden ${change.approved ? (d ? 'border-gray-600' : 'border-gray-300') : (d ? 'border-gray-800' : 'border-gray-100')}`} style={{ opacity: change.approved ? 1 : 0.5 }}>
                    <div className={`px-2.5 py-1.5 flex items-center gap-2 ${d ? 'bg-gray-800' : 'bg-gray-100'}`}>
                      <button
                        onClick={() => toggleChange(i, j)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          change.approved
                            ? 'bg-green-900/40 text-green-400 border border-green-700'
                            : d ? 'bg-gray-700 text-gray-400 border border-gray-600' : 'bg-gray-200 text-gray-500 border border-gray-300'
                        }`}
                      >
                        {change.approved ? '✓ approved' : '○ skipped'}
                      </button>
                      <span className={`text-[11px] flex-1 ${d ? 'text-gray-400' : 'text-gray-500'}`}>{change.rationale}</span>
                    </div>
                    <div className="px-2.5 py-1.5 bg-red-950/30 border-t border-black/10">
                      <pre className="text-[11px] text-red-400 whitespace-pre-wrap break-words m-0">{change.old}</pre>
                    </div>
                    <div className="px-2.5 py-1.5 bg-green-950/30 border-t border-black/10">
                      <pre className="text-[11px] text-green-400 whitespace-pre-wrap break-words m-0">{change.new}</pre>
                    </div>
                  </div>
                ))}
                {turn.changes.some(c => c.approved) && (
                  <button
                    onClick={() => applyTurn(i)}
                    disabled={applyingTurn === i}
                    className="self-start px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {applyingTurn === i ? 'Applying…' : `Apply ${turn.changes.filter(c => c.approved).length} approved change(s)`}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>Thinking…</div>
        )}
        {error && (
          <div className="text-xs text-red-500">{error}</div>
        )}
      </div>

      <div className={`p-3 border-t flex-shrink-0 ${d ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="e.g. make responses more concise"
            disabled={sending}
            className={`flex-1 px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              d ? 'border-gray-600 bg-gray-800 text-gray-100 placeholder-gray-500' : 'border-gray-300 bg-white text-gray-900'
            }`}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

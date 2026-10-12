'use client';

import { useEffect, useState } from 'react';

interface AppliedChange {
  old: string;
  new: string;
  rationale: string;
}

interface Improvement {
  id: string;
  skill_id: string;
  domain_slug: string;
  skill_name: string;
  skill_display_name: string;
  applied_changes: AppliedChange[];
  applied_at: string;
}

interface Props {
  isDark: boolean;
  onClose: () => void;
  onJumpToSkill: (domainSlug: string, skillId: string) => void;
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SkillImprovementsPanel({ isDark: d, onClose, onJumpToSkill }: Props) {
  const [improvements, setImprovements] = useState<Improvement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/domains/skill-chat/improvements');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        setImprovements(data.improvements ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load improvements');
      }
    })();
  }, []);

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40" onClick={onClose}>
      <div
        className={`w-full sm:w-[440px] h-full flex flex-col shadow-2xl ${d ? 'bg-gray-900' : 'bg-white'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`px-4 py-3 border-b flex items-center justify-between flex-shrink-0 ${d ? 'border-gray-700' : 'border-gray-200'}`}>
          <div>
            <h3 className={`text-sm font-semibold ${d ? 'text-gray-100' : 'text-gray-900'}`}>Skill Improvements</h3>
            <p className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>Changes applied across every skill — spot a pattern worth reusing.</p>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg flex-shrink-0 ${d ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
          {error && <div className="text-xs text-red-500">{error}</div>}
          {!error && improvements === null && (
            <div className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>Loading…</div>
          )}
          {improvements !== null && improvements.length === 0 && (
            <p className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>
              No changes applied via the Skill Assistant yet. Once you approve an edit for a skill, it&rsquo;ll show up here.
            </p>
          )}
          {improvements?.map(imp => (
            <div key={imp.id} className={`rounded-lg border ${d ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className={`px-3 py-2 flex items-center justify-between gap-2 ${d ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <div className="min-w-0">
                  <p className={`text-xs font-medium truncate ${d ? 'text-gray-200' : 'text-gray-800'}`}>
                    {imp.skill_display_name} <span className={`font-normal ${d ? 'text-gray-500' : 'text-gray-400'}`}>· {imp.domain_slug}</span>
                  </p>
                  <p className={`text-[10px] ${d ? 'text-gray-500' : 'text-gray-400'}`}>{timeAgo(imp.applied_at)}</p>
                </div>
                <button
                  onClick={() => onJumpToSkill(imp.domain_slug, imp.skill_id)}
                  className="flex-shrink-0 px-2 py-1 rounded text-[10px] font-medium bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Open
                </button>
              </div>
              <div className="px-3 py-2 flex flex-col gap-1.5">
                {imp.applied_changes.map((change, j) => {
                  const key = `${imp.id}-${j}`;
                  const isOpen = expanded.has(key);
                  return (
                    <div key={key}>
                      <button
                        onClick={() => toggleExpanded(key)}
                        className={`text-left text-[11px] w-full ${d ? 'text-gray-300 hover:text-gray-100' : 'text-gray-600 hover:text-gray-900'}`}
                      >
                        {isOpen ? '▾' : '▸'} {change.rationale}
                      </button>
                      {isOpen && (
                        <div className="mt-1 flex flex-col gap-1">
                          <pre className="text-[10px] text-red-400 bg-red-950/30 rounded px-2 py-1 whitespace-pre-wrap break-words m-0">{change.old}</pre>
                          <pre className="text-[10px] text-green-400 bg-green-950/30 rounded px-2 py-1 whitespace-pre-wrap break-words m-0">{change.new}</pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

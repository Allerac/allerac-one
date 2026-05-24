'use client';

import { useState } from 'react';

export interface EditProposal {
  id: number;
  path: string;
  oldContent: string;
  newContent: string;
  explanation: string;
}

interface Props {
  proposal: EditProposal;
  isDarkMode: boolean;
  onAccept: (proposal: EditProposal) => Promise<void>;
  onReject: (id: number) => void;
}

type DiffLine = { type: '+' | '-' | ' '; line: string };

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText ? newText.split('\n') : [];
  const m = oldLines.length;
  const n = newLines.length;

  // LCS — bail out for large files to keep it fast
  if (m * n > 40000) {
    return [
      ...oldLines.map(line => ({ type: '-' as const, line })),
      ...newLines.map(line => ({ type: '+' as const, line })),
    ];
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldLines[i - 1] === newLines[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);

  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: ' ', line: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: '+', line: newLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: '-', line: oldLines[i - 1] });
      i--;
    }
  }
  return result;
}

function collapseUnchanged(diff: DiffLine[], context = 2): DiffLine[] {
  const changed = new Set<number>();
  diff.forEach((l, i) => { if (l.type !== ' ') for (let k = Math.max(0, i - context); k <= Math.min(diff.length - 1, i + context); k++) changed.add(k); });

  const out: DiffLine[] = [];
  let skipped = 0;
  diff.forEach((l, i) => {
    if (changed.has(i)) {
      if (skipped > 0) { out.push({ type: ' ', line: `··· ${skipped} unchanged lines ···` }); skipped = 0; }
      out.push(l);
    } else {
      skipped++;
    }
  });
  if (skipped > 0) out.push({ type: ' ', line: `··· ${skipped} unchanged lines ···` });
  return out;
}

export default function FileEditProposal({ proposal, isDarkMode, onAccept, onReject }: Props) {
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<'accepted' | 'rejected' | null>(null);
  const d = isDarkMode;

  const diff = computeDiff(proposal.oldContent, proposal.newContent);
  const collapsed = collapseUnchanged(diff);
  const added   = diff.filter(l => l.type === '+').length;
  const removed = diff.filter(l => l.type === '-').length;
  const fileName = proposal.path.split('/').pop() ?? proposal.path;

  const accept = async () => {
    setSaving(true);
    try {
      await onAccept(proposal);
      setDone('accepted');
    } catch { setSaving(false); }
  };

  const reject = () => { onReject(proposal.id); setDone('rejected'); };

  if (done === 'accepted') {
    return (
      <div className={`rounded-xl border px-4 py-3 text-sm flex items-center gap-2 ${d ? 'border-emerald-700 bg-emerald-950/30 text-emerald-400' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}>
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        <span><span className="font-medium">{fileName}</span> saved</span>
      </div>
    );
  }
  if (done === 'rejected') {
    return (
      <div className={`rounded-xl border px-4 py-3 text-sm flex items-center gap-2 ${d ? 'border-gray-700 bg-gray-800/30 text-gray-500' : 'border-gray-200 bg-gray-50 text-gray-400'}`}>
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        <span>Edit rejected</span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border overflow-hidden ${d ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2.5 border-b ${d ? 'border-gray-700 bg-gray-800/60' : 'border-gray-200 bg-gray-50'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-3.5 h-3.5 shrink-0 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span className={`text-xs font-medium truncate ${d ? 'text-gray-200' : 'text-gray-800'}`}>{fileName}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {added > 0   && <span className="text-xs text-emerald-400 font-mono">+{added}</span>}
          {removed > 0 && <span className="text-xs text-red-400 font-mono">−{removed}</span>}
        </div>
      </div>

      {/* Explanation */}
      <div className={`px-3 py-2 text-xs border-b ${d ? 'border-gray-700/50 text-gray-400' : 'border-gray-100 text-gray-500'}`}>
        {proposal.explanation}
      </div>

      {/* Diff */}
      <div className="overflow-x-auto overflow-y-auto max-h-64 font-mono text-xs">
        {collapsed.map((line, i) => {
          const isEllipsis = line.type === ' ' && line.line.startsWith('···');
          const bg = line.type === '+'
            ? d ? 'bg-emerald-950/40' : 'bg-emerald-50'
            : line.type === '-'
              ? d ? 'bg-red-950/40' : 'bg-red-50'
              : isEllipsis
                ? d ? 'bg-gray-800/30' : 'bg-gray-50/80'
                : '';
          const color = line.type === '+'
            ? d ? 'text-emerald-300' : 'text-emerald-700'
            : line.type === '-'
              ? d ? 'text-red-300' : 'text-red-700'
              : d ? 'text-gray-400' : 'text-gray-500';
          const prefix = isEllipsis ? ' ' : line.type === '+' ? '+' : line.type === '-' ? '-' : ' ';

          return (
            <div key={i} className={`flex ${bg}`}>
              <span className={`w-5 shrink-0 text-center select-none ${line.type === '+' ? 'text-emerald-500' : line.type === '-' ? 'text-red-500' : d ? 'text-gray-600' : 'text-gray-300'}`}>
                {prefix}
              </span>
              <pre className={`flex-1 px-1 py-px whitespace-pre leading-5 ${color}`}>{line.line}</pre>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className={`flex items-center gap-2 px-3 py-2.5 border-t ${d ? 'border-gray-700' : 'border-gray-200'}`}>
        <button
          onClick={accept}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
        >
          {saving ? (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          Accept
        </button>
        <button
          onClick={reject}
          disabled={saving}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${d ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Reject
        </button>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { getNoteRelated, promoteMemoryToPage } from '@/app/actions/notes';
import type { NoteRelated } from '@/app/services/knowledge/note-related.service';

const REASON_LABEL: Record<string, string> = {
  derived_from: 'Source of this page',
  shared_topic: 'Shared tag',
  mentions_title: 'Mentions this page',
};

/**
 * "Related" section of a note page: similar notes and documents, plus related
 * memories (which can be promoted to a sub-page). Tickets are never shown.
 */
export function NoteRelatedPanel({ noteId, refreshKey, onOpenNote, d }: {
  noteId: string;
  /** Changes when the note is saved, so results follow the content. */
  refreshKey?: string;
  onOpenNote: (id: string) => void;
  d: boolean;
}) {
  const [state, setState] = useState<{ key: string; related: NoteRelated | null } | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const key = `${noteId}:${refreshKey ?? ''}`;

  useEffect(() => {
    let cancelled = false;
    getNoteRelated(noteId).then(res => {
      if (!cancelled) setState({ key, related: res.success ? res.related : null });
    });
    return () => { cancelled = true; };
  }, [noteId, key]);

  const related = state && state.key === key ? state.related : null;
  if (!related) return null;
  const empty = related.notes.length === 0 && related.documents.length === 0 && related.memories.length === 0;
  if (empty && related.semanticAvailable) return null;

  const muted = d ? 'text-gray-500' : 'text-gray-400';
  const link = d ? 'text-indigo-300' : 'text-indigo-700';

  const promote = async (memoryId: string) => {
    setPromoting(memoryId);
    const res = await promoteMemoryToPage(memoryId, { parentId: noteId });
    setPromoting(null);
    if (res.success && res.note) onOpenNote((res.note as { id: string }).id);
    else if (res.error) window.alert(res.error);
  };

  return (
    <section aria-label="Related" className={`mt-6 pt-3 border-t ${d ? 'border-gray-800' : 'border-gray-200'}`}>
      <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${muted}`}>Related</h4>
      {!related.semanticAvailable && (
        <p className={`text-xs mb-2 ${muted}`}>Similar pages and documents appear once this page is indexed.</p>
      )}
      <ul className="space-y-1.5">
        {related.notes.map(n => (
          <li key={`n:${n.note_id}`}>
            <button type="button" onClick={() => onOpenNote(n.note_id)} className="text-left w-full">
              <span className={`text-xs font-medium ${link}`}>{n.icon ? `${n.icon} ` : ''}{n.title || 'Untitled'}</span>
              <span className={`ml-1 text-[10px] ${muted}`}>page · {Math.round(Number(n.similarity) * 100)}%</span>
            </button>
          </li>
        ))}
        {related.documents.map(doc => (
          <li key={`d:${doc.document_id}`}>
            <a href={`/memory/documents?document=${encodeURIComponent(doc.document_id)}`} className="text-left block">
              <span className={`text-xs font-medium ${link}`}>{doc.filename}</span>
              <span className={`ml-1 text-[10px] ${muted}`}>document · {Math.round(Number(doc.similarity) * 100)}%</span>
            </a>
          </li>
        ))}
        {related.memories.map(m => (
          <li key={`m:${m.memory_id}`} className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <span className={`block text-xs truncate ${d ? 'text-gray-300' : 'text-gray-700'}`}>{m.summary}</span>
              <span className={`text-[10px] ${muted}`}>memory · {REASON_LABEL[m.reason] ?? m.reason}</span>
            </div>
            {m.reason !== 'derived_from' && (
              <button
                type="button"
                disabled={promoting !== null}
                onClick={() => promote(m.memory_id)}
                title="Create a sub-page from this memory (the memory is kept)"
                className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border disabled:opacity-40 ${d ? 'border-gray-700 text-gray-400 hover:text-gray-200' : 'border-gray-200 text-gray-500 hover:text-gray-700'}`}
              >
                {promoting === m.memory_id ? '…' : 'Promote'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

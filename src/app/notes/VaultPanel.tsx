'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { listNotes, searchNotes, createNote, updateNote, deleteNote, getAllTags } from '@/app/actions/notes';
import { AlleracIcon } from '@/app/components/ui/AlleracIcon';

interface Note {
  id: string;
  title: string | null;
  content: string;
  tags: string[];
  source: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  userId: string;
  isDarkMode: boolean;
  refreshTrigger?: number;
  onEditorToggle?: (open: boolean) => void;
}

function TagBadge({ tag, active, onClick, d }: { tag: string; active?: boolean; onClick?: () => void; d: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
        active
          ? 'bg-indigo-600 border-indigo-500 text-white'
          : d
            ? 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
            : 'bg-gray-100 border-gray-200 text-gray-500 hover:border-gray-400'
      }`}
    >
      {tag}
    </button>
  );
}

function DueDateBadge({ due_date, d }: { due_date: string | null; d: boolean }) {
  if (!due_date) return null;
  const due = new Date(due_date);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const dueDay = new Date(due); dueDay.setHours(0, 0, 0, 0);

  if (dueDay < today) {
    return <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 font-medium flex-shrink-0">ATRASADO</span>;
  } else if (dueDay.getTime() === today.getTime()) {
    return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-400 font-medium flex-shrink-0">HOJE</span>;
  } else if (dueDay.getTime() === tomorrow.getTime()) {
    return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 font-medium flex-shrink-0">AMANHÃ</span>;
  } else {
    const label = due.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
    return <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${d ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>{label}</span>;
  }
}

function NoteRow({ note, selected, onSelect, onDelete, d }: {
  note: Note;
  selected: boolean;
  onSelect: (note: Note) => void;
  onDelete: (id: string) => void;
  d: boolean;
}) {
  const date = new Date(note.created_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  const title = note.title || note.content.slice(0, 40).replace(/\n/g, ' ');

  return (
    <button
      onClick={() => onSelect(note)}
      className={`w-full text-left px-3 py-2.5 border-b transition-colors group ${
        selected
          ? d ? 'bg-indigo-950/50 border-b-indigo-900' : 'bg-indigo-50 border-b-indigo-100'
          : d ? 'border-b-gray-800 hover:bg-gray-800/60' : 'border-b-gray-100 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className={`text-xs font-medium leading-snug truncate flex-1 ${
          selected
            ? d ? 'text-indigo-300' : 'text-indigo-700'
            : d ? 'text-gray-200' : 'text-gray-800'
        }`}>
          {title}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onDelete(note.id); }}
          className={`flex-shrink-0 text-xs opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 ${
            d ? 'text-gray-600 hover:text-red-400' : 'text-gray-300 hover:text-red-500'
          }`}
        >
          ✕
        </button>
      </div>
      <div className={`flex items-center gap-1.5 mt-0.5`}>
        <span className={`text-xs ${d ? 'text-gray-600' : 'text-gray-400'}`}>{date}</span>
        <DueDateBadge due_date={note.due_date} d={d} />
      </div>
    </button>
  );
}

function mdComponents(d: boolean) {
  const text = d ? 'text-gray-300' : 'text-gray-700';
  const heading = d ? 'text-gray-100' : 'text-gray-900';
  const border = d ? 'border-gray-700' : 'border-gray-200';
  const code = d ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-800';
  return {
    h1: ({ children }: any) => <h1 className={`text-2xl font-bold mt-6 mb-3 pb-2 border-b ${heading} ${border}`}>{children}</h1>,
    h2: ({ children }: any) => <h2 className={`text-xl font-bold mt-5 mb-2 ${heading}`}>{children}</h2>,
    h3: ({ children }: any) => <h3 className={`text-lg font-semibold mt-4 mb-2 ${heading}`}>{children}</h3>,
    h4: ({ children }: any) => <h4 className={`text-base font-semibold mt-3 mb-1 ${d ? 'text-gray-200' : 'text-gray-800'}`}>{children}</h4>,
    p:  ({ children }: any) => <p  className={`mb-3 leading-relaxed ${text}`}>{children}</p>,
    ul: ({ children }: any) => <ul className={`mb-3 ml-5 list-disc space-y-1 ${text}`}>{children}</ul>,
    ol: ({ children }: any) => <ol className={`mb-3 ml-5 list-decimal space-y-1 ${text}`}>{children}</ol>,
    li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
    strong: ({ children }: any) => <strong className={`font-semibold ${heading}`}>{children}</strong>,
    em: ({ children }: any) => <em className="italic">{children}</em>,
    blockquote: ({ children }: any) => (
      <blockquote className={`pl-4 border-l-4 my-3 italic ${d ? 'border-gray-600 text-gray-400' : 'border-gray-300 text-gray-500'}`}>
        {children}
      </blockquote>
    ),
    code({ node, className, children, ...props }: any) {
      const isBlock = /language-(\w+)/.test(className || '');
      if (isBlock) {
        return (
          <pre className={`px-4 py-3 rounded-lg overflow-x-auto mb-3 text-sm font-mono ${code}`}>
            <code>{children}</code>
          </pre>
        );
      }
      return <code className={`px-1.5 py-0.5 rounded text-xs font-mono ${code}`} {...props}>{children}</code>;
    },
    a: ({ children, href }: any) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline">
        {children}
      </a>
    ),
    hr: () => <hr className={`my-4 border-t ${border}`} />,
    table: ({ children }: any) => (
      <div className="overflow-x-auto mb-3">
        <table className={`w-full text-sm border-collapse ${text}`}>{children}</table>
      </div>
    ),
    thead: ({ children }: any) => <thead className={d ? 'bg-gray-800' : 'bg-gray-50'}>{children}</thead>,
    th: ({ children }: any) => (
      <th className={`px-3 py-2 text-left text-xs font-semibold border-b ${d ? 'border-gray-700 text-gray-200' : 'border-gray-200 text-gray-700'}`}>
        {children}
      </th>
    ),
    td: ({ children }: any) => (
      <td className={`px-3 py-2 text-xs border-b ${d ? 'border-gray-800' : 'border-gray-100'}`}>{children}</td>
    ),
  };
}

function toDateInputValue(due_date: string | null): string {
  if (!due_date) return '';
  const d = new Date(due_date);
  if (isNaN(d.getTime())) return '';
  // format as YYYY-MM-DD for <input type="date">
  return d.toISOString().slice(0, 10);
}

function NoteEditor({ note, isDarkMode: d, onSave, onClose, onDelete }: {
  note: Note;
  isDarkMode: boolean;
  onSave: (id: string, content: string, title: string, tags: string[], due_date: string | null) => Promise<void>;
  onClose: () => void;
  onDelete?: (id: string) => void;
}) {
  const [content, setContent]     = useState(note.content);
  const [title, setTitle]         = useState(note.title ?? '');
  const [tagInput, setTagInput]   = useState(note.tags.join(', '));
  const [dueDate, setDueDate]     = useState(toDateInputValue(note.due_date));
  const [editMode, setEditMode]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [savedAt, setSavedAt]     = useState<Date | null>(null);
  const [dirty, setDirty]         = useState(false);
  const autoSaveRef               = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef               = useRef<HTMLTextAreaElement>(null);

  // Reset when note changes
  useEffect(() => {
    setContent(note.content);
    setTitle(note.title ?? '');
    setTagInput(note.tags.join(', '));
    setDueDate(toDateInputValue(note.due_date));
    setDirty(false);
    setSavedAt(null);
  }, [note.id]);

  // Auto-focus textarea in edit mode
  useEffect(() => {
    if (editMode) setTimeout(() => textareaRef.current?.focus(), 50);
  }, [editMode]);

  const parseTags = (input: string) =>
    input.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

  const save = useCallback(async (c: string, t: string, ti: string, dd: string) => {
    setSaving(true);
    await onSave(note.id, c, t, parseTags(ti), dd || null);
    setSaving(false);
    setSavedAt(new Date());
    setDirty(false);
  }, [note.id, onSave]);

  const scheduleAutoSave = useCallback((c: string, t: string, ti: string, dd: string) => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => save(c, t, ti, dd), 5000);
  }, [save]);

  const handleContentChange = (val: string) => {
    setContent(val);
    setDirty(true);
    scheduleAutoSave(val, title, tagInput, dueDate);
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    setDirty(true);
    scheduleAutoSave(content, val, tagInput, dueDate);
  };

  const handleTagChange = (val: string) => {
    setTagInput(val);
    setDirty(true);
    scheduleAutoSave(content, title, val, dueDate);
  };

  const handleDueDateChange = (val: string) => {
    setDueDate(val);
    setDirty(true);
    scheduleAutoSave(content, title, tagInput, val);
  };

  // Flush auto-save on unmount
  useEffect(() => () => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
  }, []);

  const saveStatus = saving
    ? 'Saving…'
    : dirty
      ? 'Unsaved'
      : savedAt
        ? `Saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : null;

  return (
    <div className={`flex flex-col flex-1 overflow-hidden ${d ? 'bg-gray-900' : 'bg-white'}`}>

      {/* Editor header */}
      <div className={`flex-shrink-0 border-b px-4 py-2.5 ${d ? 'border-gray-800' : 'border-gray-200'}`}>
        <div className="flex items-center gap-2 mb-2">
          {/* Back to list — mobile only */}
          <button
            onClick={onClose}
            className={`lg:hidden flex items-center gap-1 text-xs flex-shrink-0 transition-colors ${d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Notes
          </button>
          <input
            value={title}
            onChange={e => handleTitleChange(e.target.value)}
            placeholder="Note title…"
            className={`flex-1 text-sm font-semibold bg-transparent outline-none placeholder-opacity-40 ${
              d ? 'text-gray-100 placeholder-gray-600' : 'text-gray-900 placeholder-gray-400'
            }`}
          />
          {onDelete && (
            <button
              onClick={() => { if (window.confirm('Delete this note?')) onDelete(note.id); }}
              className={`flex-shrink-0 p-1 rounded transition-colors ${d ? 'text-gray-600 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}
              title="Delete note"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          {/* Edit / Preview toggle */}
          <div className={`flex rounded-lg border text-xs overflow-hidden ${d ? 'border-gray-700' : 'border-gray-200'}`}>
            <button
              onClick={() => setEditMode(false)}
              className={`px-2.5 py-1 transition-colors ${
                !editMode
                  ? d ? 'bg-indigo-700 text-white' : 'bg-indigo-600 text-white'
                  : d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Preview
            </button>
            <button
              onClick={() => setEditMode(true)}
              className={`px-2.5 py-1 transition-colors ${
                editMode
                  ? d ? 'bg-indigo-700 text-white' : 'bg-indigo-600 text-white'
                  : d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Edit
            </button>
          </div>
          <button
            onClick={onClose}
            className={`hidden lg:inline-flex text-xs px-2 py-1 rounded transition-colors ${d ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
            title="Close editor"
          >
            ✕
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={tagInput}
            onChange={e => handleTagChange(e.target.value)}
            placeholder="tags, comma separated"
            className={`text-xs bg-transparent outline-none flex-1 ${
              d ? 'text-gray-500 placeholder-gray-700' : 'text-gray-400 placeholder-gray-300'
            }`}
          />
          <input
            type="date"
            value={dueDate}
            onChange={e => handleDueDateChange(e.target.value)}
            title="Due date"
            className={`text-xs bg-transparent outline-none flex-shrink-0 w-28 ${
              d ? 'text-gray-500 [color-scheme:dark]' : 'text-gray-400'
            }`}
          />
          {saveStatus && (
            <span className={`text-xs flex-shrink-0 ${
              saving ? (d ? 'text-yellow-500' : 'text-yellow-600') :
              dirty  ? (d ? 'text-orange-400' : 'text-orange-500') :
                       (d ? 'text-green-500' : 'text-green-600')
            }`}>
              {saveStatus}
            </span>
          )}
        </div>
      </div>

      {/* Editor body */}
      {editMode ? (
        <textarea
          ref={textareaRef}
          value={content}
          onChange={e => handleContentChange(e.target.value)}
          spellCheck={false}
          className={`flex-1 min-h-0 resize-none outline-none font-mono text-sm leading-relaxed px-5 py-4 ${
            d
              ? 'bg-gray-900 text-gray-200 placeholder-gray-700'
              : 'bg-white text-gray-800 placeholder-gray-300'
          }`}
          placeholder="Write in Markdown…"
        />
      ) : (
        <div className={`flex-1 overflow-y-auto px-5 py-4 text-sm ${d ? 'text-gray-300' : 'text-gray-700'}`}>
          {content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents(d)}>
              {content}
            </ReactMarkdown>
          ) : (
            <p className={`italic ${d ? 'text-gray-600' : 'text-gray-400'}`}>
              Empty note. Switch to Edit to start writing.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function VaultPanel({ userId, isDarkMode: d, refreshTrigger, onEditorToggle }: Props) {
  const [notes, setNotes]               = useState<Note[]>([]);
  const [tags, setTags]                 = useState<string[]>([]);
  const [activeTag, setActiveTag]       = useState<string | null>(null);
  const [query, setQuery]               = useState('');
  const [searching, setSearching]       = useState(false);
  const [loading, setLoading]           = useState(true);
  const [quickNote, setQuickNote]       = useState('');
  const [saving, setSaving]             = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  const loadNotes = useCallback(async (tag?: string) => {
    setLoading(true);
    const res = await listNotes({ limit: 50, tag });
    if (res.success) setNotes(res.notes as unknown as Note[]);
    const tagRes = await getAllTags();
    if (tagRes.success) setTags(tagRes.tags);
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadNotes(activeTag ?? undefined); }, [loadNotes, activeTag, refreshTrigger]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) { loadNotes(activeTag ?? undefined); return; }
    setSearching(true);
    const res = await searchNotes(query);
    if (res.success) setNotes(res.results as unknown as Note[]);
    setSearching(false);
  }, [query, userId, activeTag, loadNotes]);

  useEffect(() => {
    if (!query.trim()) { loadNotes(activeTag ?? undefined); return; }
    const t = setTimeout(handleSearch, 400);
    return () => clearTimeout(t);
  }, [query, handleSearch, loadNotes, activeTag]);

  const handleQuickSave = async () => {
    if (!quickNote.trim()) return;
    setSaving(true);
    await createNote({ content: quickNote.trim(), source: 'manual' });
    setQuickNote('');
    await loadNotes(activeTag ?? undefined);
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (selectedNote?.id === id) {
      setSelectedNote(null);
      onEditorToggle?.(false);
    }
    await deleteNote(id);
    setNotes(prev => prev.filter(n => n.id !== id));
    const tagRes = await getAllTags();
    if (tagRes.success) setTags(tagRes.tags);
  };

  const handleSelectNote = (note: Note) => {
    setSelectedNote(note);
    onEditorToggle?.(true);
  };

  const handleCloseEditor = () => {
    setSelectedNote(null);
    onEditorToggle?.(false);
  };

  const handleSave = async (id: string, content: string, title: string, tags: string[], due_date: string | null) => {
    await updateNote(id, { content, title: title || null, tags, due_date });
    setNotes(prev => prev.map(n =>
      n.id === id ? { ...n, content, title: title || null, tags, due_date, updated_at: new Date().toISOString() } : n
    ));
    setSelectedNote(prev => prev?.id === id ? { ...prev, content, title: title || null, tags, due_date } : prev);
    const tagRes = await getAllTags();
    if (tagRes.success) setTags(tagRes.tags);
  };

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* Notes list — full width on mobile when no note selected, fixed 56 on desktop */}
      <div className={`${selectedNote ? 'hidden lg:flex' : 'flex flex-1'} lg:flex-none lg:w-56 flex-col border-r overflow-hidden ${d ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>

        {/* Header */}
        <div className={`flex-shrink-0 px-3 py-2.5 border-b flex items-center justify-between ${d ? 'border-gray-800' : 'border-gray-200'}`}>
          <span className={`text-xs font-semibold uppercase tracking-wider ${d ? 'text-gray-500' : 'text-gray-400'}`}>
            Notes · {notes.length}
          </span>
          <button
            onClick={async () => {
              setSaving(true);
              const res = await createNote({ content: '', source: 'manual' });
              if (res.success && res.note) {
                await loadNotes(activeTag ?? undefined);
                handleSelectNote(res.note as unknown as Note);
              }
              setSaving(false);
            }}
            disabled={saving}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${d ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-500'}`}
          >
            + New
          </button>
        </div>

        {/* Search */}
        <div className={`flex-shrink-0 px-2 py-2 border-b ${d ? 'border-gray-800' : 'border-gray-200'}`}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search…"
            className={`w-full text-xs rounded px-2 py-1 border outline-none ${
              d
                ? 'bg-gray-800 border-gray-700 text-gray-200 placeholder-gray-600 focus:border-indigo-500'
                : 'bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:border-indigo-400'
            }`}
          />
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className={`flex-shrink-0 px-2 py-2 border-b flex flex-wrap gap-1 ${d ? 'border-gray-800' : 'border-gray-200'}`}>
            <TagBadge tag="all" active={!activeTag} onClick={() => setActiveTag(null)} d={d} />
            {tags.map(tag => (
              <TagBadge key={tag} tag={tag} active={activeTag === tag} onClick={() => setActiveTag(t => t === tag ? null : tag)} d={d} />
            ))}
          </div>
        )}

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto">
          {(loading || searching) ? (
            <div className={`text-xs text-center py-8 ${d ? 'text-gray-600' : 'text-gray-400'}`}>
              {searching ? 'searching…' : 'loading…'}
            </div>
          ) : notes.length === 0 ? (
            <div className={`text-xs text-center py-8 px-3 ${d ? 'text-gray-600' : 'text-gray-400'}`}>
              {query ? 'No notes found.' : 'No notes yet.'}
            </div>
          ) : notes.map(note => (
            <NoteRow
              key={note.id}
              note={note}
              selected={selectedNote?.id === note.id}
              onSelect={handleSelectNote}
              onDelete={handleDelete}
              d={d}
            />
          ))}
        </div>

        {/* Quick capture */}
        <div className={`flex-shrink-0 px-2 py-2 border-t ${d ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="flex gap-1">
            <input
              value={quickNote}
              onChange={e => setQuickNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleQuickSave(); }}}
              placeholder="Quick note…"
              className={`flex-1 text-xs rounded px-2 py-1 border outline-none min-w-0 ${
                d
                  ? 'bg-gray-800 border-gray-700 text-gray-200 placeholder-gray-600 focus:border-indigo-500'
                  : 'bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:border-indigo-400'
              }`}
            />
            <button
              onClick={handleQuickSave}
              disabled={saving || !quickNote.trim()}
              className="px-2 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors flex-shrink-0"
            >
              {saving ? '…' : '+'}
            </button>
          </div>
        </div>
      </div>

      {/* Editor — full width on mobile when note selected, flex-1 on desktop */}
      <div className={`${selectedNote ? 'flex flex-1' : 'hidden lg:flex lg:flex-1'} flex-col overflow-hidden`}>
        {selectedNote ? (
          <NoteEditor
            note={selectedNote}
            isDarkMode={d}
            onSave={handleSave}
            onClose={handleCloseEditor}
            onDelete={handleDelete}
          />
        ) : (
          <div className={`flex-1 flex flex-col items-center justify-center gap-3 ${d ? 'bg-gray-900' : 'bg-white'}`}>
            <AlleracIcon size={48} />
            <p className={`text-sm ${d ? 'text-gray-500' : 'text-gray-400'}`}>
              Select or create a new note
            </p>
            <button
              onClick={async () => {
                setSaving(true);
                const res = await createNote({ content: '', source: 'manual' });
                if (res.success && res.note) {
                  await loadNotes(activeTag ?? undefined);
                  handleSelectNote(res.note as unknown as Note);
                }
                setSaving(false);
              }}
              disabled={saving}
              className={`text-sm font-medium transition-colors ${d ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-500'}`}
            >
              + New note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

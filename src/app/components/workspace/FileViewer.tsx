'use client';

import { useState, useEffect, useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface FileViewerProps {
  filePath: string | null;
  isDarkMode: boolean;
}

export default function FileViewer({ filePath, isDarkMode }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [language, setLanguage] = useState('text');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setWrapLines(window.innerWidth < 1024);
  }, []);

  useEffect(() => {
    if (!filePath) return;
    setLoading(true);
    setError(null);
    setContent(null);
    setEditMode(false);
    setSaveError(null);
    fetch(`/api/workspace/file?path=${encodeURIComponent(filePath)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setContent(data.content);
        setLanguage(data.language || 'text');
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [filePath]);

  const enterEdit = () => {
    setEditContent(content ?? '');
    setEditMode(true);
    setSaveError(null);
    setSavedOk(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setSaveError(null);
  };

  const save = async () => {
    if (!filePath) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/workspace/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: editContent }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Save failed');
      setContent(editContent);
      setEditMode(false);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const copy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const d = isDarkMode;

  if (!filePath) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
        <span className="text-5xl opacity-30">📄</span>
        <div className="space-y-1.5">
          <p className={`text-sm font-medium ${d ? 'text-gray-400' : 'text-gray-500'}`}>
            Nenhum arquivo selecionado
          </p>
          <p className={`text-xs flex items-center justify-center gap-1.5 lg:hidden ${d ? 'text-gray-600' : 'text-gray-400'}`}>
            Toque em
            <svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            para ver os arquivos
          </p>
          <p className={`text-xs hidden lg:block ${d ? 'text-gray-600' : 'text-gray-400'}`}>
            Selecione um arquivo na barra lateral
          </p>
        </div>
      </div>
    );
  }

  const fileName = filePath.split('/').pop() || filePath;
  const lineCount = (editMode ? editContent : content ?? '').split('\n').length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-2.5 border-b shrink-0 ${d ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-sm font-medium truncate ${d ? 'text-gray-200' : 'text-gray-800'}`}>{fileName}</span>
          {!editMode && <span className={`text-xs shrink-0 ${d ? 'text-gray-500' : 'text-gray-400'}`}>{language}</span>}
          {editMode && <span className={`text-xs shrink-0 ${d ? 'text-yellow-500' : 'text-yellow-600'}`}>editando</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {content && (
            <span className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>{lineCount} lines</span>
          )}

          {editMode ? (
            <>
              {saveError && <span className="text-xs text-red-400">{saveError}</span>}
              <button
                onClick={cancelEdit}
                className={`text-xs px-2.5 py-1 rounded transition-colors ${d ? 'text-gray-400 hover:text-gray-200 hover:bg-white/10' : 'text-gray-500 hover:text-gray-800 hover:bg-black/5'}`}
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving}
                className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded transition-colors font-medium ${
                  d
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50'
                }`}
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
                Salvar
              </button>
            </>
          ) : (
            <>
              {savedOk && <span className="text-xs text-green-500">✓ Salvo</span>}
              <button
                onClick={() => setWrapLines(w => !w)}
                title={wrapLines ? 'Desativar quebra de linha' : 'Ativar quebra de linha'}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-colors ${
                  wrapLines
                    ? d ? 'bg-indigo-900/50 text-indigo-400' : 'bg-indigo-100 text-indigo-600'
                    : d ? 'text-gray-500 hover:text-gray-300 hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-black/5'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10m0 0l-3-3m3 3l-3 3M4 18h7" />
                </svg>
                <span className="hidden sm:inline">Wrap</span>
              </button>
              <button
                onClick={copy}
                disabled={!content}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded transition-colors ${
                  d
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-white/10'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-black/5'
                }`}
              >
                {copied ? (
                  <span className="text-green-500">✓ Copied</span>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
              <button
                onClick={enterEdit}
                disabled={!content}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors ${
                  d
                    ? 'border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-500 hover:bg-white/5'
                    : 'border-gray-300 text-gray-500 hover:text-gray-800 hover:border-gray-400 hover:bg-black/5'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="p-4 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className={`h-4 rounded animate-pulse ${d ? 'bg-white/10' : 'bg-black/8'}`} style={{ width: `${40 + (i % 5) * 12}%` }} />
            ))}
          </div>
        )}
        {error && (
          <div className="p-6 text-sm text-red-400">{error}</div>
        )}
        {editMode && (
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            spellCheck={false}
            className={`w-full h-full min-h-full resize-none outline-none p-4 font-mono text-sm leading-relaxed ${
              d
                ? 'bg-gray-950 text-gray-100 caret-indigo-400'
                : 'bg-white text-gray-900 caret-indigo-600'
            }`}
            style={{ fontSize: '0.8rem', lineHeight: '1.6', tabSize: 2 }}
          />
        )}
        {content !== null && !loading && !editMode && (
          <SyntaxHighlighter
            language={language}
            style={d ? oneDark : oneLight}
            customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.8rem', lineHeight: '1.6', minHeight: '100%', background: 'transparent', whiteSpace: wrapLines ? 'pre-wrap' : 'pre', wordBreak: wrapLines ? 'break-all' : 'normal' }}
            codeTagProps={{ style: { whiteSpace: wrapLines ? 'pre-wrap' : 'pre', wordBreak: wrapLines ? 'break-all' : 'normal' } }}
            showLineNumbers={lineCount > 5}
            wrapLongLines={wrapLines}
          >
            {content}
          </SyntaxHighlighter>
        )}
      </div>
    </div>
  );
}

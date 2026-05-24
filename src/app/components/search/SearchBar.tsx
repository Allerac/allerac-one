'use client';

import { useRef, useEffect } from 'react';

interface Props {
  query: string;
  setQuery: (q: string) => void;
  onSearch: () => void;
  isSearching: boolean;
  isDarkMode: boolean;
}

export default function SearchBar({ query, setQuery, onSearch, isSearching, isDarkMode }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const d = isDarkMode;

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSearch(); }
  };

  return (
    <div className={`flex items-center gap-2 px-4 py-3 border-b ${d ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
      <div className={`flex-1 flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
        d ? 'border-gray-600 bg-gray-800 focus-within:border-indigo-500' : 'border-gray-300 bg-gray-50 focus-within:border-indigo-400'
      }`}>
        <svg className={`w-4 h-4 shrink-0 ${d ? 'text-gray-400' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search the web..."
          className={`flex-1 bg-transparent outline-none text-sm ${d ? 'text-gray-100 placeholder-gray-500' : 'text-gray-800 placeholder-gray-400'}`}
        />
        {query && (
          <button onClick={() => setQuery('')} className={`shrink-0 ${d ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <button
        onClick={onSearch}
        disabled={isSearching || !query.trim()}
        className="shrink-0 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-colors flex items-center gap-1.5"
      >
        {isSearching ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        ) : 'Search'}
      </button>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as financeActions from '@/app/actions/finance';
import StockChart from './StockChart';

interface Quote {
  symbol: string;
  name?: string;
  c: number;   // current price
  d: number;   // change
  dp: number;  // change percent
  error?: boolean;
}

interface SearchResult {
  symbol: string;
  description: string;
  displaySymbol: string;
  type: string;
}

interface Props {
  isDarkMode: boolean;
  onContextUpdate: (ctx: string) => void;
}

function buildContext(quotes: Quote[]): string {
  const now = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const lines = quotes
    .filter(q => !q.error && q.c > 0)
    .map(q => {
      const sign = q.d >= 0 ? '+' : '';
      return `- ${q.symbol}${q.name ? ` (${q.name})` : ''}: $${q.c.toFixed(2)}, ${sign}${q.d.toFixed(2)} (${sign}${q.dp.toFixed(2)}%)`;
    });
  if (!lines.length) return '';
  return `## Finance watchlist (as of ${now})\n${lines.join('\n')}\n\nThe user may ask questions about these assets.`;
}

export default function StockPanel({ isDarkMode: d, onContextUpdate }: Props) {
  const [watchlist, setWatchlist]         = useState<string[]>([]);
  const [quotes, setQuotes]               = useState<Quote[]>([]);
  const [isLoading, setIsLoading]         = useState(false);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [searchInput, setSearchInput]   = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching]   = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef                       = useRef<HTMLDivElement>(null);
  const searchDebounce                  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchQuotes = useCallback(async (symbols: string[]) => {
    if (!symbols.length) { setQuotes([]); onContextUpdate(''); return; }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/finance/quote?symbols=${symbols.join(',')}`);
      const data = await res.json();
      if (data.quotes) {
        setQuotes(data.quotes);
        onContextUpdate(buildContext(data.quotes));
      }
    } catch { /* silent */ }
    finally { setIsLoading(false); }
  }, [onContextUpdate]);

  useEffect(() => {
    financeActions.getWatchlist().then(symbols => {
      setWatchlist(symbols);
      fetchQuotes(symbols);
    });
  }, [fetchQuotes]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced symbol search
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!searchInput.trim()) { setSearchResults([]); setShowDropdown(false); return; }
    searchDebounce.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/finance/quote?q=${encodeURIComponent(searchInput.trim())}`);
        const data = await res.json();
        const results: SearchResult[] = (data.result ?? [])
          .filter((r: SearchResult) => r.type === 'Common Stock' || r.type === 'ETP')
          .slice(0, 6);
        setSearchResults(results);
        setShowDropdown(results.length > 0);
      } catch { /* silent */ }
      finally { setIsSearching(false); }
    }, 400);
  }, [searchInput]);

  const handleAdd = async (symbol: string, name?: string) => {
    if (watchlist.includes(symbol)) return;
    const next = [...watchlist, symbol];
    setWatchlist(next);
    setSearchInput('');
    setShowDropdown(false);
    setSearchResults([]);
    await financeActions.addToWatchlist(symbol);
    await fetchQuotes(next);
  };

  const handleRemove = async (symbol: string) => {
    const next = watchlist.filter(s => s !== symbol);
    setWatchlist(next);
    setQuotes(prev => prev.filter(q => q.symbol !== symbol));
    onContextUpdate(buildContext(quotes.filter(q => q.symbol !== symbol)));
    await financeActions.removeFromWatchlist(symbol);
  };

  const handleRefresh = () => fetchQuotes(watchlist);

  const textPrimary = d ? 'text-gray-100' : 'text-gray-900';
  const textMuted   = d ? 'text-gray-400' : 'text-gray-500';
  const borderCls   = d ? 'border-gray-700' : 'border-gray-200';
  const inputBg     = d ? 'bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-blue-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500';
  const cardBg      = d ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const dropdownBg  = d ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200';

  const quoteMap = Object.fromEntries(quotes.map(q => [q.symbol, q]));

  return (
    <div className={`flex flex-col h-full ${d ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`flex-shrink-0 flex items-center justify-between px-4 py-3 border-b ${borderCls}`}>
        <h2 className={`text-sm font-semibold ${textPrimary}`}>Watchlist</h2>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          title="Refresh prices"
          className={`p-1.5 rounded transition-colors ${d ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'}`}
        >
          <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Add symbol */}
      <div className={`flex-shrink-0 px-4 py-3 border-b ${borderCls}`} ref={searchRef}>
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
            placeholder="Add symbol (e.g. AAPL)"
            className={`w-full px-3 py-2 pr-8 rounded-lg border text-sm outline-none transition-colors ${inputBg}`}
          />
          {isSearching && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </div>
          )}
          {showDropdown && searchResults.length > 0 && (
            <div className={`absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border shadow-lg overflow-hidden ${dropdownBg}`}>
              {searchResults.map(r => (
                <button
                  key={r.symbol}
                  onMouseDown={e => { e.preventDefault(); handleAdd(r.symbol, r.description); }}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                    d ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                  } ${watchlist.includes(r.symbol) ? 'opacity-40 pointer-events-none' : ''}`}
                >
                  <span className={`font-semibold w-16 shrink-0 ${textPrimary}`}>{r.displaySymbol}</span>
                  <span className={`truncate ${textMuted}`}>{r.description}</span>
                  {watchlist.includes(r.symbol) && <span className="ml-auto text-xs text-green-500">Added</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stock list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {watchlist.length === 0 && (
          <div className={`text-center py-12 ${textMuted}`}>
            <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
            <p className="text-sm">No stocks added yet</p>
            <p className="text-xs mt-1 opacity-60">Search for a symbol above</p>
          </div>
        )}

        {watchlist.map(symbol => {
          const q = quoteMap[symbol];
          const isPos = q && !q.error && q.d >= 0;
          const isNeg = q && !q.error && q.d < 0;
          const changeColor = isPos ? 'text-green-500' : isNeg ? 'text-red-500' : textMuted;

          const isExpanded = expandedSymbol === symbol;

          return (
            <div key={symbol} className={`rounded-xl border ${cardBg} overflow-hidden`}>
              {/* Header row — clickable */}
              <div
                className={`relative p-3.5 cursor-pointer select-none transition-colors ${d ? 'hover:bg-gray-750' : 'hover:bg-gray-50'}`}
                onClick={() => setExpandedSymbol(isExpanded ? null : symbol)}
              >
                <button
                  onClick={e => { e.stopPropagation(); handleRemove(symbol); }}
                  className={`absolute top-2 right-2 p-1 rounded transition-colors ${d ? 'text-gray-600 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-300 hover:text-gray-600 hover:bg-gray-100'}`}
                  title="Remove"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                <div className="flex items-start justify-between pr-6">
                  <div>
                    <span className={`text-base font-bold ${textPrimary}`}>{symbol}</span>
                    {q?.name && q.name !== symbol && (
                      <p className={`text-xs mt-0.5 truncate max-w-[140px] ${textMuted}`}>{q.name}</p>
                    )}
                  </div>

                  {!q || q.error ? (
                    <span className={`text-sm ${textMuted}`}>{isLoading ? '...' : '—'}</span>
                  ) : (
                    <div className="text-right">
                      <p className={`text-base font-semibold tabular-nums ${textPrimary}`}>
                        ${q.c.toFixed(2)}
                      </p>
                      <p className={`text-xs tabular-nums ${changeColor}`}>
                        {q.d >= 0 ? '+' : ''}{q.d.toFixed(2)} ({q.d >= 0 ? '+' : ''}{q.dp.toFixed(2)}%)
                      </p>
                    </div>
                  )}
                </div>

                {/* Mini color bar */}
                {q && !q.error && (
                  <div className={`mt-2.5 h-0.5 rounded-full ${isPos ? 'bg-green-500/30' : isNeg ? 'bg-red-500/30' : 'bg-gray-500/20'}`}>
                    <div className={`h-full rounded-full transition-all ${isPos ? 'bg-green-500' : isNeg ? 'bg-red-500' : 'bg-gray-400'}`}
                      style={{ width: `${Math.min(100, Math.abs(q.dp) * 10)}%` }} />
                  </div>
                )}
              </div>

              {/* Expanded chart */}
              {isExpanded && q && !q.error && (
                <div className={`px-3.5 pb-3.5 ${d ? 'bg-gray-800' : 'bg-white'}`}>
                  <StockChart
                    symbol={symbol}
                    currentPrice={q.c}
                    isDarkMode={d}
                    isPositive={isPos ?? false}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      {quotes.length > 0 && (
        <div className={`flex-shrink-0 px-4 py-2 border-t text-center ${borderCls}`}>
          <span className={`text-xs ${textMuted}`}>Data via Finnhub · 15-min delay</span>
        </div>
      )}
    </div>
  );
}

'use client';

interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

interface Props {
  query: string;
  answer?: string;
  results: SearchResult[];
  isSearching: boolean;
  isDarkMode: boolean;
}

function Favicon({ url, isDarkMode }: { url: string; isDarkMode: boolean }) {
  const domain = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
      alt=""
      className="w-4 h-4 shrink-0 rounded-sm"
      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

function ResultCard({ result, isDarkMode }: { result: SearchResult; isDarkMode: boolean }) {
  const d = isDarkMode;
  const domain = (() => { try { return new URL(result.url).hostname.replace('www.', ''); } catch { return result.url; } })();

  return (
    <a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-xl border p-3.5 transition-colors ${
        d
          ? 'border-gray-700 bg-gray-800/50 hover:bg-gray-800 hover:border-gray-600'
          : 'border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Favicon url={result.url} isDarkMode={d} />
        <span className={`text-xs truncate ${d ? 'text-gray-500' : 'text-gray-400'}`}>{domain}</span>
      </div>
      <h3 className={`text-sm font-medium leading-snug mb-1 line-clamp-2 ${d ? 'text-indigo-300 hover:text-indigo-200' : 'text-indigo-700 hover:text-indigo-800'}`}>
        {result.title}
      </h3>
      <p className={`text-xs leading-relaxed line-clamp-3 ${d ? 'text-gray-400' : 'text-gray-500'}`}>
        {result.content}
      </p>
    </a>
  );
}

export default function SearchResultsPanel({ query, answer, results, isSearching, isDarkMode }: Props) {
  const d = isDarkMode;

  if (isSearching) {
    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className={`rounded-xl border p-3.5 ${d ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-white'}`}>
            <div className={`h-3 w-24 rounded mb-2 animate-pulse ${d ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className={`h-4 w-3/4 rounded mb-2 animate-pulse ${d ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className={`h-3 w-full rounded mb-1 animate-pulse ${d ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className={`h-3 w-5/6 rounded animate-pulse ${d ? 'bg-gray-700' : 'bg-gray-200'}`} />
          </div>
        ))}
      </div>
    );
  }

  if (!query && results.length === 0) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center gap-3 ${d ? 'text-gray-600' : 'text-gray-400'}`}>
        <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <p className="text-sm">Search the web and ask the AI about the results</p>
      </div>
    );
  }

  if (query && results.length === 0) {
    return (
      <div className={`flex-1 flex items-center justify-center ${d ? 'text-gray-500' : 'text-gray-400'}`}>
        <p className="text-sm">No results found for "{query}"</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {answer && (
        <div className={`rounded-xl border p-3.5 ${d ? 'border-indigo-800/50 bg-indigo-950/30' : 'border-indigo-100 bg-indigo-50/60'}`}>
          <p className={`text-xs font-medium mb-1 ${d ? 'text-indigo-400' : 'text-indigo-600'}`}>Summary</p>
          <p className={`text-sm leading-relaxed ${d ? 'text-gray-300' : 'text-gray-700'}`}>{answer}</p>
        </div>
      )}
      {results.map((result, i) => (
        <ResultCard key={i} result={result} isDarkMode={d} />
      ))}
    </div>
  );
}

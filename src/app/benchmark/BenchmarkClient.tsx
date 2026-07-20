'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import BenchmarkPanel from '@/app/components/system/BenchmarkPanel';
import { useTheme } from '@/app/context/ThemeContext';
import { MODELS } from '@/app/services/llm/models';

interface Props {
  userId: string;
}

export default function BenchmarkClient({ userId }: Props) {
  const { isDark, toggleDark } = useTheme();
  const [selectedModel, setSelectedModel] = useState(MODELS[0]?.id ?? '');

  useEffect(() => {
    const savedModel = localStorage.getItem('selected_model');
    if (savedModel && MODELS.some((model) => model.id === savedModel)) {
      setSelectedModel(savedModel);
    }
  }, []);

  return (
    <main className={`flex h-dvh flex-col ${isDark ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`}>
      <header className={`flex flex-shrink-0 items-center justify-between border-b px-4 py-3 sm:px-6 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            aria-label="Back to Hub"
            className={`rounded-lg p-2 transition-colors ${isDark ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-100' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold sm:text-lg">Benchmark</h1>
            <p className={`hidden text-xs sm:block ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Evaluate model quality and performance</p>
          </div>
        </div>
        <button
          onClick={toggleDark}
          className={`rounded-lg px-3 py-2 text-sm transition-colors ${isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          {isDark ? 'Light' : 'Dark'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl pb-[max(env(safe-area-inset-bottom),1rem)]">
          <BenchmarkPanel
            isDarkMode={isDark}
            userId={userId}
            MODELS={MODELS}
            selectedModel={selectedModel}
          />
        </div>
      </div>
    </main>
  );
}

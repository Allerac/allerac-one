'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Project { name: string; fileCount: number }

export default function WorkspaceProjectList({ projects, userId }: { projects: Project[]; userId: string }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('chatTheme');
    if (saved) { setIsDark(saved === 'dark'); return; }
    setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem('chatTheme', next ? 'dark' : 'light');
  };

  const d = isDark;
  return (
    <div className={`min-h-screen ${d ? 'bg-gray-950 text-gray-100' : 'bg-white text-gray-900'}`}>
      <header className={`border-b px-6 py-4 flex items-center justify-between ${d ? 'border-gray-800' : 'border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <Link href="/" className={`transition-colors ${d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-800'}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-lg">🗂️</span>
            <h1 className="text-lg font-semibold">Workspace</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm ${d ? 'text-gray-500' : 'text-gray-400'}`}>/workspace/projects</span>
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg transition-colors ${d ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
            title={d ? 'Switch to light' : 'Switch to dark'}
          >
            {d ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <span className="text-6xl opacity-30">📂</span>
            <p className={d ? 'text-gray-400' : 'text-gray-500'}>No projects yet.</p>
            <p className={`text-sm ${d ? 'text-gray-600' : 'text-gray-400'}`}>Ask the AI to create a project and it will appear here.</p>
          </div>
        ) : (
          <>
            <p className={`text-sm mb-6 ${d ? 'text-gray-500' : 'text-gray-400'}`}>
              {projects.length} project{projects.length !== 1 ? 's' : ''}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map(project => (
                <Link
                  key={project.name}
                  href={`/workspace/${project.name}`}
                  className={`group block p-5 rounded-xl border transition-all ${
                    d
                      ? 'border-gray-800 hover:border-indigo-700 bg-gray-900/50 hover:bg-indigo-950/30'
                      : 'border-gray-200 hover:border-indigo-400 bg-gray-50 hover:bg-indigo-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xl shrink-0">📁</span>
                      <span className={`font-medium truncate transition-colors ${d ? 'text-gray-200 group-hover:text-indigo-300' : 'text-gray-800 group-hover:text-indigo-600'}`}>
                        {project.name}
                      </span>
                    </div>
                    <svg className={`w-4 h-4 shrink-0 mt-0.5 transition-colors ${d ? 'text-gray-600 group-hover:text-indigo-400' : 'text-gray-400 group-hover:text-indigo-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <p className={`mt-2.5 text-xs transition-colors ${d ? 'text-gray-600 group-hover:text-gray-500' : 'text-gray-400 group-hover:text-gray-600'}`}>
                    {project.fileCount} file{project.fileCount !== 1 ? 's' : ''}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

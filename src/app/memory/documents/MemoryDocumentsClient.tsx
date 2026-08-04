'use client';

import Link from 'next/link';
import DocumentUpload from '@/app/components/documents/DocumentUpload';
import { useTheme } from '@/app/context/ThemeContext';

export default function MemoryDocumentsClient({ userId }: { userId: string }) {
  const { isDark } = useTheme();
  return (
    <div className={`h-full overflow-y-auto ${isDark ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-semibold">Knowledge · Documents</h1>
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Documents uploaded here provide retrieval context to your personal knowledge graph.
            </p>
          </div>
          <Link href="/memory" className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm">
            Back to Knowledge
          </Link>
        </div>
        <div className={`rounded-xl border p-5 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <DocumentUpload
            githubToken=""
            userId={userId}
            isDarkMode={isDark}
            domainSlug="memory"
          />
        </div>
      </div>
    </div>
  );
}

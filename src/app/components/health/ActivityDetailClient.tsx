'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/app/context/ThemeContext';
import ActivityDetailPanel from './ActivityDetailPanel';

interface Props {
  activityId: string;
}

export default function ActivityDetailClient({ activityId }: Props) {
  const { isDark: d } = useTheme();
  const t = useTranslations('health');

  const pageBg = d ? 'bg-gray-900' : 'bg-white';

  return (
    // The app shell (GlobalShell.tsx) wraps page content in a fixed-height,
    // overflow-hidden flex-1 div — this page must own its own scroll region
    // rather than relying on document-level scrolling, or content past the
    // viewport (e.g. the zones panel) is silently clipped with no scrollbar.
    <div className={`h-full overflow-y-auto ${pageBg}`}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <Link
          href="/health"
          className={`inline-flex items-center gap-1 text-sm mb-4 ${d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
        >
          ← {t('backToHealth')}
        </Link>

        <ActivityDetailPanel activityId={activityId} isDarkMode={d} />
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useTheme } from '@/app/context/ThemeContext';
import { AGENT_HOME_PATH, getDataPage, type DataPageId } from '@/lib/legacy-domains';
import HealthDashboard from '@/app/components/health/HealthDashboard';
import VaultPanel from '@/app/notes/VaultPanel';
import EmailPanel from '@/app/components/email/EmailPanel';
import JobsPanel from '@/app/jobs/JobsPanel';
import MemoryGraphPanel from '@/app/memory/MemoryGraphPanel';
import MusicDashboard from '@/app/components/music/MusicDashboard';
import TelegramBotSettings from '@/app/components/settings/TelegramBotSettings';

interface Props {
  page: DataPageId;
  userId: string;
  isAdmin: boolean;
}

/**
 * A data page (dashboard, editor, inbox) rendered as a plain view, without
 * the domain chat, tabs or taskbar. Used when ALLERAC_LEGACY_DOMAINS is off.
 */
export default function DataPageView({ page, userId, isAdmin }: Props) {
  const { isDark: d } = useTheme();
  const router = useRouter();
  const meta = getDataPage(page);
  const back = () => router.push(AGENT_HOME_PATH);

  let body: ReactNode = null;
  switch (page) {
    case 'health':
      body = <HealthDashboard isOpen onClose={back} isDarkMode={d} userId={userId} inline syncUrl />;
      break;
    case 'notes':
      body = <VaultPanel userId={userId} isDarkMode={d} />;
      break;
    case 'email':
      body = <EmailPanel isDarkMode={d} onContextUpdate={() => {}} />;
      break;
    case 'jobs':
      body = <JobsPanel userId={userId} isDarkMode={d} domainSlug="jobs" />;
      break;
    case 'memory':
      body = <MemoryGraphPanel />;
      break;
    case 'music':
      body = <MusicDashboard isDarkMode={d} />;
      break;
    case 'channels':
      body = <TelegramBotSettings userId={userId} displayMode="page" isDarkMode={d} />;
      break;
  }

  const muted = d ? 'text-gray-400' : 'text-gray-500';
  return (
    <div className={`flex h-[100dvh] flex-col ${d ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`} data-testid={`data-page-${page}`}>
      <header className={`flex flex-shrink-0 items-center gap-3 border-b px-4 py-2 text-sm ${d ? 'border-gray-800' : 'border-gray-200'}`}>
        <Link href={AGENT_HOME_PATH} className={`${muted} hover:underline`} data-testid="data-page-back">← Agents</Link>
        {isAdmin && <Link href="/hub" className={`${muted} hover:underline`}>Hub</Link>}
        <span className="flex-1 text-right font-semibold">{meta ? `${meta.icon} ${meta.label}` : page}</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{body}</div>
    </div>
  );
}

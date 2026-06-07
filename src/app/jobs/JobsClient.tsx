'use client';

import { useTheme } from '@/app/context/ThemeContext';
import { useState, useEffect } from 'react';
import { DomainProvider, type ToolCallEvent } from '@/app/context/DomainContext';
import MyAlleracModal from '@/app/components/allerac/MyAlleracModal';
import JobsPanel from './JobsPanel';
import ClippyAssistant from './ClippyAssistant';

interface Props {
  userId: string;
  userName: string | null;
  userEmail: string;
  isAdmin: boolean;
  defaultSkillName?: string;
}

export default function JobsClient({ userId, userName, userEmail, defaultSkillName }: Props) {
  const { isDark: isDarkMode, toggleDark } = useTheme();
  const [isMyAlleracOpen, setIsMyAlleracOpen] = useState(false);
  const [lastToolCall, setLastToolCall]      = useState<ToolCallEvent | null>(null);
  const [githubToken, setGithubToken]        = useState('');

  useEffect(() => {
    setGithubToken(localStorage.getItem('github_token') || '');
  }, []);

  useEffect(() => {
    const open = () => setIsMyAlleracOpen(true);
    window.addEventListener('openMyAlleracModal', open);
    return () => window.removeEventListener('openMyAlleracModal', open);
  }, []);

  const d           = isDarkMode;
  const displayName = userName?.split(' ')[0] || 'there';

  return (
    <DomainProvider value={{ isDark: d, lastToolCall, setLastToolCall, postContext: '', setPostContext: () => {} }}>
      <div className={`h-full flex flex-col ${d ? 'bg-gray-900' : 'bg-white'}`}>

        <div className="flex flex-1 overflow-hidden">
          <JobsPanel userId={userId} isDarkMode={d} domainSlug="jobs" />
        </div>

        <ClippyAssistant
          userId={userId}
          defaultSkillName={defaultSkillName}
          displayName={displayName}
          githubToken={githubToken}
          bottomOffset={60}
        />

        <MyAlleracModal
          isOpen={isMyAlleracOpen}
          onClose={() => setIsMyAlleracOpen(false)}
          isDarkMode={d}
          userId={userId}
          githubToken={githubToken}
          userName={userName ?? undefined}
          domainSlug="jobs"
        />
      </div>
    </DomainProvider>
  );
}

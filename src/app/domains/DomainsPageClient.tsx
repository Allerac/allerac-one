'use client';

import { useRouter } from 'next/navigation';
import DomainSkillsModal from '@/app/components/hub/DomainSkillsModal';
import { useTheme } from '@/app/context/ThemeContext';

interface DomainsPageClientProps {
  userId: string;
}

export default function DomainsPageClient({ userId }: DomainsPageClientProps) {
  const router = useRouter();
  const { isDark } = useTheme();

  const leaveDomains = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/');
  };

  return (
    <DomainSkillsModal
      isOpen
      displayMode="page"
      onClose={leaveDomains}
      userId={userId}
      isDarkMode={isDark}
    />
  );
}

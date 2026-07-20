'use client';

import { useRouter } from 'next/navigation';
import ConfigModal from '@/app/components/layout/ConfigModal';
import { useTheme } from '@/app/context/ThemeContext';

interface ConfigPageClientProps {
  userId: string;
  userName: string | null;
  userEmail: string;
}

export default function ConfigPageClient({ userId, userName, userEmail }: ConfigPageClientProps) {
  const router = useRouter();
  const { isDark } = useTheme();

  const leaveConfig = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/');
  };

  return (
    <ConfigModal
      isOpen
      displayMode="page"
      onClose={leaveConfig}
      userId={userId}
      userName={userName}
      userEmail={userEmail}
      isDarkMode={isDark}
    />
  );
}

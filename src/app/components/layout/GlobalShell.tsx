'use client';

import { ThemeProvider } from '@/app/context/ThemeContext';

interface User {
  id: string;
  name: string | null;
  email: string;
}

interface Props {
  user: User | null;
  children: React.ReactNode;
}

export default function GlobalShell({ children }: Props) {
  return (
    <ThemeProvider>
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </ThemeProvider>
  );
}

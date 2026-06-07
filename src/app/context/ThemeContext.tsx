'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface ThemeCtx {
  isDark: boolean;
  toggleDark: () => void;
}

const ThemeContext = createContext<ThemeCtx>({ isDark: true, toggleDark: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('allerac_theme');
    if (saved !== null) setIsDark(saved === 'dark');
  }, []);

  const toggleDark = () => {
    setIsDark(v => {
      const next = !v;
      localStorage.setItem('allerac_theme', next ? 'dark' : 'light');
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

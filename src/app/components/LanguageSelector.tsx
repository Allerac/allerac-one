'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateLanguage } from '@/app/actions/user';

interface LanguageSelectorProps {
  currentLocale: string;
  isDarkMode: boolean;
}

const languages = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' }
];

export default function LanguageSelector({ currentLocale, isDarkMode }: LanguageSelectorProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocale = e.target.value;
    startTransition(async () => {
      await updateLanguage(newLocale);
      router.refresh();
    });
  };

  return (
    <select
      value={currentLocale}
      onChange={handleChange}
      disabled={isPending}
      className={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        isDarkMode
          ? 'bg-gray-700 border-gray-600 text-gray-100'
          : 'bg-white border-gray-300 text-gray-900'
      } ${isPending ? 'opacity-50' : ''}`}
    >
      {languages.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.label}
        </option>
      ))}
    </select>
  );
}

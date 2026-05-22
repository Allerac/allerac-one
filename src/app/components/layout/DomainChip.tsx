'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getUserAccessibleDomains } from '@/app/actions/domains';

const DOMAIN_META: Record<string, { label: string; icon: string }> = {
  chat:    { label: 'Chat',    icon: '💬' },
  code:    { label: 'Code',    icon: '💻' },
  design:  { label: 'Design',  icon: '🎨' },
  health:  { label: 'Health',  icon: '❤️' },
  finance: { label: 'Finance', icon: '💰' },
  recipes: { label: 'Recipes', icon: '🍳' },
  write:   { label: 'Content', icon: '✍️' },
  social:  { label: 'Social',  icon: '📸' },
  tickets: { label: 'Tickets', icon: '🎫' },
};

interface Props {
  isDark: boolean;
  domainId: string;
  userId: string;
  isAdmin: boolean;
}

export default function DomainChip({ isDark: d, domainId, userId, isAdmin }: Props) {
  const router = useRouter();
  const [open, setOpen]     = useState(false);
  const [domains, setDomains] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const meta = DOMAIN_META[domainId] ?? { label: domainId, icon: '◆' };

  useEffect(() => {
    getUserAccessibleDomains(userId, isAdmin).then(setDomains);
  }, [userId, isAdmin]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-semibold transition-colors ${
          d
            ? `border-gray-700 ${open ? 'bg-gray-800' : 'hover:bg-gray-800'} text-gray-100`
            : `border-gray-200 ${open ? 'bg-gray-100' : 'hover:bg-gray-100'} text-gray-900`
        }`}
      >
        <span>{meta.icon}</span>
        <span>{meta.label}</span>
        <svg className={`w-3 h-3 ${d ? 'text-gray-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className={`absolute top-[calc(100%+6px)] left-1/2 -translate-x-1/2 min-w-[180px] rounded-xl shadow-2xl border z-50 p-1.5 ${
          d ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          {domains.map(slug => {
            const m = DOMAIN_META[slug] ?? { label: slug, icon: '◆' };
            const isActive = slug === domainId;
            return (
              <button
                key={slug}
                onClick={() => { setOpen(false); if (!isActive) router.push(`/${slug}`); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? d ? 'bg-indigo-900/40 text-indigo-300' : 'bg-indigo-50 text-indigo-600'
                    : d ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
                } ${isActive ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <span className="text-base">{m.icon}</span>
                <span className="flex-1 text-left">{m.label}</span>
                {isActive && (
                  <svg className={`w-3.5 h-3.5 ${d ? 'text-indigo-400' : 'text-indigo-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

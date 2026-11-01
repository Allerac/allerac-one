'use client';

import type { ReactNode } from 'react';

/**
 * Shared sidebar row (conversations and agents) so spacing, hover and active
 * styles cannot drift between sections, desktop and mobile.
 */
export function sidebarRowClass(isDark: boolean, active: boolean): string {
  return `flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left min-w-0 ${
    active
      ? isDark ? 'bg-gray-800 text-white' : 'bg-indigo-50 text-indigo-900'
      : isDark ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100'
  }`;
}

/** Section header matching "Conversations" / "Pinned" / "Recent". */
export function sidebarHeaderClass(isDark: boolean): string {
  return `text-xs uppercase transition-colors ${isDark ? 'text-gray-400 group-hover:text-gray-300' : 'text-gray-500 group-hover:text-gray-700'}`;
}

interface Props {
  isDark: boolean;
  active?: boolean;
  dimmed?: boolean;
  onClick: () => void;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right side of the title line (time, badges). */
  trailing?: ReactNode;
  tooltip?: string;
  testId?: string;
  ariaLabel?: string;
}

export default function SidebarRow({
  isDark, active = false, dimmed = false, onClick, leading, title, subtitle, trailing, tooltip, testId, ariaLabel,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      data-testid={testId}
      className={`w-full ${sidebarRowClass(isDark, active)} ${dimmed ? 'opacity-60' : ''}`}
    >
      {leading}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span className="truncate flex-1">{title}</span>
          {trailing}
        </span>
        {subtitle && <span className={`truncate text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{subtitle}</span>}
      </span>
    </button>
  );
}

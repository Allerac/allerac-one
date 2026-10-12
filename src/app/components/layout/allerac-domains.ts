export interface AlleracDomain {
  key: string;
  name: string;
  icon: string;
  path: string;
}

export const ALLERAC_DOMAINS: AlleracDomain[] = [
  { key: 'chat',      name: 'Chat',      icon: '💬', path: '/chat' },
  { key: 'code',      name: 'Code',      icon: '💻', path: '/code' },
  { key: 'notes',     name: 'Notes',     icon: '📝', path: '/notes' },
  { key: 'jobs',      name: 'Jobs',      icon: '⏰', path: '/jobs' },
  { key: 'memory',    name: 'Knowledge', icon: '🗂️', path: '/memory' },
  { key: 'health',    name: 'Health',    icon: '❤️', path: '/health' },
  { key: 'email',     name: 'Email',     icon: '✉️', path: '/email' },
  { key: 'search',    name: 'Search',    icon: '🔍', path: '/search' },
  { key: 'social',    name: 'Social',    icon: '📸', path: '/social' },
  { key: 'tickets',   name: 'Tickets',   icon: '🎫', path: '/tickets' },
  { key: 'workspace', name: 'Workspace', icon: '🖥️', path: '/workspace' },
  { key: 'admin',     name: 'Admin',     icon: '⚙️', path: '/admin' },
  { key: 'channels', name: 'Channels', icon: '📡', path: '/channels' },
  { key: 'sales',     name: 'Sales',     icon: '📣', path: '/sales' },
  { key: 'openworld', name: 'OpenWorld', icon: '🌐', path: '/openworld' },
];

export function getDomainByKey(key: string): AlleracDomain | undefined {
  return ALLERAC_DOMAINS.find(d => d.key === key);
}

export function getDomainByPath(pathname: string): AlleracDomain | undefined {
  return ALLERAC_DOMAINS.find(d => pathname === d.path || pathname.startsWith(d.path + '/'));
}

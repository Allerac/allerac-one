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
  { key: 'finance',   name: 'Finance',   icon: '💰', path: '/finance' },
  { key: 'health',    name: 'Health',    icon: '❤️', path: '/health' },
  { key: 'email',     name: 'Email',     icon: '✉️', path: '/email' },
  { key: 'search',    name: 'Search',    icon: '🔍', path: '/search' },
  { key: 'design',    name: 'Design',    icon: '🎨', path: '/design' },
  { key: 'social',    name: 'Social',    icon: '📸', path: '/social' },
  { key: 'recipes',   name: 'Recipes',   icon: '🍳', path: '/recipes' },
  { key: 'tickets',   name: 'Tickets',   icon: '🎫', path: '/tickets' },
  { key: 'write',     name: 'Content',   icon: '✍️', path: '/write' },
  { key: 'workspace', name: 'Workspace', icon: '🖥️', path: '/workspace' },
  { key: 'space',     name: 'Space',     icon: '🛰️', path: '/space' },
  { key: 'admin',     name: 'Admin',     icon: '⚙️', path: '/admin' },
];

export function getDomainByKey(key: string): AlleracDomain | undefined {
  return ALLERAC_DOMAINS.find(d => d.key === key);
}

export function getDomainByPath(pathname: string): AlleracDomain | undefined {
  return ALLERAC_DOMAINS.find(d => pathname === d.path || pathname.startsWith(d.path + '/'));
}

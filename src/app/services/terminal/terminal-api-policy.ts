import { AuthService, type User } from '@/app/services/auth/auth.service';

export const TERMINAL_BASE_SCOPES = ['profile:read', 'capabilities:read', 'domains:read'];
const groups = [
  { id: 'notes-read', domain: 'notes', label: 'Consultar notas', scopes: ['notes:read'] },
  { id: 'notes-write', domain: 'notes', label: 'Criar e alterar notas', scopes: ['notes:read', 'notes:write'] },
  { id: 'tickets-read', domain: 'tickets', label: 'Consultar tarefas', scopes: ['tickets:read'] },
  { id: 'tickets-write', domain: 'tickets', label: 'Criar e alterar tarefas', scopes: ['tickets:read', 'tickets:write'] },
  { id: 'jobs-read', domain: 'jobs', label: 'Consultar agendamentos', scopes: ['jobs:read'] },
  { id: 'jobs-write', domain: 'jobs', label: 'Criar e alterar agendamentos (podem consumir API e enviar notificações)', scopes: ['jobs:read', 'jobs:write'] },
  { id: 'memory', domain: 'memory', label: 'Consultar memórias e documentos', scopes: ['memory:read', 'documents:read'] },
  { id: 'health', domain: 'health', label: 'Consultar saúde e Garmin', scopes: ['health:read', 'health:proxy:read'] },
];

export async function terminalApiPolicy(user: User) {
  const auth = new AuthService();
  const domains = [...new Set(groups.map(group => group.domain))];
  const checks = await Promise.all(domains.map(async domain => [domain, await auth.canAccessDomain(user.id, user.is_admin, domain)] as const));
  const access = new Map(checks);
  const options = groups.filter(group => access.get(group.domain)).map(({ id, label, scopes }) => ({ id, label, scopes }));
  return { options, baseScopes: TERMINAL_BASE_SCOPES, allowedScopes: [...new Set([...TERMINAL_BASE_SCOPES, ...options.flatMap(option => option.scopes)])] };
}

export function terminalApiKeyName(provider: string) { return `Terminal API · ${provider}`; }

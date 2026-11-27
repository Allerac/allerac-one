/** Client calls for bot management (multi-bot PR 4). Admin session only. */
import type { UnitAgent } from '@/app/services/agent/unit-agents';

export interface BotCapability {
  id: string;
  label: string;
  kind: 'module' | 'core';
}

export class BotsApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'BotsApiError';
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => null) as { data?: T; error?: { code?: string; message?: string; details?: unknown } } | null;
  if (!response.ok) {
    throw new BotsApiError(response.status, body?.error?.code ?? 'error', body?.error?.message ?? `Request failed (${response.status})`, body?.error?.details);
  }
  return body?.data as T;
}

export const botsApi = {
  list: (includeArchived = false) => call<UnitAgent[]>(`/api/v1/unit/agents${includeArchived ? '?archived=true' : ''}`),
  get: (slug: string) => call<UnitAgent>(`/api/v1/unit/agents/${encodeURIComponent(slug)}`),
  create: (input: Record<string, unknown>) => call<UnitAgent>('/api/v1/unit/agents', { method: 'POST', body: JSON.stringify(input) }),
  update: (slug: string, input: Record<string, unknown>) => call<UnitAgent>(`/api/v1/unit/agents/${encodeURIComponent(slug)}`, {
    method: 'PATCH', body: JSON.stringify(input),
  }),
  /** Capabilities this Unit can offer (ALLERAC_MODULES applied). */
  capabilities: async (): Promise<BotCapability[]> => {
    const data = await call<{ capabilities: BotCapability[] }>('/api/v1/unit/agent-tools');
    return data.capabilities.map(({ id, label, kind }) => ({ id, label, kind }));
  },
};

/** Path of a bot's chat, of its settings, and of the creation form. */
export const botHref = (slug: string) => `/agents/self/${encodeURIComponent(slug)}`;
export const botSettingsHref = (slug: string) => `/agents/self/${encodeURIComponent(slug)}/settings`;
export const NEW_BOT_HREF = '/agents/self/new';

// In-memory fakes for federation tests (not a test file).
import { AgentsService, type AgentsRuntime } from '@/federation/agents.service';
import type { FederationAuditEntry, FederationAuditSink } from '@/federation/audit.repository';
import { FederationClient } from '@/federation/federation-client';
import type { User } from '@/app/services/auth/auth.service';
import { FederationError } from '@/federation/errors';
import { buildManifest, isPairingAccepted } from '@/federation/manifest';
import { PairingService, type PairingDeps, type PrincipalPort, type SecretBox } from '@/federation/pairing.service';
import { PeerClient, type FetchLike } from '@/federation/peer-client';
import type { NewPeer, PeerPatch, PeerRecord, PeerStore } from '@/federation/peer.types';

export class InMemoryPeerStore implements PeerStore {
  rows = new Map<string, PeerRecord>();

  async insert(peer: NewPeer): Promise<PeerRecord> {
    const now = new Date();
    const record: PeerRecord = { decidedBy: null, decidedAt: null, lastSeenAt: null, ...peer, createdAt: now, updatedAt: now };
    this.rows.set(record.id, record);
    return { ...record };
  }
  async get(id: string) { const row = this.rows.get(id); return row ? { ...row } : null; }
  async list() { return [...this.rows.values()].map(row => ({ ...row })); }
  async findOpenByOrigin(origin: string) {
    return [...this.rows.values()].find(row => row.origin === origin
      && ['pending_outbound', 'pending_inbound', 'active'].includes(row.status)) ?? null;
  }
  async findActiveByPrincipal(principalId: string) {
    return [...this.rows.values()].find(row => row.inboundPrincipalId === principalId && row.status === 'active') ?? null;
  }
  async countPendingInbound() { return [...this.rows.values()].filter(row => row.status === 'pending_inbound').length; }
  async expirePending(now: Date) {
    let count = 0;
    for (const row of this.rows.values()) {
      if ((row.status === 'pending_inbound' || row.status === 'pending_outbound') && row.expiresAt && row.expiresAt <= now) {
        row.status = 'expired';
        row.pairingSecretHash = null;
        row.pairingSecretEncrypted = null;
        count += 1;
      }
    }
    return count;
  }
  async update(id: string, patch: PeerPatch) {
    const row = this.rows.get(id);
    if (!row) return null;
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) (row as unknown as Record<string, unknown>)[key] = value;
    }
    row.updatedAt = new Date();
    return { ...row };
  }
}

export class FakePrincipals implements PrincipalPort {
  principals = new Map<string, { id: string; actingUserId: string; name: string; disabled: boolean }>();
  keys = new Map<string, { principalId: string; scopes: string[] }>();
  private counter = 0;

  async create(params: { name: string; peerUrl: string; actingUserId: string; createdBy: string }) {
    const id = `principal-${++this.counter}`;
    this.principals.set(id, { id, actingUserId: params.actingUserId, name: params.name, disabled: false });
    return { id, actingUserId: params.actingUserId };
  }
  async createKey(params: { principalId: string; actingUserId: string; name: string; scopes: string[] }) {
    const secret = `alr_live_${params.principalId}_${Math.random().toString(36).slice(2)}`;
    this.keys.set(secret, { principalId: params.principalId, scopes: params.scopes });
    return { secret, prefix: secret.slice(0, 16) };
  }
  async disable(id: string) {
    const principal = this.principals.get(id);
    if (!principal) return false;
    principal.disabled = true;
    return true;
  }
  /** Mirrors P0 auth: active principal + scope present. */
  resolve(key: string | undefined, scope: string): string | null {
    const entry = key ? this.keys.get(key) : undefined;
    if (!entry) return null;
    const principal = this.principals.get(entry.principalId);
    if (!principal || principal.disabled || !entry.scopes.includes(scope)) return null;
    return principal.id;
  }
}

export const fakeSecrets: SecretBox = {
  encrypt: value => `enc(${Buffer.from(value).toString('base64')})`,
  decrypt: value => Buffer.from(value.slice(4, -1), 'base64').toString(),
};

export class MemoryAudit implements FederationAuditSink {
  entries: FederationAuditEntry[] = [];
  async record(entry: FederationAuditEntry) { this.entries.push(entry); }
}

const allowAll = () => ({ allowed: true as const, lease: { release: () => undefined }, headers: {} });

/** In-memory AgentsRuntime: every domain listed is active; chat echoes the question. */
export function fakeAgentsRuntime(overrides: Partial<AgentsRuntime> = {}): AgentsRuntime & { chats: Array<Record<string, unknown>> } {
  const chats: Array<Record<string, unknown>> = [];
  return {
    chats,
    loadUser: async id => ({ id, email: `${id}@example.com`, name: id, is_admin: true, created_at: new Date() } as unknown as User),
    listActiveDomains: async slugs => slugs.map(slug => ({ slug, displayName: slug[0].toUpperCase() + slug.slice(1) })),
    canAccessDomain: async () => true,
    findOrCreateConversation: async (_userId, slug, title) => `conv:${slug}:${title}`,
    resolveModel: async () => ({ modelId: 'test-model', provider: 'ollama' }),
    runChat: async input => { chats.push(input); return { content: `answer from ${input.domain}: ${input.message}` }; },
    ...overrides,
  };
}

export interface FakeUnit {
  origin: string;
  env: Record<string, string>;
  store: InMemoryPeerStore;
  principals: FakePrincipals;
  service: PairingService;
  deps: PairingDeps;
  audit: MemoryAudit;
  runtime: ReturnType<typeof fakeAgentsRuntime>;
  agents: AgentsService;
  client: FederationClient;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Builds two or more Units wired through a fake network that dispatches fetch() calls to the right Unit. */
export function createNetwork(units: Array<{ origin: string; name: string; env?: Record<string, string> }>) {
  const byOrigin = new Map<string, FakeUnit>();
  const calls: string[] = [];

  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(input);
    calls.push(`${init?.method ?? 'GET'} ${url.href}`);
    const unit = byOrigin.get(url.origin);
    if (!unit) throw new TypeError('fetch failed');
    try {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (url.pathname === '/.well-known/allerac') {
        return json(buildManifest({ env: unit.env, requestUrl: url.href, release: '0.1.0' }));
      }
      if (url.pathname === '/api/v1/federation/pairing') {
        if (!isPairingAccepted(unit.env)) return json({ error: { code: 'not_found' } }, 404);
        return json({ data: await unit.service.receiveRequest(body, '203.0.113.7') }, 202);
      }
      const complete = url.pathname.match(/^\/api\/v1\/federation\/pairing\/([^/]+)\/complete$/);
      if (complete) return json({ data: await unit.service.complete(complete[1], body) });
      if (url.pathname === '/api/v1/federation/peer/revoke') {
        const key = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /, '');
        const principalId = unit.principals.resolve(key, 'federation:peer:revoke');
        if (!principalId) return json({ error: { code: 'unauthorized' } }, 401);
        await unit.service.revokeByPeer(principalId);
        return json({ data: { revoked: true } });
      }
      if (url.pathname === '/api/v1/federation/agents') {
        const key = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /, '');
        const principalId = unit.principals.resolve(key, 'federation:agents:list');
        if (!principalId) return json({ error: { code: 'unauthorized' } }, 401);
        const actingUserId = unit.principals.principals.get(principalId)!.actingUserId;
        return json({ data: { agents: await unit.agents.listAgents(principalId, actingUserId) } });
      }
      const ask = url.pathname.match(/^\/api\/v1\/federation\/agents\/([^/]+)\/ask$/);
      if (ask) {
        const key = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /, '');
        const principalId = unit.principals.resolve(key, 'federation:agents:ask');
        if (!principalId) return json({ error: { code: 'unauthorized' } }, 401);
        const actingUserId = unit.principals.principals.get(principalId)!.actingUserId;
        const result = await unit.agents.ask({
          principalId, actingUserId, agent: decodeURIComponent(ask[1]), question: body.question,
        });
        return json({ data: result });
      }
      return json({ error: { code: 'not_found' } }, 404);
    } catch (error) {
      if (error instanceof FederationError) return json({ error: { code: error.code } }, error.status);
      throw error;
    }
  };

  for (const unit of units) {
    const env = {
      ALLERAC_UNIT_NAME: unit.name,
      ALLERAC_PUBLIC_URL: unit.origin,
      ALLERAC_PROFILE: 'personal',
      ALLERAC_PAIRING_ACCEPT: 'true',
      ...unit.env,
    };
    const store = new InMemoryPeerStore();
    const principals = new FakePrincipals();
    const deps: PairingDeps = { store, principals, client: new PeerClient(fetchImpl, 1_000), secrets: fakeSecrets, env };
    const service = new PairingService(deps);
    const audit = new MemoryAudit();
    const runtime = fakeAgentsRuntime();
    const agents = new AgentsService({ runtime, store, audit, acquire: allowAll, env });
    const client = new FederationClient({ store, transport: new PeerClient(fetchImpl, 1_000), secrets: fakeSecrets, audit });
    byOrigin.set(unit.origin, { origin: unit.origin, env, store, principals, service, deps, audit, runtime, agents, client });
  }

  return { units: byOrigin, fetchImpl, calls };
}

/**
 * Minimal outbound HTTP client for Unit-to-Unit calls during pairing (P2).
 * P3 extends this into the shared federation client (signing, audit, scopes).
 */
import { z } from 'zod';
import { envFlag, type Env } from './env';
import { FederationError, federationErrors } from './errors';
import { FEDERATION_PROTOCOL_VERSION, federationManifestSchema, type FederationManifest } from './manifest.schema';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return host.includes(':');
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  // Single-label hosts (e.g. Docker service names) are internal.
  return !host.includes('.') && !host.includes(':');
}

/**
 * Normalizes a peer URL to its origin. https + public host is required unless
 * ALLERAC_FEDERATION_ALLOW_INSECURE=true (LAN, same-host, development).
 */
export function normalizePeerOrigin(raw: string, env: Env = process.env): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw federationErrors.invalidUrl();
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw federationErrors.invalidUrl();
  if (url.username || url.password) throw federationErrors.invalidUrl();
  const allowInsecure = envFlag(env, 'ALLERAC_FEDERATION_ALLOW_INSECURE', false);
  if (!allowInsecure && (url.protocol !== 'https:' || isPrivateHost(url.hostname))) {
    throw federationErrors.insecureUrl();
  }
  return url.origin;
}

export const pairingRequestSchema = z.object({
  fromOrigin: z.string().url(),
  fromRequestId: z.string().uuid(),
  nonce: z.string().min(16).max(128),
  pairingSecret: z.string().min(32).max(256),
  requestedCapabilities: z.array(z.string().min(1).max(100)).max(50),
}).strict();
export type PairingRequestBody = z.infer<typeof pairingRequestSchema>;

export const pairingRequestResponseSchema = z.object({
  requestId: z.string().uuid(),
  nonce: z.string().min(16).max(128),
}).strict();
export type PairingRequestResponse = z.infer<typeof pairingRequestResponseSchema>;

export const pairingCompleteSchema = z.object({
  pairingSecret: z.string().min(32).max(256),
  nonce: z.string().min(16).max(128),
  key: z.string().min(16).max(256),
  capabilities: z.array(z.string().min(1).max(100)).max(50),
}).strict();
export type PairingCompleteBody = z.infer<typeof pairingCompleteSchema>;

export const pairingCompleteResponseSchema = z.object({
  key: z.string().min(16).max(256),
  capabilities: z.array(z.string().min(1).max(100)).max(50),
}).strict();
export type PairingCompleteResponse = z.infer<typeof pairingCompleteResponseSchema>;

export class PeerClient {
  constructor(
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async fetchManifest(origin: string): Promise<FederationManifest> {
    const body = await this.request(`${origin}/.well-known/allerac`, { method: 'GET' });
    const parsed = federationManifestSchema.safeParse(body);
    if (!parsed.success) throw federationErrors.peerInvalidResponse('Peer manifest is invalid');
    if (parsed.data.protocolVersion !== FEDERATION_PROTOCOL_VERSION) {
      throw federationErrors.protocolMismatch(parsed.data.protocolVersion);
    }
    return parsed.data;
  }

  async sendPairingRequest(origin: string, body: PairingRequestBody): Promise<PairingRequestResponse> {
    const response = await this.request(`${origin}/api/v1/federation/pairing`, jsonInit(body));
    return parseData(pairingRequestResponseSchema, response);
  }

  async completePairing(origin: string, remoteRequestId: string, body: PairingCompleteBody): Promise<PairingCompleteResponse> {
    const response = await this.request(
      `${origin}/api/v1/federation/pairing/${encodeURIComponent(remoteRequestId)}/complete`,
      jsonInit(body),
    );
    return parseData(pairingCompleteResponseSchema, response);
  }

  async revoke(origin: string, key: string): Promise<void> {
    await this.request(`${origin}/api/v1/federation/peer/revoke`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
    });
  }

  /**
   * Authenticated call to a paired peer's Control API. Used only by the shared
   * FederationClient. Returns the `data` payload and response size.
   */
  async callPeer(params: {
    origin: string;
    path: string;
    key: string;
    method?: 'GET' | 'POST';
    body?: unknown;
    timeoutMs?: number;
    /** Extra request headers (e.g. Idempotency-Key). Authorization cannot be overridden. */
    headers?: Record<string, string>;
  }): Promise<{ data: unknown; status: number; responseBytes: number; requestBytes: number }> {
    const payload = params.body === undefined ? undefined : JSON.stringify(params.body);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${params.origin}${params.path}`, {
        method: params.method ?? 'GET',
        headers: {
          ...(params.headers ?? {}),
          Authorization: `Bearer ${params.key}`,
          ...(payload ? { 'Content-Type': 'application/json' } : {}),
        },
        body: payload,
        redirect: 'error',
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch {
      throw federationErrors.peerUnreachable();
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) throw federationErrors.peerInvalidResponse('Peer response is too large');
    if (response.status === 401 || response.status === 403) throw federationErrors.peerAccessDenied();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw federationErrors.peerInvalidResponse();
    }
    if (!response.ok) {
      const code = (json as { error?: { code?: string } } | null)?.error?.code;
      throw new FederationError(
        code === 'rate_limited' || response.status === 429 ? 'peer_rate_limited'
          : code === 'conversation_not_found' ? 'peer_conversation_not_found'
            : code === 'ask_in_progress' ? 'peer_ask_in_progress'
              : 'peer_error',
        `Peer responded with HTTP ${response.status}${code ? ` (${code})` : ''}`,
        502,
      );
    }
    return {
      data: (json as { data?: unknown } | null)?.data,
      status: response.status,
      responseBytes: text.length,
      requestBytes: payload?.length ?? 0,
    };
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, { ...init, redirect: 'error', signal: controller.signal, cache: 'no-store' });
    } catch {
      throw federationErrors.peerUnreachable();
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) throw federationErrors.peerInvalidResponse('Peer response is too large');
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw federationErrors.peerInvalidResponse();
    }
    if (!response.ok) {
      const code = (json as { error?: { code?: string } } | null)?.error?.code;
      if (code === 'not_found' && url.endsWith('/api/v1/federation/pairing')) throw federationErrors.peerNotAccepting();
      throw federationErrors.peerUnreachable(`Peer responded with HTTP ${response.status}${code ? ` (${code})` : ''}`);
    }
    return json;
  }
}

function jsonInit(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function parseData<T>(schema: z.ZodType<T>, response: unknown): T {
  const parsed = schema.safeParse((response as { data?: unknown } | null)?.data);
  if (!parsed.success) throw federationErrors.peerInvalidResponse();
  return parsed.data;
}

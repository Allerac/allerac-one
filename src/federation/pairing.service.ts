/**
 * Federation pairing (roadmap P2).
 *
 * Handshake between an initiator (A) and a responder (B):
 *   1. A admin adds B by URL. A reads B's manifest and sends a pairing request
 *      with a nonce and a one-time pairing secret.
 *   2. B stores a pending request (nothing granted) and returns its own nonce.
 *      Both sides display the same verification code.
 *   3. B admin accepts. B creates a service principal + scoped key for A and
 *      calls A's complete endpoint with the pairing secret and that key.
 *   4. A verifies the secret, stores B's key encrypted, creates its own
 *      principal + key for B, and returns it. Both peers are active.
 */
import crypto from 'crypto';
import { capabilitiesToScopes, getAdvertisedCapabilities, UnknownCapabilityError } from './capabilities';
import type { Env } from './env';
import { federationErrors } from './errors';
import { isPairingAccepted } from './manifest';
import { normalizePeerOrigin, type PeerClient, type PairingCompleteBody, type PairingRequestBody } from './peer-client';
import type { PeerRecord, PeerStore } from './peer.types';

export const PAIRING_TTL_MS = 15 * 60 * 1_000;
export const MAX_PENDING_INBOUND = 20;
const REVOKE_SCOPE = 'federation:peer:revoke';

export interface PrincipalPort {
  create(params: { name: string; peerUrl: string; actingUserId: string; createdBy: string }): Promise<{ id: string; actingUserId: string }>;
  createKey(params: { principalId: string; actingUserId: string; name: string; scopes: string[] }): Promise<{ secret: string; prefix: string }>;
  disable(id: string): Promise<boolean>;
}

export interface SecretBox {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

export interface PairingDeps {
  store: PeerStore;
  principals: PrincipalPort;
  client: PeerClient;
  secrets: SecretBox;
  env?: Env;
  now?: () => Date;
}

export interface PeerView {
  id: string;
  unitName: string;
  displayName: string | null;
  origin: string;
  initiatedByUs: boolean;
  status: PeerRecord['status'];
  inboundCapabilities: string[];
  outboundCapabilities: string[];
  outboundKeyPrefix: string | null;
  verificationCode: string | null;
  expiresAt: string | null;
  decidedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

const randomToken = (bytes: number) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** 6-digit code both admins compare. Depends on both nonces and both origins. */
export function verificationCode(params: {
  initiatorNonce: string;
  responderNonce: string;
  initiatorOrigin: string;
  responderOrigin: string;
}): string {
  const digest = crypto.createHash('sha256')
    .update([params.initiatorNonce, params.responderNonce, params.initiatorOrigin, params.responderOrigin].join('|'))
    .digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

export class PairingService {
  private readonly env: Env;
  private readonly now: () => Date;

  constructor(private readonly deps: PairingDeps) {
    this.env = deps.env ?? process.env;
    this.now = deps.now ?? (() => new Date());
  }

  /** Our own origin; required so peers can call us back. */
  localOrigin(): string {
    const raw = this.env.ALLERAC_PUBLIC_URL?.trim();
    if (!raw) throw federationErrors.localUrlMissing();
    try {
      return new URL(raw).origin;
    } catch {
      throw federationErrors.localUrlMissing();
    }
  }

  toView(peer: PeerRecord): PeerView {
    return {
      id: peer.id,
      unitName: peer.unitName,
      displayName: peer.displayName,
      origin: peer.origin,
      initiatedByUs: peer.initiatedByUs,
      status: peer.status,
      inboundCapabilities: peer.inboundCapabilities,
      outboundCapabilities: peer.outboundCapabilities,
      outboundKeyPrefix: peer.outboundKeyPrefix,
      verificationCode: this.codeFor(peer),
      expiresAt: peer.expiresAt ? new Date(peer.expiresAt).toISOString() : null,
      decidedAt: peer.decidedAt ? new Date(peer.decidedAt).toISOString() : null,
      lastSeenAt: peer.lastSeenAt ? new Date(peer.lastSeenAt).toISOString() : null,
      createdAt: new Date(peer.createdAt).toISOString(),
    };
  }

  private codeFor(peer: PeerRecord): string | null {
    if (!peer.nonceLocal || !peer.nonceRemote) return null;
    if (peer.status !== 'pending_inbound' && peer.status !== 'pending_outbound') return null;
    let self: string;
    try {
      self = this.localOrigin();
    } catch {
      return null;
    }
    return peer.initiatedByUs
      ? verificationCode({ initiatorNonce: peer.nonceLocal, responderNonce: peer.nonceRemote, initiatorOrigin: self, responderOrigin: peer.origin })
      : verificationCode({ initiatorNonce: peer.nonceRemote, responderNonce: peer.nonceLocal, initiatorOrigin: peer.origin, responderOrigin: self });
  }

  private scopesFor(capabilities: string[]): string[] {
    try {
      return [...capabilitiesToScopes(capabilities, this.env), REVOKE_SCOPE];
    } catch (error) {
      if (error instanceof UnknownCapabilityError) throw federationErrors.unknownCapability(error.message);
      throw error;
    }
  }

  private validateCapabilityIds(ids: string[]): void {
    this.scopesFor(ids);
  }

  private expiry(): Date {
    return new Date(this.now().getTime() + PAIRING_TTL_MS);
  }

  private isExpired(peer: PeerRecord): boolean {
    return Boolean(peer.expiresAt && new Date(peer.expiresAt).getTime() <= this.now().getTime());
  }

  async list(): Promise<PeerView[]> {
    await this.deps.store.expirePending(this.now());
    return (await this.deps.store.list()).map(peer => this.toView(peer));
  }

  /** Reads and validates a peer manifest without creating anything. */
  async discover(url: string) {
    const origin = normalizePeerOrigin(url, this.env);
    const manifest = await this.deps.client.fetchManifest(origin);
    return { origin, manifest };
  }

  /** A side: start pairing with the Unit at `url`. */
  async initiate(params: { url: string; grants: string[]; requested?: string[]; adminId: string }): Promise<PeerView> {
    const self = this.localOrigin();
    const origin = normalizePeerOrigin(params.url, this.env);
    if (origin === self) throw federationErrors.selfPairing();
    this.validateCapabilityIds(params.grants);
    await this.deps.store.expirePending(this.now());
    if (await this.deps.store.findOpenByOrigin(origin)) throw federationErrors.alreadyPaired();

    const manifest = await this.deps.client.fetchManifest(origin);
    if (!manifest.pairing.accepting) throw federationErrors.peerNotAccepting();
    const offered = manifest.capabilities.map(capability => capability.id);
    const requested = (params.requested ?? offered).filter(id => offered.includes(id));

    const id = crypto.randomUUID();
    const nonce = randomToken(24);
    const pairingSecret = randomToken(32);
    const body: PairingRequestBody = {
      fromOrigin: self,
      fromRequestId: id,
      nonce,
      pairingSecret,
      requestedCapabilities: requested,
    };
    const response = await this.deps.client.sendPairingRequest(origin, body);

    const peer = await this.deps.store.insert({
      id,
      unitName: manifest.unit.name,
      displayName: manifest.unit.displayName,
      origin,
      protocolVersion: manifest.protocolVersion,
      initiatedByUs: true,
      status: 'pending_outbound',
      inboundPrincipalId: null,
      inboundCapabilities: params.grants,
      outboundCapabilities: requested,
      outboundKeyEncrypted: null,
      outboundKeyPrefix: null,
      nonceLocal: nonce,
      nonceRemote: response.nonce,
      pairingSecretHash: sha256(pairingSecret),
      pairingSecretEncrypted: null,
      remoteRequestId: response.requestId,
      requestIp: null,
      expiresAt: this.expiry(),
      createdBy: params.adminId,
    });
    return this.toView(peer);
  }

  /** B side: receive an unauthenticated pairing request. Creates a pending row only. */
  async receiveRequest(body: PairingRequestBody, requestIp: string | null): Promise<{ requestId: string; nonce: string }> {
    if (!isPairingAccepted(this.env)) throw federationErrors.notAccepting();
    const self = this.localOrigin();
    const origin = normalizePeerOrigin(body.fromOrigin, this.env);
    if (origin === self) throw federationErrors.selfPairing();

    await this.deps.store.expirePending(this.now());
    if (await this.deps.store.countPendingInbound() >= MAX_PENDING_INBOUND) throw federationErrors.tooManyPending();
    if (await this.deps.store.findOpenByOrigin(origin)) throw federationErrors.alreadyPaired();

    const advertised = new Set(getAdvertisedCapabilities(this.env).map(capability => capability.id as string));
    const requested = body.requestedCapabilities.filter(id => advertised.has(id));

    // Confirm the claimed origin is an Allerac Unit; we only ever call it back there.
    const manifest = await this.deps.client.fetchManifest(origin);

    const nonce = randomToken(24);
    const peer = await this.deps.store.insert({
      id: crypto.randomUUID(),
      unitName: manifest.unit.name,
      displayName: manifest.unit.displayName,
      origin,
      protocolVersion: manifest.protocolVersion,
      initiatedByUs: false,
      status: 'pending_inbound',
      inboundPrincipalId: null,
      inboundCapabilities: requested,
      outboundCapabilities: [],
      outboundKeyEncrypted: null,
      outboundKeyPrefix: null,
      nonceLocal: nonce,
      nonceRemote: body.nonce,
      pairingSecretHash: null,
      pairingSecretEncrypted: this.deps.secrets.encrypt(body.pairingSecret),
      remoteRequestId: body.fromRequestId,
      requestIp,
      expiresAt: this.expiry(),
      createdBy: null,
    });
    return { requestId: peer.id, nonce };
  }

  private async issueInbound(peer: PeerRecord, capabilities: string[], adminId: string) {
    const scopes = this.scopesFor(capabilities);
    const principal = await this.deps.principals.create({
      name: `peer:${peer.unitName}:${randomToken(4)}`,
      peerUrl: peer.origin,
      actingUserId: adminId,
      createdBy: adminId,
    });
    const key = await this.deps.principals.createKey({
      principalId: principal.id,
      actingUserId: principal.actingUserId,
      name: `federation ${peer.unitName}`,
      scopes,
    });
    return { principal, key };
  }

  /** B side: admin accepts a pending inbound request. */
  async accept(params: { peerId: string; grants?: string[]; adminId: string }): Promise<PeerView> {
    const peer = await this.deps.store.get(params.peerId);
    if (!peer) throw federationErrors.notFound();
    if (peer.status !== 'pending_inbound') throw federationErrors.invalidState();
    if (this.isExpired(peer)) {
      await this.deps.store.update(peer.id, { status: 'expired', pairingSecretEncrypted: null });
      throw federationErrors.expired();
    }
    if (!peer.pairingSecretEncrypted || !peer.remoteRequestId || !peer.nonceLocal) throw federationErrors.invalidState();

    const grants = params.grants ?? peer.inboundCapabilities;
    const { principal, key } = await this.issueInbound(peer, grants, params.adminId);

    const body: PairingCompleteBody = {
      pairingSecret: this.deps.secrets.decrypt(peer.pairingSecretEncrypted),
      nonce: peer.nonceLocal,
      key: key.secret,
      capabilities: grants,
    };
    let response;
    try {
      response = await this.deps.client.completePairing(peer.origin, peer.remoteRequestId, body);
    } catch (error) {
      await this.deps.principals.disable(principal.id);
      throw error;
    }

    const updated = await this.deps.store.update(peer.id, {
      status: 'active',
      inboundPrincipalId: principal.id,
      inboundCapabilities: grants,
      outboundCapabilities: response.capabilities,
      outboundKeyEncrypted: this.deps.secrets.encrypt(response.key),
      outboundKeyPrefix: response.key.slice(0, 16),
      pairingSecretEncrypted: null,
      expiresAt: null,
      decidedBy: params.adminId,
      decidedAt: this.now(),
    });
    return this.toView(updated ?? peer);
  }

  /** B side: admin rejects a pending inbound request. */
  async reject(params: { peerId: string; adminId: string }): Promise<PeerView> {
    const peer = await this.deps.store.get(params.peerId);
    if (!peer) throw federationErrors.notFound();
    if (peer.status !== 'pending_inbound') throw federationErrors.invalidState();
    const updated = await this.deps.store.update(peer.id, {
      status: 'rejected',
      pairingSecretEncrypted: null,
      decidedBy: params.adminId,
      decidedAt: this.now(),
    });
    return this.toView(updated ?? peer);
  }

  /** A side: the responder completes the handshake. Authenticated by the pairing secret. */
  async complete(requestId: string, body: PairingCompleteBody): Promise<{ key: string; capabilities: string[] }> {
    const peer = await this.deps.store.get(requestId);
    if (!peer || peer.status !== 'pending_outbound' || !peer.pairingSecretHash || !peer.createdBy) {
      throw federationErrors.invalidPairingProof();
    }
    if (!safeEqual(sha256(body.pairingSecret), peer.pairingSecretHash) || !peer.nonceRemote || !safeEqual(body.nonce, peer.nonceRemote)) {
      throw federationErrors.invalidPairingProof();
    }
    if (this.isExpired(peer)) {
      await this.deps.store.update(peer.id, { status: 'expired', pairingSecretHash: null });
      throw federationErrors.expired();
    }

    // Single use: clear the secret before issuing anything.
    await this.deps.store.update(peer.id, { pairingSecretHash: null });

    const { principal, key } = await this.issueInbound(peer, peer.inboundCapabilities, peer.createdBy);
    await this.deps.store.update(peer.id, {
      status: 'active',
      inboundPrincipalId: principal.id,
      outboundCapabilities: body.capabilities,
      outboundKeyEncrypted: this.deps.secrets.encrypt(body.key),
      outboundKeyPrefix: body.key.slice(0, 16),
      expiresAt: null,
      decidedBy: peer.createdBy,
      decidedAt: this.now(),
    });
    return { key: key.secret, capabilities: peer.inboundCapabilities };
  }

  /** Either side: admin revokes or cancels. Local access stops immediately; the peer is notified best effort. */
  async revoke(params: { peerId: string }): Promise<PeerView> {
    const peer = await this.deps.store.get(params.peerId);
    if (!peer) throw federationErrors.notFound();
    if (peer.status === 'revoked') return this.toView(peer);

    if (peer.inboundPrincipalId) await this.deps.principals.disable(peer.inboundPrincipalId);

    if (peer.status === 'active' && peer.outboundKeyEncrypted) {
      try {
        await this.deps.client.revoke(peer.origin, this.deps.secrets.decrypt(peer.outboundKeyEncrypted));
      } catch {
        // Best effort: the peer's key for us is already useless on our side.
      }
    }

    const updated = await this.deps.store.update(peer.id, {
      status: 'revoked',
      outboundKeyEncrypted: null,
      pairingSecretHash: null,
      pairingSecretEncrypted: null,
    });
    return this.toView(updated ?? peer);
  }

  /** Called by a peer (authenticated with its service key) to end the pairing. */
  async revokeByPeer(principalId: string): Promise<boolean> {
    const peer = await this.deps.store.findActiveByPrincipal(principalId);
    await this.deps.principals.disable(principalId);
    if (!peer) return false;
    await this.deps.store.update(peer.id, {
      status: 'revoked',
      outboundKeyEncrypted: null,
    });
    return true;
  }
}

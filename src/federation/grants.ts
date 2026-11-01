/**
 * Per-pairing capability grants (federation P4d).
 *
 * Lets an admin add or remove an opt-in capability (e.g. federation.status.read)
 * on an existing pairing without re-pairing: the scopes of the peer's existing
 * federation key change in place. Only service-principal keys of an active peer
 * are touched, only capabilities this Unit advertises can be added, and the
 * revoke scope is always kept. The home learns the change from
 * `granted_capabilities` on its next call.
 */
import { isServiceAllowedScope } from '@/app/services/api-keys/api-key-scopes';
import { capabilitiesToScopes, FEDERATION_CAPABILITIES, scopesToCapabilityIds, UnknownCapabilityError } from './capabilities';
import type { Env } from './env';
import { FederationError, federationErrors } from './errors';
import type { FederationAuditSink } from './audit.repository';
import type { PeerRecord, PeerStore } from './peer.types';

export const REVOKE_SCOPE = 'federation:peer:revoke';

/** Scopes of a federation principal's live keys. */
export interface FederationKeyStore {
  scopesFor(principalId: string): Promise<string[]>;
  /** Replaces the scopes on every live key of this service principal; returns how many keys changed. */
  setScopes(principalId: string, scopes: string[]): Promise<number>;
}

export interface GrantsServiceDeps {
  peers: PeerStore;
  keys: FederationKeyStore;
  audit: FederationAuditSink;
  env?: Env;
}

export class GrantsService {
  constructor(private readonly deps: GrantsServiceDeps) {}

  /** Capability ids the calling peer's key holds (for `granted_capabilities`). */
  async grantedCapabilities(principalId: string): Promise<string[]> {
    return scopesToCapabilityIds(await this.deps.keys.scopesFor(principalId));
  }

  async update(params: { peerId: string; add?: string[]; remove?: string[]; adminId: string }): Promise<PeerRecord> {
    const peer = await this.deps.peers.get(params.peerId);
    if (!peer) throw federationErrors.notFound();
    if (peer.status !== 'active' || !peer.inboundPrincipalId) throw federationErrors.invalidState();
    const add = params.add ?? [];
    const remove = params.remove ?? [];
    if (add.length === 0 && remove.length === 0) throw new FederationError('validation_error', 'Nothing to change', 400);

    let addScopes: string[];
    try {
      addScopes = capabilitiesToScopes(add, this.deps.env ?? process.env);
    } catch (error) {
      if (error instanceof UnknownCapabilityError) throw federationErrors.unknownCapability(error.message);
      throw error;
    }
    const known = new Map(FEDERATION_CAPABILITIES.map(capability => [capability.id as string, capability.scope as string]));
    const unknownRemove = remove.filter(id => !known.has(id));
    if (unknownRemove.length) throw federationErrors.unknownCapability(`Unknown capabilities: ${unknownRemove.join(', ')}`);
    const removeScopes = new Set(remove.map(id => known.get(id) as string));

    const current = await this.deps.keys.scopesFor(peer.inboundPrincipalId);
    const next = Array.from(new Set([...current.filter(scope => !removeScopes.has(scope)), ...addScopes, REVOKE_SCOPE]))
      .filter(isServiceAllowedScope);
    const changed = await this.deps.keys.setScopes(peer.inboundPrincipalId, next);
    if (changed === 0) throw federationErrors.invalidState();

    const capabilities = scopesToCapabilityIds(next);
    const updated = await this.deps.peers.update(peer.id, { inboundCapabilities: capabilities });
    await this.deps.audit.record({
      direction: 'inbound', peerId: peer.id, principalId: peer.inboundPrincipalId, userId: params.adminId,
      capability: 'federation.grants.update',
      target: [add.length ? `+${add.join(',')}` : '', remove.length ? `-${remove.join(',')}` : ''].filter(Boolean).join(' ').slice(0, 100),
      outcome: 'ok',
    });
    return updated ?? { ...peer, inboundCapabilities: capabilities };
  }
}

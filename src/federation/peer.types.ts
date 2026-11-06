export type PeerStatus = 'pending_outbound' | 'pending_inbound' | 'active' | 'rejected' | 'expired' | 'revoked';

export const OPEN_PEER_STATUSES: readonly PeerStatus[] = ['pending_outbound', 'pending_inbound', 'active'];

export interface PeerRecord {
  id: string;
  unitName: string;
  displayName: string | null;
  origin: string;
  protocolVersion: string | null;
  initiatedByUs: boolean;
  status: PeerStatus;
  inboundPrincipalId: string | null;
  inboundCapabilities: string[];
  outboundCapabilities: string[];
  outboundKeyEncrypted: string | null;
  outboundKeyPrefix: string | null;
  nonceLocal: string | null;
  nonceRemote: string | null;
  pairingSecretHash: string | null;
  pairingSecretEncrypted: string | null;
  remoteRequestId: string | null;
  requestIp: string | null;
  expiresAt: Date | null;
  createdBy: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewPeer = Omit<PeerRecord, 'createdAt' | 'updatedAt' | 'decidedBy' | 'decidedAt' | 'lastSeenAt'>
  & Partial<Pick<PeerRecord, 'decidedBy' | 'decidedAt' | 'lastSeenAt'>>;

export type PeerPatch = Partial<Omit<PeerRecord, 'id' | 'createdAt' | 'updatedAt'>>;

/** Persistence port; implemented with SQL in peer.repository.ts and in memory in tests. */
export interface PeerStore {
  insert(peer: NewPeer): Promise<PeerRecord>;
  get(id: string): Promise<PeerRecord | null>;
  list(): Promise<PeerRecord[]>;
  findOpenByOrigin(origin: string): Promise<PeerRecord | null>;
  findActiveByPrincipal(principalId: string): Promise<PeerRecord | null>;
  countPendingInbound(): Promise<number>;
  /** Marks expired pending rows; returns how many changed. */
  expirePending(now: Date): Promise<number>;
  update(id: string, patch: PeerPatch): Promise<PeerRecord | null>;
}

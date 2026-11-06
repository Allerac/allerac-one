/** Default, DB-backed FederationClient. */
import { decrypt, encrypt } from '@/app/services/crypto/encryption.service';
import { federationAuditRepository } from './audit.repository';
import { FederationClient } from './federation-client';
import { PeerClient } from './peer-client';
import { peerRepository } from './peer.repository';

export const federationClient = new FederationClient({
  store: peerRepository,
  transport: new PeerClient(),
  secrets: { encrypt, decrypt },
  audit: federationAuditRepository,
});

/** Default, DB-backed wiring of PairingService for routes. */
import { decrypt, encrypt } from '@/app/services/crypto/encryption.service';
import { servicePrincipalService } from '@/app/services/service-principals/service-principal.service';
import { apiKeyService } from '@/app/services/api-keys/api-key.service';
import { PairingService } from './pairing.service';
import { PeerClient } from './peer-client';
import { peerRepository } from './peer.repository';

export const pairingService = new PairingService({
  store: peerRepository,
  client: new PeerClient(),
  secrets: { encrypt, decrypt },
  principals: {
    async create(params) {
      const principal = await servicePrincipalService.create(params);
      return { id: principal.id, actingUserId: principal.actingUserId };
    },
    async createKey(params) {
      const created = await apiKeyService.create({
        userId: params.actingUserId,
        name: params.name,
        scopes: params.scopes,
        principalId: params.principalId,
      });
      return { secret: created.secret, prefix: created.apiKey.prefix };
    },
    disable: id => servicePrincipalService.disable(id),
  },
});

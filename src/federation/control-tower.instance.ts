/** Default, DB-backed Control Tower wiring (federation P4d). */
import { ControlTowerService } from './control-tower';
import { BEAT_TIMEOUT_MS, ControlTowerHeartbeat } from './control-tower.heartbeat';
import { controlTowerRepository } from './control-tower.repository';
import { federationClient } from './federation-client.instance';
import { PeerClient } from './peer-client';
import { statusService } from './status.instance';

const transport = new PeerClient(undefined, BEAT_TIMEOUT_MS);

export const controlTowerHeartbeat = new ControlTowerHeartbeat({
  store: controlTowerRepository,
  client: federationClient,
  probeManifest: origin => transport.fetchManifest(origin),
});

export const controlTowerService = new ControlTowerService({
  store: controlTowerRepository,
  localStatus: () => statusService.build(),
});

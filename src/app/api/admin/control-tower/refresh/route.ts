import { controlTowerHeartbeat } from '@/federation/control-tower.instance';
import { requireControlTowerAdmin, towerData, towerError } from '../guard';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Refresh now": one heartbeat for one peer (or all), throttled to once per 10s per peer. */
export async function POST(request: Request): Promise<Response> {
  try {
    await requireControlTowerAdmin(request);
    const body = await request.json().catch(() => ({})) as { peerId?: unknown };
    const peerId = typeof body?.peerId === 'string' && UUID.test(body.peerId) ? body.peerId : null;
    return towerData(await controlTowerHeartbeat.refresh(peerId));
  } catch (error) {
    return towerError('POST /api/admin/control-tower/refresh failed', error);
  }
}

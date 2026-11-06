import { controlTowerService } from '@/federation/control-tower.instance';
import { requireControlTowerAdmin, towerData, towerError } from './guard';

export const dynamic = 'force-dynamic';

/** Control Tower overview (P4d): units, activity, events and alerts. Reads the DB only. */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireControlTowerAdmin(request);
    const params = new URL(request.url).searchParams;
    const window = params.get('window') === '1h' ? '1h' : '24h';
    const rawStatus = params.get('status');
    const status = rawStatus === 'running' || rawStatus === 'failed' ? rawStatus : 'all';
    const unit = params.get('unit')?.trim().toLowerCase().slice(0, 64) || null;
    return towerData(await controlTowerService.overview({ userId: user.id, window, status, unit }));
  } catch (error) {
    return towerError('GET /api/admin/control-tower failed', error);
  }
}

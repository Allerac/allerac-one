'use server';

import { assertDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';
import { StravaCredentialsService } from '@/app/services/strava/strava-credentials.service';
import { StravaSyncService } from '@/app/services/strava/strava-sync.service';

const credentials = new StravaCredentialsService();
const sync = new StravaSyncService();

async function healthUserId() {
  const user = await requireCurrentUser();
  await assertDomainAccess(user, 'health');
  return user.id;
}

export async function getStravaStatus() {
  return credentials.getStatus(await healthUserId());
}

export async function triggerStravaSync() {
  const result = await sync.syncRecent(await healthUserId(), { pages: 1, perPage: 50 });
  return { success: true, ...result };
}

export async function disconnectStrava() {
  await credentials.disconnect(await healthUserId());
  return { success: true };
}

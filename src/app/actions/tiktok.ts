'use server';

import { requireCurrentUser } from '@/app/lib/auth-session';
import { TikTokCredentialsService } from '@/app/services/tiktok/tiktok-credentials.service';

const credentials = new TikTokCredentialsService();

export async function getTikTokStatus() {
  const user = await requireCurrentUser();
  return credentials.getStatus(user.id);
}

export async function disconnectTikTok(): Promise<{ success: true } | { success: false; error: string }> {
  const user = await requireCurrentUser();
  try {
    await credentials.disconnect(user.id);
    return { success: true };
  } catch {
    console.error('[TikTok] Disconnect failed');
    return { success: false, error: 'tiktok_disconnect_failed' };
  }
}

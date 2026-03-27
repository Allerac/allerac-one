'use server';

import { InstagramCredentialsService } from '@/app/services/instagram/instagram-credentials.service';

const credService = new InstagramCredentialsService();

export async function getInstagramStatus(userId: string) {
  return credService.getStatus(userId);
}

export async function disconnectInstagram(userId: string) {
  await credService.disconnect(userId);
}

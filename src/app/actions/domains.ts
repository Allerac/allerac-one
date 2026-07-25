'use server';

import { assertDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';
import {
  domainModelSettingsService,
  type DomainModelSettings,
} from '@/app/services/domains/domain-model-settings.service';
import { domainService } from '@/app/services/domains/domain.service';

export async function getUserAccessibleDomains(): Promise<string[]> {
  try {
    const user = await requireCurrentUser();
    const domains = await domainService.listAccessible({ userId: user.id, isAdmin: user.is_admin });
    return domains.map((d) => d.slug);
  } catch {
    return [];
  }
}

export async function getDomainModelSettings(domainSlug: string) {
  const user = await requireCurrentUser();
  await assertDomainAccess(user, domainSlug);
  return domainModelSettingsService.get(user.id, domainSlug);
}

export async function saveDomainModelSettings(settings: DomainModelSettings) {
  const user = await requireCurrentUser();
  await assertDomainAccess(user, settings.domainSlug);
  await domainModelSettingsService.set(user.id, settings);
  return { success: true };
}

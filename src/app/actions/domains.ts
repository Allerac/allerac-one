'use server';

import { assertDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';
import {
  domainModelSettingsService,
  type DomainModelSettings,
} from '@/app/services/domains/domain-model-settings.service';
import { domainService } from '@/app/services/domains/domain.service';
import {
  domainRateLimitSettingsService,
  type SaveDomainRateLimitInput,
} from '@/app/services/domains/domain-rate-limit-settings.service';
import { sendTelegramAlert } from '@/app/services/telegram/telegram-alert.service';

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

export async function getDomainRateLimitSettings(domainSlug: string) {
  const user = await requireCurrentUser();
  await assertDomainAccess(user, domainSlug);
  return domainRateLimitSettingsService.getView(domainSlug);
}

export async function saveDomainRateLimitSettings(settings: SaveDomainRateLimitInput) {
  const user = await requireCurrentUser();
  await assertDomainAccess(user, settings.domainSlug);
  await domainRateLimitSettingsService.save(settings);
  return { success: true };
}

export async function clearDomainRateLimitTelegramConfig(domainSlug: string) {
  const user = await requireCurrentUser();
  await assertDomainAccess(user, domainSlug);
  await domainRateLimitSettingsService.clearTelegramConfig(domainSlug);
  return { success: true };
}

export async function getDomainRateLimitUsage(domainSlug: string) {
  const user = await requireCurrentUser();
  await assertDomainAccess(user, domainSlug);
  return domainRateLimitSettingsService.getUsage(domainSlug, user.id);
}

/**
 * Tests whatever is currently typed in the form (`override`), falling back to
 * the already-saved settings for any field left blank — so clicking "test"
 * works whether or not the user has clicked "save" yet.
 */
export async function sendTestRateLimitAlert(
  domainSlug: string,
  override?: { telegramBotToken?: string; telegramChatId?: string },
) {
  const user = await requireCurrentUser();
  await assertDomainAccess(user, domainSlug);
  const saved = await domainRateLimitSettingsService.get(domainSlug);
  const telegramBotToken = override?.telegramBotToken || saved.telegramBotToken;
  const telegramChatId = override?.telegramChatId || saved.telegramChatId;
  if (!telegramBotToken || !telegramChatId) {
    throw new Error('Configure o bot token e o chat id antes de enviar um teste.');
  }
  await sendTelegramAlert(
    telegramBotToken,
    telegramChatId,
    `✅ Teste de alerta para o domínio *${domainSlug}* — configuração funcionando.`,
  );
  return { success: true };
}

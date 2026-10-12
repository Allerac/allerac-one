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
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { PUBLIC_DOMAINS } from '@/app/services/chat/chat-tool-registry';

const userSettingsService = new UserSettingsService();

/**
 * For a PUBLIC_DOMAINS entry (a dedicated single-bot-account domain like sales/
 * openworld), always resolve to that account's own id — regardless of who's
 * actually viewing the page. Without this, an admin viewing /openworld (they
 * bypass assertDomainAccess) reads/writes settings under their OWN account, a
 * different row than the one the live bot account actually uses at request
 * time — the exact "picker shows nothing selected even though it's working in
 * production" bug hit repeatedly working on this domain.
 *
 * For any other domain (multi-user, no single dedicated owner), keep using the
 * viewer's own id — that's correct there, each user's own preference applies
 * to only themselves.
 */
async function resolveEffectiveUserId(domainSlug: string, viewerId: string): Promise<string> {
  if (!PUBLIC_DOMAINS.includes(domainSlug)) return viewerId;
  const owner = await domainService.findDomainOwner(domainSlug);
  return owner?.id ?? viewerId;
}

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
  const effectiveUserId = await resolveEffectiveUserId(domainSlug, user.id);
  return domainModelSettingsService.get(effectiveUserId, domainSlug);
}

export async function saveDomainModelSettings(settings: DomainModelSettings) {
  const user = await requireCurrentUser();
  await assertDomainAccess(user, settings.domainSlug);
  const effectiveUserId = await resolveEffectiveUserId(settings.domainSlug, user.id);
  await domainModelSettingsService.set(effectiveUserId, settings);
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
  const effectiveUserId = await resolveEffectiveUserId(domainSlug, user.id);
  return domainRateLimitSettingsService.getUsage(domainSlug, effectiveUserId);
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

/**
 * Tavily key lives on the domain's bot account's own user_settings (same
 * resolution chain llm/chat-runtime-context.ts uses at request time: account
 * key → system-wide key → env var).
 */
export async function getDomainTavilyKeyStatus(domainSlug: string) {
  const user = await requireCurrentUser();
  await assertDomainAccess(user, domainSlug);
  const effectiveUserId = await resolveEffectiveUserId(domainSlug, user.id);
  const settings = await userSettingsService.loadUserSettings(effectiveUserId);
  return { configured: Boolean(settings?.tavily_api_key) };
}

export async function saveDomainTavilyKey(domainSlug: string, apiKey: string) {
  const user = await requireCurrentUser();
  await assertDomainAccess(user, domainSlug);
  if (!apiKey.trim()) throw new Error('API key is empty');
  const effectiveUserId = await resolveEffectiveUserId(domainSlug, user.id);
  await userSettingsService.saveUserSettings(effectiveUserId, undefined, apiKey.trim());
  return { success: true };
}

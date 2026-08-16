'use server';

import { cookies } from 'next/headers';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { assertDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';
import pool from '@/app/clients/db';
import { domainInstructionsService } from '@/app/services/instructions/domain-instructions.service';

const userSettingsService = new UserSettingsService();
const systemSettingsService = new SystemSettingsService();

export async function loadUserSettings() {
    const user = await requireCurrentUser();
    return await userSettingsService.loadUserSettings(user.id);
}

export async function loadProviderConfigurationStatus() {
    const user = await requireCurrentUser();
    const [settings, systemSettings] = await Promise.all([
        userSettingsService.loadUserSettings(user.id),
        systemSettingsService.loadAll(),
    ]);

    return {
        githubConfigured: Boolean(settings?.github_token || systemSettings.github_token || process.env.GITHUB_TOKEN),
        googleConfigured: Boolean(settings?.google_api_key || systemSettings.google_api_key),
        anthropicConfigured: Boolean(settings?.anthropic_api_key || systemSettings.anthropic_api_key),
        tavilyConfigured: Boolean(settings?.tavily_api_key || systemSettings.tavily_api_key || process.env.TAVILY_API_KEY),
    };
}

export async function saveUserSettings(githubToken?: string, tavilyApiKey?: string, telegramBotToken?: string, googleApiKey?: string, anthropicApiKey?: string, location?: string, timezone?: string) {
    const user = await requireCurrentUser();
    return await userSettingsService.saveUserSettings(user.id, githubToken, tavilyApiKey, telegramBotToken, googleApiKey, anthropicApiKey, location, timezone);
}

export async function setGoogleKeyPreference(preference: 'personal' | 'allerac') {
    const user = await requireCurrentUser();
    return userSettingsService.setGoogleKeyPreference(user.id, preference);
}

export async function clearGoogleApiKey() {
    const user = await requireCurrentUser();
    return userSettingsService.clearGoogleApiKey(user.id);
}

export async function saveSelectedModel(modelId: string) {
    const user = await requireCurrentUser();
    return await userSettingsService.saveSelectedModel(user.id, modelId);
}

export async function completeOnboarding() {
    const user = await requireCurrentUser();
    return await userSettingsService.completeOnboarding(user.id);
}

export async function completeHubTour() {
    const user = await requireCurrentUser();
    return await userSettingsService.completeHubTour(user.id);
}

export async function getLanguage(): Promise<string> {
    const cookieStore = await cookies();
    return cookieStore.get('locale')?.value || 'en';
}

export async function updateLanguage(locale: string): Promise<{ success: boolean }> {
    const cookieStore = await cookies();
    cookieStore.set('locale', locale, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax'
    });

    // Sync to DB so Telegram bot and other server-side consumers stay in sync
    try {
        const { getCurrentUser } = await import('@/app/actions/auth');
        const user = await getCurrentUser();
        if (user?.id) {
            await pool.query(
                `UPDATE user_settings SET language = $1 WHERE user_id = $2`,
                [locale, user.id]
            );
        }
    } catch {
        // Non-critical: cookie already set, DB sync is best-effort
    }

    return { success: true };
}

export async function getDomainInstructions(domainSlug: string): Promise<string> {
    const user = await requireCurrentUser();
    await assertDomainAccess(user, domainSlug);
    const res = await pool.query(
        `SELECT content FROM user_domain_instructions WHERE user_id = $1 AND domain_slug = $2`,
        [user.id, domainSlug]
    );
    return res.rows[0]?.content ?? '';
}

export async function getDomainInstructionDetails(domainSlug: string) {
    const user = await requireCurrentUser();
    await assertDomainAccess(user, domainSlug);
    return domainInstructionsService.list(user.id, domainSlug);
}

export async function revokeDomainInstruction(
    domainSlug: string,
    instructionId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const user = await requireCurrentUser();
        await assertDomainAccess(user, domainSlug);
        const revoked = await domainInstructionsService.revoke(user.id, domainSlug, instructionId);
        return revoked ? { success: true } : { success: false, error: 'Instruction not found' };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to revoke instruction' };
    }
}

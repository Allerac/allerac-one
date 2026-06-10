'use server';

import { cookies } from 'next/headers';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { assertDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';
import pool from '@/app/clients/db';

const userSettingsService = new UserSettingsService();

export async function loadUserSettings() {
    const user = await requireCurrentUser();
    return await userSettingsService.loadUserSettings(user.id);
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

export async function saveDomainInstructions(
    domainSlug: string,
    content: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const user = await requireCurrentUser();
        await assertDomainAccess(user, domainSlug);
        await pool.query(
            `INSERT INTO user_domain_instructions (user_id, domain_slug, content)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, domain_slug) DO UPDATE SET content = $3, updated_at = NOW()`,
            [user.id, domainSlug, content]
        );
        return { success: true };
    } catch (error: unknown) {
        console.error('[user] saveDomainInstructions error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to save instructions' };
    }
}

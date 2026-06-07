'use server';

import { cookies } from 'next/headers';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import pool from '@/app/clients/db';

const userSettingsService = new UserSettingsService();

export async function loadUserSettings(userId: string) {
    return await userSettingsService.loadUserSettings(userId);
}

export async function saveUserSettings(userId: string, githubToken?: string, tavilyApiKey?: string, telegramBotToken?: string, googleApiKey?: string, anthropicApiKey?: string, location?: string, timezone?: string) {
    return await userSettingsService.saveUserSettings(userId, githubToken, tavilyApiKey, telegramBotToken, googleApiKey, anthropicApiKey, location, timezone);
}

export async function saveSelectedModel(userId: string, modelId: string) {
    return await userSettingsService.saveSelectedModel(userId, modelId);
}

export async function completeOnboarding(userId: string) {
    return await userSettingsService.completeOnboarding(userId);
}

export async function completeHubTour(userId: string) {
    return await userSettingsService.completeHubTour(userId);
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

export async function getDomainInstructions(userId: string, domainSlug: string): Promise<string> {
    const res = await pool.query(
        `SELECT content FROM user_domain_instructions WHERE user_id = $1 AND domain_slug = $2`,
        [userId, domainSlug]
    );
    return res.rows[0]?.content ?? '';
}

export async function saveDomainInstructions(
    userId: string,
    domainSlug: string,
    content: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await pool.query(
            `INSERT INTO user_domain_instructions (user_id, domain_slug, content)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, domain_slug) DO UPDATE SET content = $3, updated_at = NOW()`,
            [userId, domainSlug, content]
        );
        return { success: true };
    } catch (error: any) {
        console.error('[user] saveDomainInstructions error:', error);
        return { success: false, error: error.message };
    }
}

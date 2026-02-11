'use server';

import { cookies } from 'next/headers';
import { UserSettingsService } from '@/app/services/user/user-settings.service';

const userSettingsService = new UserSettingsService();

export async function loadUserSettings(userId: string) {
    return await userSettingsService.loadUserSettings(userId);
}

export async function saveUserSettings(userId: string, githubToken?: string, tavilyApiKey?: string) {
    return await userSettingsService.saveUserSettings(userId, githubToken, tavilyApiKey);
}

export async function getLanguage(): Promise<string> {
    const cookieStore = await cookies();
    return cookieStore.get('locale')?.value || 'en';
}

export async function updateLanguage(locale: string): Promise<{ success: boolean }> {
    const cookieStore = await cookies();
    cookieStore.set('locale', locale, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365, // 1 year
        sameSite: 'lax'
    });
    return { success: true };
}

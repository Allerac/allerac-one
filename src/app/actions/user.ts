'use server';

import { cookies } from 'next/headers';
import { UserSettingsService } from '@/app/services/user/user-settings.service';

const userSettingsService = new UserSettingsService();

export async function loadUserSettings(userId: string) {
    return await userSettingsService.loadUserSettings(userId);
}

export async function saveUserSettings(userId: string, githubToken?: string, tavilyApiKey?: string, telegramBotToken?: string, googleApiKey?: string, location?: string) {
    return await userSettingsService.saveUserSettings(userId, githubToken, tavilyApiKey, telegramBotToken, googleApiKey, location);
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
        maxAge: 60 * 60 * 24 * 365, // 1 year
        sameSite: 'lax'
    });
    return { success: true };
}

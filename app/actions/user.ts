'use server';

import { UserSettingsService } from '@/app/services/user/user-settings.service';

const userSettingsService = new UserSettingsService();

export async function loadUserSettings(userId: string) {
    return await userSettingsService.loadUserSettings(userId);
}

export async function saveUserSettings(userId: string, githubToken?: string, tavilyApiKey?: string) {
    return await userSettingsService.saveUserSettings(userId, githubToken, tavilyApiKey);
}

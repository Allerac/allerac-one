'use server';

import { MetricsService, ApiLogEntry, TokenUsageEntry } from '@/app/services/infrastructure/metrics.service';
import { requireCurrentAdmin, requireCurrentUser } from '@/app/lib/auth-session';

const metricsService = new MetricsService();

export async function logApiCall(entry: ApiLogEntry) {
    try {
        const user = await requireCurrentUser();
        await metricsService.logApiCall({ ...entry, user_id: user.id });
    } catch (err) {
        console.error('Action logApiCall failed', err);
    }
}

export async function logTokenUsage(entry: TokenUsageEntry) {
    try {
        const user = await requireCurrentUser();
        await metricsService.logTokenUsage({ ...entry, user_id: user.id });
    } catch (err) {
        console.error('Action logTokenUsage failed', err);
    }
}

export async function getTavilyStats(hours: number = 24, useCurrentMonth: boolean = false) {
    await requireCurrentAdmin();
    return await metricsService.getTavilyStats(normalizeHours(hours), Boolean(useCurrentMonth));
}

export async function getTokenStats(hours: number = 24, useCurrentMonth: boolean = false) {
    await requireCurrentAdmin();
    return await metricsService.getTokenStats(normalizeHours(hours), Boolean(useCurrentMonth));
}

export async function getTokenStatsByModel(hours: number = 24, useCurrentMonth: boolean = false) {
    await requireCurrentAdmin();
    return await metricsService.getTokenStatsByModel(normalizeHours(hours), Boolean(useCurrentMonth));
}

export async function getTokenStatsByUser(hours: number = 24, useCurrentMonth: boolean = false) {
    await requireCurrentAdmin();
    return await metricsService.getTokenStatsByUser(normalizeHours(hours), Boolean(useCurrentMonth));
}

export async function getModelPricing() {
    await requireCurrentAdmin();
    return await metricsService.getModelPricing();
}

export async function saveModelPricing(modelId: string, inputPer1m: number, outputPer1m: number) {
    try {
        await requireCurrentAdmin();
        if (
            typeof modelId !== 'string'
            || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(modelId)
            || !Number.isFinite(inputPer1m)
            || !Number.isFinite(outputPer1m)
            || inputPer1m < 0
            || outputPer1m < 0
            || inputPer1m > 1_000_000
            || outputPer1m > 1_000_000
        ) {
            return { success: false };
        }
        await metricsService.saveModelPricing(modelId, inputPer1m, outputPer1m);
        return { success: true };
    } catch (err) {
        console.error('Action saveModelPricing failed', err);
        return { success: false };
    }
}

function normalizeHours(hours: number): number {
    return Number.isFinite(hours) ? Math.min(Math.max(Math.trunc(hours), 1), 24 * 366) : 24;
}

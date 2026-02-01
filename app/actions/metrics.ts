'use server';

import { MetricsService, ApiLogEntry, TokenUsageEntry } from '@/app/services/infrastructure/metrics.service';

const metricsService = new MetricsService();

export async function logApiCall(entry: ApiLogEntry) {
    try {
        await metricsService.logApiCall(entry);
    } catch (err) {
        console.error('Action logApiCall failed', err);
    }
}

export async function logTokenUsage(entry: TokenUsageEntry) {
    try {
        await metricsService.logTokenUsage(entry);
    } catch (err) {
        console.error('Action logTokenUsage failed', err);
    }
}

export async function getTavilyStats(hours: number = 24, useCurrentMonth: boolean = false) {
    return await metricsService.getTavilyStats(hours, useCurrentMonth);
}

export async function getTokenStats(hours: number = 24, useCurrentMonth: boolean = false) {
    return await metricsService.getTokenStats(hours, useCurrentMonth);
}

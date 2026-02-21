'use server';

import { scheduledJobsService } from '../services/scheduled-jobs/scheduled-jobs.service';
import type { ScheduledJob, JobExecution } from '../types';

const CRON_REGEX =
  /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/;

function validateCron(expr: string): string | null {
  if (!CRON_REGEX.test(expr.trim())) {
    return 'Invalid cron expression';
  }
  return null;
}

export async function getScheduledJobs(
  userId: string
): Promise<{ success: boolean; data?: ScheduledJob[]; error?: string }> {
  try {
    const data = await scheduledJobsService.getScheduledJobs(userId);
    return { success: true, data };
  } catch (error) {
    console.error('[Actions] Error getting scheduled jobs:', error);
    return { success: false, error: 'Failed to load scheduled jobs' };
  }
}

export async function createScheduledJob(
  userId: string,
  data: { name: string; cronExpr: string; prompt: string; channels: string[]; enabled: boolean }
): Promise<{ success: boolean; data?: ScheduledJob; error?: string }> {
  if (!data.name?.trim()) {
    return { success: false, error: 'Name is required' };
  }
  if (!data.prompt?.trim()) {
    return { success: false, error: 'Prompt is required' };
  }
  if (!data.channels || data.channels.length === 0) {
    return { success: false, error: 'At least one channel is required' };
  }
  const cronError = validateCron(data.cronExpr);
  if (cronError) {
    return { success: false, error: cronError };
  }

  try {
    const job = await scheduledJobsService.createScheduledJob(userId, {
      ...data,
      cronExpr: data.cronExpr.trim(),
    });
    return { success: true, data: job };
  } catch (error) {
    console.error('[Actions] Error creating scheduled job:', error);
    return { success: false, error: 'Failed to create scheduled job' };
  }
}

export async function updateScheduledJob(
  jobId: string,
  userId: string,
  data: { name?: string; cronExpr?: string; prompt?: string; channels?: string[]; enabled?: boolean }
): Promise<{ success: boolean; data?: ScheduledJob; error?: string }> {
  if (data.cronExpr !== undefined) {
    const cronError = validateCron(data.cronExpr);
    if (cronError) {
      return { success: false, error: cronError };
    }
  }

  try {
    const job = await scheduledJobsService.updateScheduledJob(jobId, userId, data);
    if (!job) {
      return { success: false, error: 'Job not found' };
    }
    return { success: true, data: job };
  } catch (error) {
    console.error('[Actions] Error updating scheduled job:', error);
    return { success: false, error: 'Failed to update scheduled job' };
  }
}

export async function deleteScheduledJob(
  jobId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const deleted = await scheduledJobsService.deleteScheduledJob(jobId, userId);
    if (!deleted) {
      return { success: false, error: 'Job not found' };
    }
    return { success: true };
  } catch (error) {
    console.error('[Actions] Error deleting scheduled job:', error);
    return { success: false, error: 'Failed to delete scheduled job' };
  }
}

export async function toggleJobEnabled(
  jobId: string,
  userId: string
): Promise<{ success: boolean; data?: ScheduledJob; error?: string }> {
  try {
    const job = await scheduledJobsService.toggleJobEnabled(jobId, userId);
    if (!job) {
      return { success: false, error: 'Job not found' };
    }
    return { success: true, data: job };
  } catch (error) {
    console.error('[Actions] Error toggling job:', error);
    return { success: false, error: 'Failed to toggle job' };
  }
}

export async function getJobExecutions(
  jobId: string
): Promise<{ success: boolean; data?: JobExecution[]; error?: string }> {
  try {
    const data = await scheduledJobsService.getJobExecutions(jobId);
    return { success: true, data };
  } catch (error) {
    console.error('[Actions] Error getting job executions:', error);
    return { success: false, error: 'Failed to load executions' };
  }
}

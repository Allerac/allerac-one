import { defineModule } from '../types';

// Code still lives in src/app/{health,api/health,api/strava,services/health},
// src/app/tools/health.tool.ts and services/health-worker.
export default defineModule({
  id: 'health',
  group: 'personal',
  description: 'Health & wellness: Garmin and Strava sync, activities, metrics.',
  domains: ['health'],
  nav: [{ key: 'health', name: 'Health', icon: '❤️', path: '/health' }],
  tools: [
    'get_health_summary',
    'get_health_metrics',
    'get_daily_snapshot',
    'get_garmin_status',
    'get_recent_activities',
    'get_activity_detail',
  ],
  skills: ['health.md'],
  dockerProfile: 'health',
  requiredEnv: ['HEALTH_WORKER_SECRET', 'HEALTH_WORKER_URL'],
});

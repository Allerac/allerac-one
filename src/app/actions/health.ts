'use server';

import { createHmac } from 'crypto';
import pool from '@/app/clients/db';

const HEALTH_API_URL = (process.env.HEALTH_API_URL || 'http://allerac-health-backend:8000').replace(/\/$/, '');
const HEALTH_API_SECRET_KEY = process.env.HEALTH_API_SECRET_KEY || '';

export const isHealthConfigured = Boolean(HEALTH_API_SECRET_KEY);

interface HealthUser {
  id: string;
  email: string;
  name: string;
}

async function getHealthUser(userId: string): Promise<HealthUser> {
  const result = await pool.query('SELECT id, email, name FROM users WHERE id = $1', [userId]);
  const user = result.rows[0];
  if (!user) throw new Error('User not found');
  return { id: user.id, email: user.email, name: user.name || user.email };
}

function createHealthToken(user: HealthUser): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: 'allerac-one',
    sub: user.id,
    email: user.email,
    name: user.name,
    iat: now,
    exp: now + 600,
  })).toString('base64url');
  const signature = createHmac('sha256', HEALTH_API_SECRET_KEY)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function healthFetch(user: HealthUser, method: string, path: string, body?: object) {
  const token = createHealthToken(user);
  const res = await fetch(`${HEALTH_API_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Health API ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Garmin actions ───────────────────────────────────────────────────────────

export async function getGarminStatus(userId: string) {
  if (!isHealthConfigured) return { is_connected: false, not_configured: true };
  try {
    const user = await getHealthUser(userId);
    return await healthFetch(user, 'GET', '/api/v1/garmin/status');
  } catch (e: any) {
    return { is_connected: false, error: e.message };
  }
}

export async function connectGarmin(userId: string, email: string, password: string) {
  const user = await getHealthUser(userId);
  return healthFetch(user, 'POST', '/api/v1/garmin/connect', { email, password });
}

export async function submitGarminMfa(userId: string, mfaCode: string) {
  const user = await getHealthUser(userId);
  return healthFetch(user, 'POST', '/api/v1/garmin/mfa', { mfa_code: mfaCode });
}

export async function disconnectGarmin(userId: string) {
  const user = await getHealthUser(userId);
  return healthFetch(user, 'DELETE', '/api/v1/garmin/disconnect');
}

export async function triggerHealthSync(userId: string) {
  const user = await getHealthUser(userId);
  return healthFetch(user, 'POST', '/api/v1/garmin/sync');
}

'use server';

import crypto from 'crypto';
import pool from '@/app/clients/db';
import { AuthService } from '@/app/services/auth/auth.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import type { SystemSettings } from '@/app/services/system/system-settings.service';
import { requireCurrentAdmin } from '@/app/lib/auth-session';

const authService = new AuthService();
const systemSettingsService = new SystemSettingsService();

async function assertAdmin() {
  return requireCurrentAdmin();
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DOMAIN_ASSIGNMENTS = 100;

function isUuid(value: string): boolean {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function validIds(ids: string[]): boolean {
  return (
    Array.isArray(ids)
    && ids.length <= MAX_DOMAIN_ASSIGNMENTS
    && ids.every(isUuid)
    && new Set(ids).size === ids.length
  );
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
  domains: string[];
}

export interface AdminDomain {
  id: string;
  slug: string;
  display_name: string;
  is_active: boolean;
  sort_order: number;
}

export async function listUsers(): Promise<AdminUser[]> {
  await assertAdmin();
  const result = await pool.query(`
    SELECT u.id, u.email, u.name, u.is_admin, u.is_active, u.created_at,
           COALESCE(array_agg(d.slug ORDER BY d.slug) FILTER (WHERE d.slug IS NOT NULL), '{}') AS domains
    FROM users u
    LEFT JOIN user_domain_access uda ON u.id = uda.user_id
    LEFT JOIN domains d ON uda.domain_id = d.id
    GROUP BY u.id
    ORDER BY u.created_at ASC
  `);
  return result.rows;
}

export async function listActiveDomains(): Promise<AdminDomain[]> {
  await assertAdmin();
  const result = await pool.query(
    `SELECT id, slug, display_name, is_active, sort_order FROM domains WHERE is_active = true ORDER BY sort_order ASC`
  );
  return result.rows;
}

export async function listAllDomains(): Promise<AdminDomain[]> {
  await assertAdmin();
  const result = await pool.query(
    `SELECT id, slug, display_name, is_active, sort_order FROM domains ORDER BY sort_order ASC`
  );
  return result.rows;
}

export async function reorderDomains(orderedIds: string[]): Promise<void> {
  await assertAdmin();
  if (!validIds(orderedIds)) throw new Error('Invalid domain IDs');
  await Promise.all(
    orderedIds.map((id, i) =>
      pool.query(`UPDATE domains SET sort_order = $1 WHERE id = $2`, [i + 1, id])
    )
  );
}

export async function toggleDomainActive(
  domainId: string,
  isActive: boolean
): Promise<{ success: true } | { success: false; error: string }> {
  await assertAdmin();
  if (!isUuid(domainId)) return { success: false, error: 'Invalid domain ID' };
  await pool.query('UPDATE domains SET is_active = $1 WHERE id = $2', [isActive, domainId]);
  return { success: true };
}

export async function createDomainUser(
  email: string,
  password: string,
  domainIds: string[],
  isAdmin: boolean = false
): Promise<{ success: true } | { success: false; error: string }> {
  await assertAdmin();

  if (!email || email.length > 254 || !email.includes('@')) return { success: false, error: 'Invalid email' };
  if (!password || password.length < 8) return { success: false, error: 'Password must be at least 8 characters' };
  if (!validIds(domainIds)) return { success: false, error: 'Invalid domain selection' };
  if (!isAdmin && !domainIds.length) return { success: false, error: 'Select at least one domain' };

  // Match client-side login flow: bcrypt(sha256(plaintext))
  const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
  const bcryptHash = await authService.hashPassword(sha256Hash);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Email already registered' };
    }

    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, password_hash_version, is_admin)
       VALUES ($1, $2, 2, $3)
       RETURNING id`,
      [email.toLowerCase(), bcryptHash, isAdmin]
    );
    const userId = userResult.rows[0].id;

    for (const domainId of domainIds) {
      await client.query(
        `INSERT INTO user_domain_access (user_id, domain_id) VALUES ($1, $2)`,
        [userId, domainId]
      );
    }

    await client.query('COMMIT');
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[admin] createDomainUser error:', error);
    return { success: false, error: 'Failed to create user' };
  } finally {
    client.release();
  }
}

export async function deleteUser(
  userId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const currentUser = await assertAdmin();
  if (!isUuid(userId)) return { success: false, error: 'Invalid user ID' };
  if (currentUser.id === userId) return { success: false, error: 'Cannot delete your own account' };

  await pool.query('DELETE FROM users WHERE id = $1 AND is_admin = false', [userId]);
  return { success: true };
}

export async function updateUserDomains(
  userId: string,
  domainIds: string[]
): Promise<{ success: true } | { success: false; error: string }> {
  await assertAdmin();
  if (!isUuid(userId) || !validIds(domainIds)) {
    return { success: false, error: 'Invalid user or domain IDs' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM user_domain_access WHERE user_id = $1', [userId]);
    for (const domainId of domainIds) {
      await client.query(
        `INSERT INTO user_domain_access (user_id, domain_id) VALUES ($1, $2)`,
        [userId, domainId]
      );
    }
    await client.query('COMMIT');
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[admin] updateUserDomains error:', error);
    return { success: false, error: 'Failed to update domains' };
  } finally {
    client.release();
  }
}

export async function toggleUserActive(
  userId: string,
  isActive: boolean
): Promise<{ success: true } | { success: false; error: string }> {
  const currentUser = await assertAdmin();
  if (!isUuid(userId)) return { success: false, error: 'Invalid user ID' };
  if (currentUser.id === userId) return { success: false, error: 'Cannot disable your own account' };

  await pool.query('UPDATE users SET is_active = $1 WHERE id = $2', [isActive, userId]);
  return { success: true };
}

export async function updateUserRole(
  userId: string,
  makeAdmin: boolean
): Promise<{ success: true } | { success: false; error: string }> {
  const currentUser = await assertAdmin();
  if (!isUuid(userId)) return { success: false, error: 'Invalid user ID' };
  if (currentUser.id === userId) return { success: false, error: 'Cannot change your own role' };

  await pool.query('UPDATE users SET is_admin = $1 WHERE id = $2', [makeAdmin, userId]);
  return { success: true };
}

export async function resetUserPassword(
  userId: string,
  newPassword: string
): Promise<{ success: true } | { success: false; error: string }> {
  await assertAdmin();

  if (!isUuid(userId)) return { success: false, error: 'Invalid user ID' };
  if (!newPassword || newPassword.length < 8) return { success: false, error: 'Password must be at least 8 characters' };

  const sha256Hash = crypto.createHash('sha256').update(newPassword).digest('hex');
  const bcryptHash = await authService.hashPassword(sha256Hash);

  const result = await pool.query(
    `UPDATE users SET password_hash = $1, password_hash_version = 2
     WHERE id = $2 AND is_admin = false`,
    [bcryptHash, userId]
  );

  if (result.rowCount === 0) return { success: false, error: 'User not found or is an admin' };
  return { success: true };
}

// ─── System Settings ──────────────────────────────────────────────────────────

export async function getSystemSettings(): Promise<SystemSettings> {
  await assertAdmin();
  return systemSettingsService.loadAll();
}

export async function saveSystemSettings(
  settings: Partial<SystemSettings>
): Promise<{ success: true } | { success: false; error: string }> {
  await assertAdmin();
  try {
    await systemSettingsService.saveAll(settings);
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to save settings' };
  }
}

// ─── Instagram Accounts ───────────────────────────────────────────────────────

export interface InstagramAccountEntry {
  id: string;
  label: string;
  owner_user_id: string;
  owner_email: string;
  username: string | null;
  is_connected: boolean;
  assigned_users: Array<{ id: string; email: string }>;
}

export async function listInstagramAccounts(): Promise<InstagramAccountEntry[]> {
  await assertAdmin();
  const result = await pool.query(`
    SELECT
      ia.id,
      ia.label,
      ia.owner_user_id,
      u.email AS owner_email,
      ic.username,
      ic.is_connected,
      COALESCE(
        json_agg(json_build_object('id', au.id, 'email', au.email))
        FILTER (WHERE au.id IS NOT NULL), '[]'
      ) AS assigned_users
    FROM instagram_accounts ia
    JOIN users u ON ia.owner_user_id = u.id
    LEFT JOIN instagram_credentials ic ON ic.user_id = ia.owner_user_id
    LEFT JOIN user_instagram_account uia ON uia.instagram_account_id = ia.id
    LEFT JOIN users au ON uia.user_id = au.id
    GROUP BY ia.id, ia.label, ia.owner_user_id, u.email, ic.username, ic.is_connected
    ORDER BY ia.created_at ASC
  `);
  return result.rows;
}

export async function registerInstagramAccount(
  ownerUserId: string,
  label: string
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  await assertAdmin();
  if (!isUuid(ownerUserId)) return { success: false, error: 'Invalid owner ID' };
  if (!label.trim() || label.trim().length > 100) return { success: false, error: 'Invalid label' };

  // Verify the owner has connected Instagram
  const cred = await pool.query(
    `SELECT is_connected FROM instagram_credentials WHERE user_id = $1 AND is_connected = true`,
    [ownerUserId]
  );
  if (!cred.rows.length) return { success: false, error: 'This user has no active Instagram connection' };

  const result = await pool.query(
    `INSERT INTO instagram_accounts (label, owner_user_id) VALUES ($1, $2) RETURNING id`,
    [label.trim(), ownerUserId]
  );
  return { success: true, id: result.rows[0].id };
}

export async function deleteInstagramAccount(
  accountId: string
): Promise<{ success: true } | { success: false; error: string }> {
  await assertAdmin();
  if (!isUuid(accountId)) return { success: false, error: 'Invalid account ID' };
  await pool.query('DELETE FROM instagram_accounts WHERE id = $1', [accountId]);
  return { success: true };
}

export async function assignInstagramAccount(
  userId: string,
  accountId: string
): Promise<{ success: true } | { success: false; error: string }> {
  await assertAdmin();
  if (!isUuid(userId) || !isUuid(accountId)) {
    return { success: false, error: 'Invalid user or account ID' };
  }
  await pool.query(
    `INSERT INTO user_instagram_account (user_id, instagram_account_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET instagram_account_id = EXCLUDED.instagram_account_id, created_at = NOW()`,
    [userId, accountId]
  );
  return { success: true };
}

export async function unassignInstagramAccount(
  userId: string
): Promise<{ success: true } | { success: false; error: string }> {
  await assertAdmin();
  if (!isUuid(userId)) return { success: false, error: 'Invalid user ID' };
  await pool.query('DELETE FROM user_instagram_account WHERE user_id = $1', [userId]);
  return { success: true };
}

// Returns admin users who have an active Instagram connection (candidates for registering an account)
export async function listInstagramConnectedAdmins(): Promise<Array<{ id: string; email: string; username: string }>> {
  await assertAdmin();
  const result = await pool.query(`
    SELECT u.id, u.email, ic.username
    FROM users u
    JOIN instagram_credentials ic ON ic.user_id = u.id
    WHERE u.is_admin = true AND ic.is_connected = true
    ORDER BY u.email ASC
  `);
  return result.rows;
}

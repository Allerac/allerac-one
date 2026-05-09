'use server';

import crypto from 'crypto';
import pool from '@/app/clients/db';
import { AuthService } from '@/app/services/auth/auth.service';
import { getCurrentUser } from './auth';

const authService = new AuthService();

async function assertAdmin() {
  const user = await getCurrentUser();
  if (!user || !user.is_admin) throw new Error('Unauthorized');
  return user;
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
    `SELECT id, slug, display_name, is_active FROM domains WHERE is_active = true ORDER BY created_at ASC`
  );
  return result.rows;
}

export async function listAllDomains(): Promise<AdminDomain[]> {
  await assertAdmin();
  const result = await pool.query(
    `SELECT id, slug, display_name, is_active FROM domains ORDER BY created_at ASC`
  );
  return result.rows;
}

export async function toggleDomainActive(
  domainId: string,
  isActive: boolean
): Promise<{ success: true } | { success: false; error: string }> {
  await assertAdmin();
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

  if (!email || !email.includes('@')) return { success: false, error: 'Invalid email' };
  if (!password || password.length < 8) return { success: false, error: 'Password must be at least 8 characters' };
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
  if (currentUser.id === userId) return { success: false, error: 'Cannot delete your own account' };

  await pool.query('DELETE FROM users WHERE id = $1 AND is_admin = false', [userId]);
  return { success: true };
}

export async function updateUserDomains(
  userId: string,
  domainIds: string[]
): Promise<{ success: true } | { success: false; error: string }> {
  await assertAdmin();

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
  if (currentUser.id === userId) return { success: false, error: 'Cannot disable your own account' };

  await pool.query('UPDATE users SET is_active = $1 WHERE id = $2', [isActive, userId]);
  return { success: true };
}

export async function updateUserRole(
  userId: string,
  makeAdmin: boolean
): Promise<{ success: true } | { success: false; error: string }> {
  const currentUser = await assertAdmin();
  if (currentUser.id === userId) return { success: false, error: 'Cannot change your own role' };

  await pool.query('UPDATE users SET is_admin = $1 WHERE id = $2', [makeAdmin, userId]);
  return { success: true };
}

export async function resetUserPassword(
  userId: string,
  newPassword: string
): Promise<{ success: true } | { success: false; error: string }> {
  await assertAdmin();

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

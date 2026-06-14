'use server';

import { cookies } from 'next/headers';
import { AuthService, User } from '@/app/services/auth/auth.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { requireCurrentUser } from '@/app/lib/auth-session';
import { validateInviteToken } from '@/app/actions/invites';

const authService = new AuthService();
const sysSettings = new SystemSettingsService();

const SESSION_COOKIE_NAME = 'session_token';

/**
 * Register a new user
 */
export async function register(
  email: string,
  password: string,
  name?: string
): Promise<{ success: true; user: User } | { success: false; error: string }> {
  // Validate inputs
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Invalid email address' };
  }

  if (!password || password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters' };
  }

  const result = await authService.register(email, password, name);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Set session cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, result.session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: result.session.expiresAt,
    path: '/',
  });

  return { success: true, user: result.user };
}

/**
 * Register a user via an invite token.
 * The token determines which domain the user gets access to.
 */
export async function registerWithInvite(
  inviteToken: string,
  email: string,
  password: string,
  name?: string,
): Promise<{ success: true; redirectTo: string } | { success: false; error: string }> {
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Invalid email address' };
  }
  if (!password || password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters' };
  }

  // Validate token before attempting registration
  const validation = await validateInviteToken(inviteToken);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  if (validation.email !== email.toLowerCase()) {
    return { success: false, error: 'Email does not match the invite' };
  }

  // Register (this grants 'chat' by default, but we'll override with the invite domain)
  const result = await authService.register(email, password, name);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Consume invite — grants the invite domain and marks token used
  const consumed = await authService.consumeInviteToken(inviteToken, result.user.id, email);
  if (!consumed.success) {
    console.error('Failed to consume invite token after registration:', consumed.error);
  }

  // Set session cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, result.session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: result.session.expiresAt,
    path: '/',
  });

  const redirectTo = consumed.success ? `/${consumed.domainSlug}` : '/';
  return { success: true, redirectTo };
}

/**
 * Login a user
 */
export async function login(
  email: string,
  password: string
): Promise<{ success: true; user: User } | { success: false; needsMigration?: boolean; error: string }> {
  if (!email || !password) {
    return { success: false, error: 'Email and password are required' };
  }

  const result = await authService.login(email, password);

  if (!result.success) {
    return { success: false, needsMigration: result.needsMigration, error: result.error };
  }

  // Set session cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, result.session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: result.session.expiresAt,
    path: '/',
  });

  return { success: true, user: result.user };
}

/**
 * One-time unauthenticated migration for v1 (plaintext-bcrypt) accounts.
 * Only succeeds for accounts that still have password_hash_version = 1.
 */
export async function migratePassword(
  email: string,
  hashedPassword: string
): Promise<{ success: true; user: User } | { success: false; error: string }> {
  if (!email || !hashedPassword) {
    return { success: false, error: 'Email and password are required' };
  }

  const result = await authService.migratePassword(email, hashedPassword);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Set session cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, result.session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: result.session.expiresAt,
    path: '/',
  });

  return { success: true, user: result.user };
}

/**
 * Logout the current user
 */
export async function logout(): Promise<{ success: boolean }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await authService.logout(token);
  }

  // Clear the session cookie
  cookieStore.delete(SESSION_COOKIE_NAME);

  return { success: true };
}

/**
 * Check if there's a valid session and return the user
 */
export async function checkSession(): Promise<{ authenticated: true; user: User } | { authenticated: false }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return { authenticated: false };
  }

  const user = await authService.validateSession(token);

  if (!user) {
    // Invalid or expired session, clear the cookie
    cookieStore.delete(SESSION_COOKIE_NAME);
    return { authenticated: false };
  }

  return { authenticated: true, user };
}

/**
 * Get the current user from session (helper for other actions)
 */
export async function getCurrentUser(): Promise<User | null> {
  const result = await checkSession();
  return result.authenticated ? result.user : null;
}

/**
 * Returns the URL the user should be redirected to after login.
 * Admins go to the desktop (/). Domain users go to their first assigned domain.
 * If no domain is assigned, falls back to /.
 */
export async function getLoginRedirect(): Promise<string> {
  const user = await requireCurrentUser();
  if (user.is_admin) return '/';
  const slug = await authService.getFirstDomainSlug(user.id);
  return slug ? `/${slug}` : '/login?error=no-access';
}

/**
 * Check if this is the first run (no users exist)
 * Used to show setup wizard on initial installation
 */
export async function checkFirstRun(): Promise<{ isFirstRun: boolean; userCount: number }> {
  try {
    const pool = (await import('@/app/clients/db')).default;
    const result = await pool.query('SELECT COUNT(*) as count FROM users');
    const userCount = parseInt(result.rows[0].count, 10);
    return { isFirstRun: userCount === 0, userCount };
  } catch (error) {
    console.error('Error checking first run:', error);
    return { isFirstRun: true, userCount: 0 };
  }
}

/**
 * Request a password reset email.
 * Always returns success to prevent email enumeration.
 */
export async function requestPasswordReset(
  email: string
): Promise<{ success: boolean; message: string }> {
  try {
    const pool = (await import('@/app/clients/db')).default;
    const settings = await sysSettings.loadAll();

    if (!settings.resend_api_key) {
      return { success: false, message: 'Password reset is not configured. Please contact the administrator.' };
    }

    const userRes = await pool.query(
      'SELECT id, email, name FROM users WHERE email = $1 AND is_active = true',
      [email.toLowerCase()]
    );

    // Always return the same message — don't reveal whether email exists
    if (userRes.rows.length === 0) {
      return { success: true, message: 'If that email is registered, you will receive a reset link shortly.' };
    }

    const user = userRes.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Delete any existing tokens for this user, then insert the new one
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    const appUrl = process.env.APP_URL ?? 'http://localhost:8080';
    const resetUrl = `${appUrl}/reset-password?token=${token}`;
    const fromEmail = settings.resend_from_email ?? 'noreply@allerac.ai';

    // Inline logo as base64 so it renders in Outlook and offline clients
    let logoSrc = '';
    try {
      const iconPath = path.join(process.cwd(), 'public', 'icon-192.png');
      const iconB64 = fs.readFileSync(iconPath).toString('base64');
      logoSrc = `data:image/png;base64,${iconB64}`;
    } catch { /* skip logo if file not found */ }

    const { Resend } = await import('resend');
    const resend = new Resend(settings.resend_api_key);

    await resend.emails.send({
      from: fromEmail,
      to: user.email,
      subject: 'Reset your Allerac password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #f9f9f9; border-radius: 8px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #6366f1 0%, #4c1d95 60%, #1e1b4b 100%); padding: 32px; text-align: center;">
            ${logoSrc ? `<img src="${logoSrc}" alt="Allerac" width="64" height="64" style="border-radius: 12px;" />` : ''}
          </div>
          <div style="padding: 32px;">
            <h2 style="color: #1e1b4b; margin: 0 0 16px;">Reset your password</h2>
            <p style="color: #444; margin: 0 0 12px;">Hi ${user.name ?? user.email},</p>
            <p style="color: #444; margin: 0 0 24px;">Someone requested a password reset for your Allerac account. Click the button below to set a new password.</p>
            <p style="margin: 0 0 24px;">
              <a href="${resetUrl}" style="background: #6366f1; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Reset Password
              </a>
            </p>
            <p style="color: #888; font-size: 12px; margin: 0 0 8px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
            <p style="color: #bbb; font-size: 11px; margin: 0; word-break: break-all;">Or copy this link: ${resetUrl}</p>
          </div>
          <div style="background: #f0f0f0; padding: 16px; text-align: center;">
            <p style="color: #aaa; font-size: 11px; margin: 0;">Allerac · Private-first AI platform</p>
          </div>
        </div>
      `,
    });

    return { success: true, message: 'If that email is registered, you will receive a reset link shortly.' };
  } catch (error: any) {
    console.error('requestPasswordReset error:', error);
    return { success: false, message: 'Failed to send reset email. Please try again later.' };
  }
}

/**
 * Reset a user's password using a valid token.
 * @param token - the reset token from the email link
 * @param newPasswordHash - SHA-256 hash of the new password (same as login flow)
 */
export async function resetPassword(
  token: string,
  newPasswordHash: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const pool = (await import('@/app/clients/db')).default;

    const tokenRes = await pool.query(
      `SELECT prt.user_id, prt.expires_at
       FROM password_reset_tokens prt
       WHERE prt.token = $1`,
      [token]
    );

    if (tokenRes.rows.length === 0) {
      return { success: false, error: 'Invalid or expired reset link.' };
    }

    const { user_id, expires_at } = tokenRes.rows[0];

    if (new Date(expires_at) < new Date()) {
      await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user_id]);
      return { success: false, error: 'This reset link has expired. Please request a new one.' };
    }

    const bcrypt = await import('bcrypt');
    const newHash = await bcrypt.hash(newPasswordHash, 12);

    await pool.query(
      'UPDATE users SET password_hash = $1, password_hash_version = 2 WHERE id = $2',
      [newHash, user_id]
    );

    // Invalidate all tokens and sessions for this user
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user_id]);
    await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [user_id]);

    return { success: true };
  } catch (error: any) {
    console.error('resetPassword error:', error);
    return { success: false, error: 'Failed to reset password. Please try again.' };
  }
}

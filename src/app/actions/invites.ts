'use server';

import { requireCurrentAdmin } from '@/app/lib/auth-session';
import pool from '@/app/clients/db';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';

const sysSettings = new SystemSettingsService();

export interface InviteRecord {
  token: string;
  email: string;
  domain_slug: string;
  used_at: Date | null;
  expires_at: Date;
  created_at: Date;
  created_by_email: string | null;
}

export async function createInvite(
  email: string,
  domainSlug: string,
): Promise<{ success: true; token: string } | { success: false; error: string }> {
  const admin = await requireCurrentAdmin();

  if (!email || !email.includes('@')) {
    return { success: false, error: 'Invalid email address' };
  }
  if (!domainSlug) {
    return { success: false, error: 'Domain is required' };
  }

  try {
    const domainRes = await pool.query(
      'SELECT slug FROM domains WHERE slug = $1 AND is_active = true',
      [domainSlug],
    );
    if (domainRes.rows.length === 0) {
      return { success: false, error: 'Domain not found or inactive' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await pool.query(
      `INSERT INTO invite_tokens (token, email, domain_slug, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [token, email.toLowerCase(), domainSlug, expiresAt, admin.id],
    );

    const settings = await sysSettings.loadAll();
    if (settings.resend_api_key) {
      await sendInviteEmail(email, domainSlug, token, settings).catch(err =>
        console.error('sendInviteEmail error:', err),
      );
    }

    return { success: true, token };
  } catch (error) {
    console.error('createInvite error:', error);
    return { success: false, error: 'Failed to create invite' };
  }
}

async function sendInviteEmail(
  email: string,
  domainSlug: string,
  token: string,
  settings: { resend_api_key?: string | null; resend_from_email?: string | null },
) {
  const appUrl = process.env.APP_URL ?? 'http://localhost:8080';
  const joinUrl = `${appUrl}/join?token=${token}`;
  const fromEmail = settings.resend_from_email ?? 'noreply@allerac.ai';

  let logoSrc = '';
  try {
    const iconPath = path.join(process.cwd(), 'public', 'icon-192.png');
    const iconB64 = fs.readFileSync(iconPath).toString('base64');
    logoSrc = `data:image/png;base64,${iconB64}`;
  } catch { /* skip logo if file not found */ }

  const { Resend } = await import('resend');
  const resend = new Resend(settings.resend_api_key!);

  await resend.emails.send({
    from: fromEmail,
    to: email,
    subject: `You've been invited to Allerac — ${domainSlug}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #f9f9f9; border-radius: 8px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #6366f1 0%, #4c1d95 60%, #1e1b4b 100%); padding: 32px; text-align: center;">
          ${logoSrc ? `<img src="${logoSrc}" alt="Allerac" width="64" height="64" style="border-radius: 12px;" />` : ''}
        </div>
        <div style="padding: 32px;">
          <h2 style="color: #1e1b4b; margin: 0 0 16px;">You're invited</h2>
          <p style="color: #444; margin: 0 0 12px;">You've been invited to access <strong>${domainSlug}</strong> on Allerac.</p>
          <p style="color: #444; margin: 0 0 24px;">Click the button below to create your account and get started. This invite expires in 7 days.</p>
          <p style="margin: 0 0 24px;">
            <a href="${joinUrl}" style="background: #6366f1; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Accept invite
            </a>
          </p>
          <p style="color: #bbb; font-size: 11px; margin: 0; word-break: break-all;">Or copy this link: ${joinUrl}</p>
        </div>
        <div style="background: #f0f0f0; padding: 16px; text-align: center;">
          <p style="color: #aaa; font-size: 11px; margin: 0;">Allerac · Private-first AI platform</p>
        </div>
      </div>
    `,
  });
}

export async function listInvites(): Promise<InviteRecord[]> {
  await requireCurrentAdmin();
  const res = await pool.query<InviteRecord>(
    `SELECT it.token, it.email, it.domain_slug, it.used_at, it.expires_at, it.created_at,
            u.email AS created_by_email
     FROM invite_tokens it
     LEFT JOIN users u ON it.created_by = u.id
     ORDER BY it.created_at DESC
     LIMIT 100`,
  );
  return res.rows;
}

export async function revokeInvite(
  token: string,
): Promise<{ success: boolean; error?: string }> {
  await requireCurrentAdmin();
  try {
    await pool.query('DELETE FROM invite_tokens WHERE token = $1 AND used_at IS NULL', [token]);
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to revoke invite' };
  }
}

export async function validateInviteToken(token: string): Promise<
  | { valid: true; email: string; domainSlug: string }
  | { valid: false; error: string }
> {
  try {
    const res = await pool.query(
      `SELECT email, domain_slug, used_at, expires_at
       FROM invite_tokens
       WHERE token = $1`,
      [token],
    );
    if (res.rows.length === 0) return { valid: false, error: 'Invalid invite link.' };
    const row = res.rows[0];
    if (row.used_at) return { valid: false, error: 'This invite has already been used.' };
    if (new Date(row.expires_at) < new Date()) return { valid: false, error: 'This invite has expired.' };
    return { valid: true, email: row.email, domainSlug: row.domain_slug };
  } catch {
    return { valid: false, error: 'Failed to validate invite.' };
  }
}

// Auth service for user authentication

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import pool from '@/app/clients/db';

const BCRYPT_COST_FACTOR = 12;
const SESSION_EXPIRY_DAYS = 7;

export interface User {
  id: string;
  email: string;
  name: string | null;
  is_admin: boolean;
  created_at: Date;
}

export interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  created_at: Date;
}

export class AuthService {
  /**
   * Hash a password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_COST_FACTOR);
  }

  /**
   * Verify a password against a hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate a cryptographically secure session token
   */
  generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create a new session for a user
   */
  async createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = this.generateSessionToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

    await pool.query(
      `INSERT INTO user_sessions (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, token, expiresAt]
    );

    return { token, expiresAt };
  }

  /**
   * Register a new user
   */
  async register(
    email: string,
    password: string,
    name?: string
  ): Promise<{ success: true; user: User; session: { token: string; expiresAt: Date } } | { success: false; error: string }> {
    try {
      // Check if user already exists
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (existingUser.rows.length > 0) {
        return { success: false, error: 'Email already registered' };
      }

      // Hash password
      const passwordHash = await this.hashPassword(password);

      // First user ever created becomes admin automatically
      const userCount = await pool.query('SELECT COUNT(*) FROM users');
      const isFirstUser = parseInt(userCount.rows[0].count) === 0;

      // Create user
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, name, is_admin)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name, is_admin, created_at`,
        [email.toLowerCase(), passwordHash, name || null, isFirstUser]
      );

      const user = result.rows[0] as User;

      // Non-admin users get 'chat' domain access by default
      if (!isFirstUser) {
        await pool.query(
          `INSERT INTO user_domain_access (user_id, domain_id)
           SELECT $1, id FROM domains WHERE slug = 'chat' AND is_active = true
           ON CONFLICT DO NOTHING`,
          [user.id]
        );
      }

      // Create session
      const session = await this.createSession(user.id);

      return { success: true, user, session };
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: 'Registration failed' };
    }
  }

  /**
   * Login a user with email and password (SHA-256 pre-hashed by client)
   */
  async login(
    email: string,
    password: string
  ): Promise<
    | { success: true; user: User; session: { token: string; expiresAt: Date } }
    | { success: false; needsMigration: true; error: string }
    | { success: false; needsMigration?: false; error: string }
  > {
    try {
      // Find user by email (include password_hash and version for verification)
      const result = await pool.query(
        'SELECT id, email, name, is_admin, password_hash, password_hash_version, created_at FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Invalid email or password' };
      }

      const row = result.rows[0];

      // Check if user has a password (registered users only)
      if (!row.password_hash) {
        return { success: false, error: 'Invalid email or password' };
      }

      // v1 accounts were hashed from plaintext; the client now sends sha256(plaintext)
      // so a bcrypt.compare would always fail — prompt migration instead.
      if (row.password_hash_version === 1) {
        return {
          success: false,
          needsMigration: true,
          error: 'Your account needs a one-time security upgrade. Please set a new password.',
        };
      }

      // Verify password (v2: bcrypt of sha256 pre-hash from client)
      const isValid = await this.verifyPassword(password, row.password_hash);
      if (!isValid) {
        return { success: false, error: 'Invalid email or password' };
      }

      const user: User = {
        id: row.id,
        email: row.email,
        name: row.name,
        is_admin: row.is_admin,
        created_at: row.created_at,
      };

      // Create session
      const session = await this.createSession(user.id);

      return { success: true, user, session };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Login failed' };
    }
  }

  /**
   * Migrate a v1 (plaintext-bcrypt) account to v2 (sha256-bcrypt).
   * This is an unauthenticated one-time operation — only available for v1 accounts.
   */
  async migratePassword(
    email: string,
    newHashedPassword: string
  ): Promise<{ success: true; user: User; session: { token: string; expiresAt: Date } } | { success: false; error: string }> {
    try {
      const result = await pool.query(
        'SELECT id, email, name, password_hash_version, created_at FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Invalid email or password' };
      }

      const row = result.rows[0];

      // Only allow migration for v1 accounts
      if (row.password_hash_version !== 1) {
        return { success: false, error: 'Invalid email or password' };
      }

      const newHash = await this.hashPassword(newHashedPassword);

      await pool.query(
        'UPDATE users SET password_hash = $1, password_hash_version = 2 WHERE id = $2',
        [newHash, row.id]
      );

      const user: User = {
        id: row.id,
        email: row.email,
        name: row.name,
        is_admin: row.is_admin,
        created_at: row.created_at,
      };

      const session = await this.createSession(user.id);

      return { success: true, user, session };
    } catch (error) {
      console.error('Password migration error:', error);
      return { success: false, error: 'Migration failed' };
    }
  }

  /**
   * Validate a session token and return the user if valid
   */
  async validateSession(token: string): Promise<User | null> {
    try {
      const result = await pool.query(
        `SELECT u.id, u.email, u.name, u.is_admin, u.created_at
         FROM user_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token = $1 AND s.expires_at > NOW() AND u.is_active = true`,
        [token]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0] as User;
    } catch (error) {
      console.error('Session validation error:', error);
      return null;
    }
  }

  /**
   * Logout by deleting the session
   */
  async logout(token: string): Promise<{ success: boolean }> {
    try {
      await pool.query(
        'DELETE FROM user_sessions WHERE token = $1',
        [token]
      );
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      return { success: false };
    }
  }

  /**
   * Clean up expired sessions (can be called periodically)
   */
  async cleanupExpiredSessions(): Promise<void> {
    try {
      await pool.query('DELETE FROM user_sessions WHERE expires_at < NOW()');
    } catch (error) {
      console.error('Session cleanup error:', error);
    }
  }

  /**
   * Returns the slug of the first active domain a non-admin user can access,
   * or null if none is assigned.
   */
  async getFirstDomainSlug(userId: string): Promise<string | null> {
    try {
      const result = await pool.query(
        `SELECT d.slug
         FROM user_domain_access uda
         JOIN domains d ON uda.domain_id = d.id
         WHERE uda.user_id = $1 AND d.is_active = true
         ORDER BY d.created_at ASC
         LIMIT 1`,
        [userId]
      );
      return result.rows[0]?.slug ?? null;
    } catch (error) {
      console.error('getFirstDomainSlug error:', error);
      return null;
    }
  }

  /**
   * Checks whether a user has access to a specific domain slug.
   * Admins always have access. Non-admins need an entry in user_domain_access.
   */
  async canAccessDomain(userId: string, isAdmin: boolean, slug: string): Promise<boolean> {
    if (isAdmin) return true;
    try {
      const result = await pool.query(
        `SELECT 1
         FROM user_domain_access uda
         JOIN domains d ON uda.domain_id = d.id
         WHERE uda.user_id = $1 AND d.slug = $2 AND d.is_active = true
         LIMIT 1`,
        [userId, slug]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('canAccessDomain error:', error);
      return false;
    }
  }
}

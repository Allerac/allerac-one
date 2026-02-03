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

      // Create user
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, name)
         VALUES ($1, $2, $3)
         RETURNING id, email, name, created_at`,
        [email.toLowerCase(), passwordHash, name || null]
      );

      const user = result.rows[0] as User;

      // Create session
      const session = await this.createSession(user.id);

      return { success: true, user, session };
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: 'Registration failed' };
    }
  }

  /**
   * Login a user with email and password
   */
  async login(
    email: string,
    password: string
  ): Promise<{ success: true; user: User; session: { token: string; expiresAt: Date } } | { success: false; error: string }> {
    try {
      // Find user by email (include password_hash for verification)
      const result = await pool.query(
        'SELECT id, email, name, password_hash, created_at FROM users WHERE email = $1',
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

      // Verify password
      const isValid = await this.verifyPassword(password, row.password_hash);
      if (!isValid) {
        return { success: false, error: 'Invalid email or password' };
      }

      const user: User = {
        id: row.id,
        email: row.email,
        name: row.name,
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
   * Validate a session token and return the user if valid
   */
  async validateSession(token: string): Promise<User | null> {
    try {
      const result = await pool.query(
        `SELECT u.id, u.email, u.name, u.created_at
         FROM user_sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token = $1 AND s.expires_at > NOW()`,
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
}

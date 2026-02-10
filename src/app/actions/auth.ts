'use server';

import { cookies } from 'next/headers';
import { AuthService, User } from '@/app/services/auth/auth.service';

const authService = new AuthService();

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
 * Login a user
 */
export async function login(
  email: string,
  password: string
): Promise<{ success: true; user: User } | { success: false; error: string }> {
  if (!email || !password) {
    return { success: false, error: 'Email and password are required' };
  }

  const result = await authService.login(email, password);

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

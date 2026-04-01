import '../../../__tests__/__mocks__/db'; // Import mock first
import { AuthService, User } from '@/app/services/auth/auth.service';
import pool from '@/app/clients/db';

jest.mock('bcrypt', () => ({
  hash: jest.fn(async (password) => `hashed_${password}`),
  compare: jest.fn(async (password, hash) => hash === `hashed_${password}`),
}));

const mockQuery = (pool as any).query;

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService();
  });

  describe('hashPassword()', () => {
    it('should hash password using bcrypt', async () => {
      const password = 'testPassword123';
      const hash = await authService.hashPassword(password);

      expect(hash).toContain('hashed_');
      expect(hash).toContain(password);
    });

    it('should return different hash for different passwords', async () => {
      const hash1 = await authService.hashPassword('password1');
      const hash2 = await authService.hashPassword('password2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword()', () => {
    it('should return true for matching password and hash', async () => {
      const password = 'testPassword123';
      const hash = `hashed_${password}`;

      const result = await authService.verifyPassword(password, hash);
      expect(result).toBe(true);
    });

    it('should return false for non-matching password', async () => {
      const hash = 'hashed_testPassword123';
      const result = await authService.verifyPassword('wrongPassword', hash);
      expect(result).toBe(false);
    });
  });

  describe('generateSessionToken()', () => {
    it('should generate a hex token', () => {
      const token = authService.generateSessionToken();

      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      // Should be hex (base16)
      expect(/^[0-9a-f]+$/.test(token)).toBe(true);
    });

    it('should generate unique tokens', () => {
      const token1 = authService.generateSessionToken();
      const token2 = authService.generateSessionToken();

      expect(token1).not.toBe(token2);
    });
  });

  describe('createSession()', () => {
    it('should insert session and return token with expiresAt', async () => {
      const userId = 'user_123';
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await authService.createSession(userId);

      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_sessions'),
        expect.arrayContaining([userId])
      );
    });

    it('should set expiry to 7 days from now', async () => {
      const userId = 'user_456';
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const beforeCall = new Date();
      const result = await authService.createSession(userId);
      const afterCall = new Date();

      // Expected: 7 days from now
      const expectedMin = new Date(beforeCall);
      expectedMin.setDate(expectedMin.getDate() + 7);
      const expectedMax = new Date(afterCall);
      expectedMax.setDate(expectedMax.getDate() + 7);

      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime());
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(expectedMax.getTime());
    });
  });

  describe('register()', () => {
    it('should register new user with email and password', async () => {
      const email = 'newuser@test.com';
      const password = 'password123';
      const name = 'Test User';

      // Query: check existing user
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Query: insert user
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user_new_123',
            email,
            name,
            created_at: new Date(),
          },
        ],
      });
      // Query: create session
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await authService.register(email, password, name);

      expect(result.success).toBe(true);
      expect((result as any).user.email).toBe(email);
      expect((result as any).user.name).toBe(name);
      expect((result as any).session.token).toBeDefined();
    });

    it('should lowercase email before checking', async () => {
      const email = 'TestUser@EXAMPLE.COM';

      mockQuery.mockResolvedValueOnce({ rows: [] }); // No existing user
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user_123',
            email: email.toLowerCase(),
            name: null,
            created_at: new Date(),
          },
        ],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Session

      await authService.register(email, 'password123');

      // Verify first query (checking existing) was lowercased
      const firstCall = mockQuery.mock.calls[0];
      expect(firstCall[1]).toContain(email.toLowerCase());
    });

    it('should return error when email already exists', async () => {
      const email = 'existing@test.com';

      // User already exists
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user_existing' }],
      });

      const result = await authService.register(email, 'password', 'Test');

      expect(result.success).toBe(false);
      expect((result as any).error).toBe('Email already registered');
    });

    it('should use null for name if not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No existing
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user_123',
            email: 'test@test.com',
            name: null,
            created_at: new Date(),
          },
        ],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Session

      await authService.register('test@test.com', 'password123');

      // Check INSERT call used null for name
      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[1]).toContain(null);
    });

    it('should handle registration errors with generic message', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await authService.register('test@test.com', 'password', 'Test');

      expect(result.success).toBe(false);
      expect((result as any).error).toBe('Registration failed');
    });
  });

  describe('login()', () => {
    it('should login v2 user with correct credentials', async () => {
      const email = 'user@test.com';
      const password = 'password123';
      const hashedPassword = `hashed_${password}`;

      // Query: find user
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user_123',
            email,
            name: 'Test User',
            password_hash: hashedPassword,
            password_hash_version: 2, // v2 account
            created_at: new Date(),
          },
        ],
      });
      // Query: create session
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await authService.login(email, password);

      expect(result.success).toBe(true);
      expect((result as any).user.email).toBe(email);
      expect((result as any).session.token).toBeDefined();
    });

    it('should return needsMigration for v1 users', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user_v1',
            email: 'user@test.com',
            password_hash: 'some_hash',
            password_hash_version: 1, // v1 account!
            created_at: new Date(),
          },
        ],
      });

      const result = await authService.login('user@test.com', 'password');

      expect(result.success).toBe(false);
      expect((result as any).needsMigration).toBe(true);
      expect((result as any).error).toContain('security upgrade');
    });

    it('should return generic error for non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await authService.login('nonexistent@test.com', 'password');

      expect(result.success).toBe(false);
      expect((result as any).error).toBe('Invalid email or password');
      expect((result as any).needsMigration).toBeUndefined();
    });

    it('should return generic error for wrong password', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user_123',
            email: 'user@test.com',
            password_hash: 'hashed_correctPassword',
            password_hash_version: 2,
            created_at: new Date(),
          },
        ],
      });

      const result = await authService.login('user@test.com', 'wrongPassword');

      expect(result.success).toBe(false);
      expect((result as any).error).toBe('Invalid email or password');
    });

    it('should lowercase email for lookup', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await authService.login('TestUser@EXAMPLE.COM', 'password');

      const callEmail = mockQuery.mock.calls[0][1][0];
      expect(callEmail).toBe('testuser@example.com');
    });

    it('should handle login errors with generic message', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await authService.login('user@test.com', 'password');

      expect(result.success).toBe(false);
      expect((result as any).error).toBe('Login failed');
    });
  });

  describe('migratePassword()', () => {
    it('should migrate v1 account to v2', async () => {
      const email = 'v1user@test.com';
      const newPassword = 'newpassword123';

      // Query: find v1 user
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user_v1',
            email,
            name: 'V1 User',
            password_hash_version: 1,
            created_at: new Date(),
          },
        ],
      });
      // Query: update password
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Query: create session
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await authService.migratePassword(email, newPassword);

      expect(result.success).toBe(true);
      expect((result as any).user.email).toBe(email);
      expect((result as any).session.token).toBeDefined();

      // Check update query
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE users');
      expect(updateCall[1][1]).toBe('user_v1'); // user ID
    });

    it('should reject migration for v2 accounts', async () => {
      // User is already v2
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user_v2',
            email: 'v2user@test.com',
            password_hash_version: 2,
            created_at: new Date(),
          },
        ],
      });

      const result = await authService.migratePassword(
        'v2user@test.com',
        'newpassword'
      );

      expect(result.success).toBe(false);
      expect((result as any).error).toBe('Invalid email or password');
    });

    it('should return error for non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await authService.migratePassword(
        'nonexistent@test.com',
        'password'
      );

      expect(result.success).toBe(false);
      expect((result as any).error).toBe('Invalid email or password');
    });

    it('should handle migration errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await authService.migratePassword('user@test.com', 'password');

      expect(result.success).toBe(false);
      expect((result as any).error).toBe('Migration failed');
    });
  });

  describe('validateSession()', () => {
    it('should return user for valid active session', async () => {
      const token = 'valid_token_123';
      const user = {
        id: 'user_123',
        email: 'user@test.com',
        name: 'Test User',
        created_at: new Date(),
      };

      // Query: JOIN user_sessions with users (expires_at > NOW())
      mockQuery.mockResolvedValueOnce({
        rows: [user],
      });

      const result = await authService.validateSession(token);

      expect(result).toEqual(user);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('JOIN users u ON s.user_id = u.id'),
        [token]
      );
    });

    it('should return null for non-existent token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await authService.validateSession('invalid_token');

      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Query failed'));

      const result = await authService.validateSession('token');

      expect(result).toBeNull();
    });

    it('should filter by expires_at > NOW() in query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await authService.validateSession('token');

      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('expires_at > NOW()');
    });
  });

  describe('logout()', () => {
    it('should delete session and return success', async () => {
      const token = 'token_to_logout';
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await authService.logout(token);

      expect(result.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM user_sessions WHERE token'),
        [token]
      );
    });

    it('should return false on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Delete failed'));

      const result = await authService.logout('token');

      expect(result.success).toBe(false);
    });
  });

  describe('cleanupExpiredSessions()', () => {
    it('should delete expired sessions', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await authService.cleanupExpiredSessions();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM user_sessions WHERE expires_at < NOW()')
      );
    });

    it('should handle cleanup errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Cleanup failed'));

      // Should not throw
      await expect(authService.cleanupExpiredSessions()).resolves.toBeUndefined();
    });
  });
});

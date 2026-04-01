import { encrypt, decrypt, isEncrypted, safeDecrypt } from '@/app/services/crypto/encryption.service';

describe('EncryptionService', () => {
  const testText = 'Hello, World!';
  const testToken = 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

  describe('encrypt()', () => {
    it('should encrypt text to a different string', () => {
      const encrypted = encrypt(testText);
      expect(encrypted).not.toBe(testText);
      expect(typeof encrypted).toBe('string');
    });

    it('should encrypt empty string', () => {
      const encrypted = encrypt('');
      expect(encrypted).not.toBe('');
      expect(typeof encrypted).toBe('string');
    });

    it('should produce consistent encryption (same input -> same format)', () => {
      const encrypted1 = encrypt(testText);
      const encrypted2 = encrypt(testText);
      // Different encryptions (due to IV randomization), but both valid
      expect(typeof encrypted1).toBe('string');
      expect(typeof encrypted2).toBe('string');
    });
  });

  describe('decrypt()', () => {
    it('should decrypt encrypted text correctly', () => {
      const encrypted = encrypt(testText);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(testText);
    });

    it('should decrypt token correctly', () => {
      const encrypted = encrypt(testToken);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(testToken);
    });

    it('should handle empty encrypted strings', () => {
      const encrypted = encrypt('');
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe('');
    });

    it('should throw on invalid ciphertext', () => {
      expect(() => decrypt('invalid_ciphertext')).toThrow();
    });

    it('should throw on malformed encryption', () => {
      expect(() => decrypt('abc123def456')).toThrow();
    });
  });

  describe('isEncrypted()', () => {
    it('should return true for encrypted text', () => {
      const encrypted = encrypt(testText);
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(isEncrypted(testText)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isEncrypted('')).toBe(false);
    });

    it('should return false for random strings', () => {
      expect(isEncrypted('just plain text')).toBe(false);
      expect(isEncrypted('1234567890')).toBe(false);
    });

    it('should return true for multi-line encrypted text', () => {
      const encrypted = encrypt('Line 1\nLine 2\nLine 3');
      expect(isEncrypted(encrypted)).toBe(true);
    });
  });

  describe('safeDecrypt()', () => {
    it('should decrypt encrypted text safely', () => {
      const encrypted = encrypt(testText);
      const decrypted = safeDecrypt(encrypted);
      expect(decrypted).toBe(testText);
    });

    it('should return original text if not encrypted', () => {
      const result = safeDecrypt(testText);
      expect(result).toBe(testText);
    });

    it('should not throw on invalid ciphertext', () => {
      expect(() => safeDecrypt('invalid_ciphertext')).not.toThrow();
    });

    it('should return original when decryption fails', () => {
      const invalidEncrypted = 'enc_not_really_encrypted';
      const result = safeDecrypt(invalidEncrypted);
      expect(result).toBe(invalidEncrypted);
    });

    it('should handle mixed content safely', () => {
      const encrypted = encrypt(testToken);
      const plainToken = 'ghp_another_plain_token';

      const result1 = safeDecrypt(encrypted);
      const result2 = safeDecrypt(plainToken);

      expect(result1).toBe(testToken);
      expect(result2).toBe(plainToken);
    });
  });

  describe('round-trip encryption', () => {
    const testCases = [
      'simple text',
      'text with special chars: !@#$%^&*()',
      'multiline\ntext\nhere',
      'emoji 🚀 test',
      'very long text: '.repeat(100),
      'ghp_1234567890abcdefghijklmnopqrstuvwxyz',
    ];

    testCases.forEach(text => {
      it(`should round-trip: "${text.substring(0, 30)}..."`, () => {
        const encrypted = encrypt(text);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(text);
      });
    });
  });
});

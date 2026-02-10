// Encryption service for sensitive data

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }

  // Key should be 32 bytes (256 bits) for AES-256
  // If provided as hex string (64 chars), convert to buffer
  if (key.length === 64) {
    return Buffer.from(key, 'hex');
  }

  // If provided as base64 (44 chars), convert to buffer
  if (key.length === 44) {
    return Buffer.from(key, 'base64');
  }

  // Otherwise hash it to get consistent 32 bytes
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt a string value
 * Returns format: iv:authTag:encryptedData (all hex encoded)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a string value
 * Expects format: iv:authTag:encryptedData (all hex encoded)
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();

  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Check if a value is encrypted (has the expected format)
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(':');
  return parts.length === 3 &&
    parts[0].length === IV_LENGTH * 2 &&
    parts[1].length === AUTH_TAG_LENGTH * 2;
}

/**
 * Safely decrypt - returns original value if decryption fails or value isn't encrypted
 * Useful for migration from unencrypted to encrypted values
 */
export function safeDecrypt(value: string): string {
  if (!value) return value;

  if (!isEncrypted(value)) {
    return value; // Return as-is if not encrypted
  }

  try {
    return decrypt(value);
  } catch (error) {
    console.error('Decryption failed, returning original value');
    return value;
  }
}

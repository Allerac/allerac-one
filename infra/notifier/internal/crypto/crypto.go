package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strings"
)

// deriveKey converts the ENCRYPTION_KEY env var to a 32-byte AES key,
// matching the logic in src/app/services/crypto/encryption.service.ts.
func deriveKey(encryptionKey string) ([]byte, error) {
	if len(encryptionKey) == 64 {
		key, err := hex.DecodeString(encryptionKey)
		if err == nil {
			return key, nil
		}
	}
	if len(encryptionKey) == 44 {
		key, err := base64.StdEncoding.DecodeString(encryptionKey)
		if err == nil {
			return key, nil
		}
	}
	h := sha256.Sum256([]byte(encryptionKey))
	return h[:], nil
}

// Decrypt decrypts a value encrypted by the TypeScript encryption service.
// Expected format: iv:authTag:ciphertext (all hex-encoded).
// IV is 16 bytes (non-standard GCM — matches IV_LENGTH = 16 in the TS service).
func Decrypt(ciphertext, encryptionKey string) (string, error) {
	parts := strings.SplitN(ciphertext, ":", 3)
	if len(parts) != 3 {
		return "", fmt.Errorf("invalid encrypted format: expected iv:authTag:ciphertext")
	}

	iv, err := hex.DecodeString(parts[0])
	if err != nil {
		return "", fmt.Errorf("decode iv: %w", err)
	}
	authTag, err := hex.DecodeString(parts[1])
	if err != nil {
		return "", fmt.Errorf("decode auth tag: %w", err)
	}
	encrypted, err := hex.DecodeString(parts[2])
	if err != nil {
		return "", fmt.Errorf("decode ciphertext: %w", err)
	}

	key, err := deriveKey(encryptionKey)
	if err != nil {
		return "", fmt.Errorf("derive key: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}

	// Use nonce size matching the TS IV_LENGTH (16 bytes)
	gcm, err := cipher.NewGCMWithNonceSize(block, len(iv))
	if err != nil {
		return "", fmt.Errorf("create gcm: %w", err)
	}

	// Go's gcm.Open expects ciphertext with auth tag appended at the end
	ciphertextWithTag := append(encrypted, authTag...) //nolint:gocritic
	plaintext, err := gcm.Open(nil, iv, ciphertextWithTag, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt: %w", err)
	}

	return string(plaintext), nil
}

// SafeDecrypt decrypts if the value looks encrypted; returns it as-is otherwise.
func SafeDecrypt(value, encryptionKey string) (string, error) {
	if value == "" {
		return value, nil
	}
	parts := strings.SplitN(value, ":", 3)
	if len(parts) != 3 {
		return value, nil // not encrypted
	}
	return Decrypt(value, encryptionKey)
}

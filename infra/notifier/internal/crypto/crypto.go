package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/hex"
	"fmt"
	"strings"
)

// deriveKey matches the TypeScript logic in telegram-bot-config.service.ts:
//   Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32))
func deriveKey(encryptionKey string) []byte {
	padded := encryptionKey
	for len(padded) < 32 {
		padded += "0"
	}
	return []byte(padded[:32])
}

// Decrypt decrypts a bot token encrypted by telegram-bot-config.service.ts.
// Algorithm: AES-256-CBC
// Format: iv_hex:ciphertext_hex  (2 parts, no auth tag)
func Decrypt(ciphertext, encryptionKey string) (string, error) {
	parts := strings.SplitN(ciphertext, ":", 2)
	if len(parts) != 2 {
		return "", fmt.Errorf("invalid encrypted format: expected iv:ciphertext")
	}

	iv, err := hex.DecodeString(parts[0])
	if err != nil {
		return "", fmt.Errorf("decode iv: %w", err)
	}
	encrypted, err := hex.DecodeString(parts[1])
	if err != nil {
		return "", fmt.Errorf("decode ciphertext: %w", err)
	}

	key := deriveKey(encryptionKey)
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}

	if len(encrypted)%aes.BlockSize != 0 {
		return "", fmt.Errorf("ciphertext length is not a multiple of block size")
	}

	mode := cipher.NewCBCDecrypter(block, iv)
	plaintext := make([]byte, len(encrypted))
	mode.CryptBlocks(plaintext, encrypted)

	// Remove PKCS7 padding
	plaintext, err = pkcs7Unpad(plaintext)
	if err != nil {
		return "", fmt.Errorf("unpad: %w", err)
	}

	return string(plaintext), nil
}

// SafeDecrypt decrypts if the value looks like iv:ciphertext; returns it as-is otherwise.
func SafeDecrypt(value, encryptionKey string) (string, error) {
	if value == "" {
		return value, nil
	}
	parts := strings.SplitN(value, ":", 2)
	if len(parts) != 2 {
		return value, nil // not encrypted
	}
	return Decrypt(value, encryptionKey)
}

func pkcs7Unpad(data []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty data")
	}
	padLen := int(data[len(data)-1])
	if padLen == 0 || padLen > aes.BlockSize {
		return nil, fmt.Errorf("invalid padding length: %d", padLen)
	}
	return data[:len(data)-padLen], nil
}

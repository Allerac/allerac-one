package config

import "os"

// Config holds all runtime configuration for the notifier service.
type Config struct {
	DatabaseURL    string
	RedisURL       string
	OllamaBaseURL  string
	LLMModel       string
	EncryptionKey  string
	AlleracAppURL  string // if set, use Allerac runner instead of Ollama
	ExecutorSecret string
}

// Load reads configuration from environment variables.
func Load() *Config {
	return &Config{
		DatabaseURL:    getEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/allerac"),
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379"),
		OllamaBaseURL:  getEnv("OLLAMA_BASE_URL", "http://localhost:11434"),
		LLMModel:       getEnv("NOTIFIER_LLM_MODEL", "qwen2.5:3b"),
		EncryptionKey:  getEnv("TELEGRAM_TOKEN_ENCRYPTION_KEY", getEnv("ENCRYPTION_KEY", "")),
		AlleracAppURL:  getEnv("ALLERAC_APP_URL", ""),
		ExecutorSecret: getEnv("EXECUTOR_SECRET", ""),
	}
}

func getEnv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

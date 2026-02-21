package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/allerac/notifier/internal/config"
	telegram "github.com/allerac/notifier/internal/consumers/telegram"
	"github.com/allerac/notifier/internal/db"
	"github.com/allerac/notifier/internal/publisher"
	"github.com/allerac/notifier/internal/runner"
	"github.com/allerac/notifier/internal/scheduler"
)

func main() {
	cfg := config.Load()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// PostgreSQL
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("[notifier] Failed to connect to database: %v", err)
	}
	defer pool.Close()

	// Redis Stream publisher
	pub, err := publisher.New(cfg.RedisURL)
	if err != nil {
		log.Fatalf("[notifier] Failed to create publisher: %v", err)
	}
	defer pub.Close()

	// LLM runner (Ollama-compatible)
	run := runner.New(cfg.OllamaBaseURL, cfg.LLMModel)

	// Scheduler: loads jobs from DB and fires them on cron
	sched := scheduler.New(pool, run, pub)
	if err := sched.Start(ctx); err != nil {
		log.Fatalf("[notifier] Failed to start scheduler: %v", err)
	}
	defer sched.Stop()

	// Telegram consumer: reads stream and delivers messages
	tgConsumer, err := telegram.New(cfg.RedisURL, pool, cfg.TelegramBotToken)
	if err != nil {
		log.Fatalf("[notifier] Failed to create Telegram consumer: %v", err)
	}
	if err := tgConsumer.Start(ctx); err != nil {
		log.Fatalf("[notifier] Failed to start Telegram consumer: %v", err)
	}

	// Minimal health endpoint
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})
	go func() {
		if err := http.ListenAndServe(":3002", nil); err != nil && err != http.ErrServerClosed {
			log.Printf("[notifier] Health server error: %v", err)
		}
	}()

	log.Printf("[notifier] Running. Ollama=%s Model=%s", cfg.OllamaBaseURL, cfg.LLMModel)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Printf("[notifier] Shutting down...")
	cancel()
}

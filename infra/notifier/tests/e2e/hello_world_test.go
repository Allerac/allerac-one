//go:build e2e

package e2e_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	telegram "github.com/allerac/notifier/internal/consumers/telegram"
	"github.com/allerac/notifier/internal/db"
	"github.com/allerac/notifier/internal/publisher"
	"github.com/allerac/notifier/internal/runner"
	"github.com/allerac/notifier/internal/scheduler"
)

// TestHelloWorldScheduledJob is the end-to-end test for the "Hello World Daily" job.
//
// It exercises the full pipeline:
//
//	DB (scheduled_jobs) → Scheduler → Runner (mock Ollama) → Publisher (Redis Stream)
//	→ Telegram Consumer → Telegram API (mock) → verifies message delivered
//
// Run with:
//
//	TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/allerac \
//	TEST_REDIS_URL=redis://localhost:6379 \
//	go test -tags e2e ./tests/e2e/...
func TestHelloWorldScheduledJob(t *testing.T) {
	dbURL := os.Getenv("TEST_DATABASE_URL")
	redisURL := os.Getenv("TEST_REDIS_URL")
	if dbURL == "" || redisURL == "" {
		t.Skip("Set TEST_DATABASE_URL and TEST_REDIS_URL to run E2E tests")
	}

	ctx := context.Background()

	// --- Infrastructure ---

	pool, err := db.Connect(ctx, dbURL)
	require.NoError(t, err, "connect to PostgreSQL")
	defer pool.Close()

	redisOpts, err := redis.ParseURL(redisURL)
	require.NoError(t, err)
	redisClient := redis.NewClient(redisOpts)
	defer redisClient.Close()

	// Clean up the stream before the test
	redisClient.Del(ctx, publisher.StreamName)

	// --- Mock Ollama: always returns "Hello, World!" ---
	ollamaSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(runner.ChatResponse{
			Message: runner.ChatMsg{Role: "assistant", Content: "Hello, World!"},
		})
	}))
	defer ollamaSrv.Close()

	// --- Mock Telegram API: capture outgoing message ---
	var receivedChatID int64
	var receivedText string
	tgSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]interface{}
		json.NewDecoder(r.Body).Decode(&payload)
		receivedChatID = int64(payload["chat_id"].(float64))
		receivedText = payload["text"].(string)
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]bool{"ok": true})
	}))
	defer tgSrv.Close()

	// --- Setup: create test user ---
	var userID string
	err = pool.QueryRow(ctx, `
		INSERT INTO users (username, password_hash)
		VALUES ('e2e_hello_world_notifier', 'noop')
		ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
		RETURNING id
	`).Scan(&userID)
	require.NoError(t, err, "create test user")

	defer pool.Exec(ctx, "DELETE FROM users WHERE username = 'e2e_hello_world_notifier'")

	// --- Setup: map user to a Telegram chat ---
	const testChatID int64 = 987654321
	_, err = pool.Exec(ctx, `
		INSERT INTO telegram_chat_mapping (telegram_chat_id, user_id, telegram_user_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (telegram_chat_id) DO UPDATE SET user_id = EXCLUDED.user_id
	`, testChatID, userID, testChatID)
	require.NoError(t, err, "create telegram chat mapping")

	defer pool.Exec(ctx, "DELETE FROM telegram_chat_mapping WHERE telegram_chat_id = $1", testChatID)

	// --- Setup: insert the "Hello World Daily" scheduled job ---
	var jobID string
	err = pool.QueryRow(ctx, `
		INSERT INTO scheduled_jobs (user_id, name, cron_expr, prompt, channels)
		VALUES ($1, 'Hello World Daily', '0 8 * * *', 'Say a friendly hello world greeting', ARRAY['telegram'])
		RETURNING id
	`, userID).Scan(&jobID)
	require.NoError(t, err, "insert scheduled job")

	defer pool.Exec(ctx, "DELETE FROM scheduled_jobs WHERE id = $1", jobID)

	t.Logf("Created job %s for user %s", jobID, userID)

	// --- Execute ---

	pub, err := publisher.New(redisURL)
	require.NoError(t, err)
	defer pub.Close()

	run := runner.New(ollamaSrv.URL, "test-model")
	sched := scheduler.New(pool, run, pub)

	sched.ExecuteJob(ctx, scheduler.Job{
		ID:       jobID,
		UserID:   userID,
		Name:     "Hello World Daily",
		CronExpr: "0 8 * * *",
		Prompt:   "Say a friendly hello world greeting",
		Channels: []string{"telegram"},
	})

	// --- Assert: Redis Stream has the notification ---

	msgs, err := redisClient.XRange(ctx, publisher.StreamName, "-", "+").Result()
	require.NoError(t, err)
	require.NotEmpty(t, msgs, "expected notification in Redis stream")

	lastMsg := msgs[len(msgs)-1]
	assert.Equal(t, "Hello, World!", lastMsg.Values["content"], "stream content")
	assert.Equal(t, "telegram", lastMsg.Values["channel"], "stream channel")
	assert.Equal(t, userID, lastMsg.Values["user_id"], "stream user_id")
	assert.Equal(t, jobID, lastMsg.Values["job_id"], "stream job_id")

	// --- Assert: job_executions record is 'completed' ---

	var execStatus, execResult string
	err = pool.QueryRow(ctx, `
		SELECT status, result FROM job_executions WHERE job_id = $1
	`, jobID).Scan(&execStatus, &execResult)
	require.NoError(t, err, "read execution record")
	assert.Equal(t, "completed", execStatus)
	assert.Equal(t, "Hello, World!", execResult)

	// --- Assert: Telegram consumer delivers the message ---

	tgConsumer, err := telegram.NewForTest(redisURL, pool, "test-token", tgSrv.URL)
	require.NoError(t, err)

	err = tgConsumer.ProcessMessage(ctx, lastMsg)
	require.NoError(t, err, "process message via Telegram consumer")

	assert.Equal(t, testChatID, receivedChatID, "telegram chat_id matches")
	assert.Equal(t, "Hello, World!", receivedText, "telegram message content matches")

	t.Logf("✓ Job %q executed end-to-end", "Hello World Daily")
	t.Logf("✓ Notification delivered to Telegram chat %d: %q", receivedChatID, receivedText)
}

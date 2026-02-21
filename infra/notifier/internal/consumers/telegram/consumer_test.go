package telegram_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	telegram "github.com/allerac/notifier/internal/consumers/telegram"
	"github.com/allerac/notifier/internal/publisher"
)

// --- mock DB ---

type mockDB struct {
	chatID int64
	err    error
}

func (m *mockDB) QueryRow(_ context.Context, _ string, _ ...any) pgx.Row {
	return &mockRow{chatID: m.chatID, err: m.err}
}

type mockRow struct {
	chatID int64
	err    error
}

func (r *mockRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	if len(dest) > 0 {
		if p, ok := dest[0].(*int64); ok {
			*p = r.chatID
		}
	}
	return nil
}

// --- helpers ---

func newTestConsumer(t *testing.T, mr *miniredis.Miniredis, db *mockDB, tgBaseURL string) *telegram.Consumer {
	t.Helper()
	c, err := telegram.NewForTest("redis://"+mr.Addr(), db, "test-token", tgBaseURL)
	require.NoError(t, err)
	return c
}

func xMessage(userID, content string) redis.XMessage {
	return redis.XMessage{
		ID: "1-0",
		Values: map[string]interface{}{
			"job_id":  "job-1",
			"user_id": userID,
			"channel": "telegram",
			"content": content,
		},
	}
}

func newRedisClient(mr *miniredis.Miniredis) *redis.Client {
	return redis.NewClient(&redis.Options{Addr: mr.Addr()})
}

// --- ProcessMessage tests ---

func TestConsumer_ProcessMessage_Success(t *testing.T) {
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

	mr := miniredis.RunT(t)
	c := newTestConsumer(t, mr, &mockDB{chatID: 999888777}, tgSrv.URL)

	err := c.ProcessMessage(context.Background(), xMessage("user-1", "Hello, World!"))

	require.NoError(t, err)
	assert.Equal(t, int64(999888777), receivedChatID)
	assert.Equal(t, "Hello, World!", receivedText)
}

func TestConsumer_ProcessMessage_NoChatID(t *testing.T) {
	mr := miniredis.RunT(t)
	c := newTestConsumer(t, mr, &mockDB{err: fmt.Errorf("no rows in result set")}, "http://localhost")

	err := c.ProcessMessage(context.Background(), xMessage("unknown-user", "hi"))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "get chat_id")
}

func TestConsumer_ProcessMessage_TelegramAPIError(t *testing.T) {
	tgSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer tgSrv.Close()

	mr := miniredis.RunT(t)
	c := newTestConsumer(t, mr, &mockDB{chatID: 12345}, tgSrv.URL)

	err := c.ProcessMessage(context.Background(), xMessage("user-1", "hello"))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "401")
}

// --- DLQ tests ---

func TestConsumer_ProcessWithDLQ_SuccessACKsMessage(t *testing.T) {
	tgSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]bool{"ok": true})
	}))
	defer tgSrv.Close()

	mr := miniredis.RunT(t)
	c := newTestConsumer(t, mr, &mockDB{chatID: 111}, tgSrv.URL)
	ctx := context.Background()
	msg := xMessage("user-1", "Hello!")

	c.ProcessWithDLQ(ctx, msg)

	// Attempts counter should be cleaned up after success
	rc := newRedisClient(mr)
	attempts, _ := rc.Get(ctx, "notifications:attempts:"+msg.ID).Int64()
	assert.Equal(t, int64(0), attempts, "attempts key deleted after success")

	// DLQ stream should be empty
	dlqMsgs, _ := rc.XRange(ctx, publisher.DLQStreamName, "-", "+").Result()
	assert.Empty(t, dlqMsgs, "DLQ should be empty on success")
}

func TestConsumer_ProcessWithDLQ_MovesToDLQAfterMaxAttempts(t *testing.T) {
	mr := miniredis.RunT(t)
	// DB always fails → ProcessMessage always returns an error
	c := newTestConsumer(t, mr, &mockDB{err: fmt.Errorf("no chat mapping")}, "http://localhost")
	ctx := context.Background()
	msg := xMessage("bad-user", "Hello!")

	rc := newRedisClient(mr)

	// Simulate maxDeliveryAttempts (3) previous failures already recorded
	rc.Set(ctx, "notifications:attempts:"+msg.ID, 3, 0)

	// This call is attempt 4 → should go to DLQ
	c.ProcessWithDLQ(ctx, msg)

	dlqMsgs, err := rc.XRange(ctx, publisher.DLQStreamName, "-", "+").Result()
	require.NoError(t, err)
	require.Len(t, dlqMsgs, 1, "message should be in DLQ")

	dlq := dlqMsgs[0].Values
	assert.Equal(t, "bad-user", dlq["user_id"])
	assert.Equal(t, msg.ID, dlq["dlq_original_id"])
	assert.Contains(t, dlq["dlq_reason"], "exceeded")
	assert.NotEmpty(t, dlq["dlq_timestamp"])
}

func TestConsumer_ProcessWithDLQ_DoesNotDLQOnFirstFailure(t *testing.T) {
	mr := miniredis.RunT(t)
	c := newTestConsumer(t, mr, &mockDB{err: fmt.Errorf("no chat mapping")}, "http://localhost")
	ctx := context.Background()
	msg := xMessage("bad-user", "Hello!")

	// First attempt — should fail but NOT go to DLQ
	c.ProcessWithDLQ(ctx, msg)

	rc := newRedisClient(mr)
	dlqMsgs, _ := rc.XRange(ctx, publisher.DLQStreamName, "-", "+").Result()
	assert.Empty(t, dlqMsgs, "message should NOT be in DLQ after first failure")

	// Attempts counter should be 1
	attempts, _ := rc.Get(ctx, "notifications:attempts:"+msg.ID).Int64()
	assert.Equal(t, int64(1), attempts)
}

func TestConsumer_ProcessWithDLQ_DLQPreservesOriginalPayload(t *testing.T) {
	mr := miniredis.RunT(t)
	c := newTestConsumer(t, mr, &mockDB{err: fmt.Errorf("error")}, "http://localhost")
	ctx := context.Background()

	msg := redis.XMessage{
		ID: "42-0",
		Values: map[string]interface{}{
			"job_id": "job-xyz", "user_id": "u-1",
			"channel": "telegram", "content": "Important message",
		},
	}

	rc := newRedisClient(mr)
	rc.Set(ctx, "notifications:attempts:"+msg.ID, 3, 0) // trigger DLQ on next call

	c.ProcessWithDLQ(ctx, msg)

	dlqMsgs, _ := rc.XRange(ctx, publisher.DLQStreamName, "-", "+").Result()
	require.Len(t, dlqMsgs, 1)
	assert.Equal(t, "job-xyz", dlqMsgs[0].Values["job_id"])
	assert.Equal(t, "Important message", dlqMsgs[0].Values["content"])
	assert.Equal(t, "42-0", dlqMsgs[0].Values["dlq_original_id"])
}

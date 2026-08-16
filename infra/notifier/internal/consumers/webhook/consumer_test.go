package webhook_test

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

	webhook "github.com/allerac/notifier/internal/consumers/webhook"
	"github.com/allerac/notifier/internal/publisher"
)

// --- mock DB ---

type mockDB struct {
	webhookURL *string
	err        error
}

func (m *mockDB) QueryRow(_ context.Context, _ string, _ ...any) pgx.Row {
	return &mockRow{webhookURL: m.webhookURL, err: m.err}
}

type mockRow struct {
	webhookURL *string
	err        error
}

func (r *mockRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	if len(dest) > 0 {
		if p, ok := dest[0].(**string); ok {
			*p = r.webhookURL
		}
	}
	return nil
}

// --- helpers ---

func newTestConsumer(t *testing.T, mr *miniredis.Miniredis, db *mockDB) *webhook.Consumer {
	t.Helper()
	c, err := webhook.New("redis://"+mr.Addr(), db)
	require.NoError(t, err)
	return c
}

func xMessage(jobID, content string) redis.XMessage {
	return redis.XMessage{
		ID: "1-0",
		Values: map[string]interface{}{
			"job_id":  jobID,
			"user_id": "user-1",
			"channel": "webhook",
			"content": content,
		},
	}
}

func strPtr(s string) *string { return &s }

func newRedisClient(mr *miniredis.Miniredis) *redis.Client {
	return redis.NewClient(&redis.Options{Addr: mr.Addr()})
}

// --- ProcessMessage tests ---

func TestConsumer_ProcessMessage_Success(t *testing.T) {
	var received map[string]interface{}

	whSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&received)
		w.WriteHeader(http.StatusOK)
	}))
	defer whSrv.Close()

	mr := miniredis.RunT(t)
	c := newTestConsumer(t, mr, &mockDB{webhookURL: strPtr(whSrv.URL)})

	err := c.ProcessMessage(context.Background(), xMessage("job-1", "Hello, n8n!"))

	require.NoError(t, err)
	assert.Equal(t, "job-1", received["job_id"])
	assert.Equal(t, "Hello, n8n!", received["content"])
	assert.NotEmpty(t, received["delivered_at"])
}

func TestConsumer_ProcessMessage_NoWebhookURLConfigured(t *testing.T) {
	mr := miniredis.RunT(t)
	c := newTestConsumer(t, mr, &mockDB{webhookURL: nil})

	err := c.ProcessMessage(context.Background(), xMessage("job-1", "hi"))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "no webhook_url configured")
}

func TestConsumer_ProcessMessage_DBError(t *testing.T) {
	mr := miniredis.RunT(t)
	c := newTestConsumer(t, mr, &mockDB{err: fmt.Errorf("no rows in result set")})

	err := c.ProcessMessage(context.Background(), xMessage("missing-job", "hi"))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "get webhook_url")
}

func TestConsumer_ProcessMessage_EndpointError(t *testing.T) {
	whSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer whSrv.Close()

	mr := miniredis.RunT(t)
	c := newTestConsumer(t, mr, &mockDB{webhookURL: strPtr(whSrv.URL)})

	err := c.ProcessMessage(context.Background(), xMessage("job-1", "hi"))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "500")
}

// --- DLQ tests ---

func TestConsumer_ProcessWithDLQ_SuccessACKsMessage(t *testing.T) {
	whSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer whSrv.Close()

	mr := miniredis.RunT(t)
	c := newTestConsumer(t, mr, &mockDB{webhookURL: strPtr(whSrv.URL)})
	ctx := context.Background()
	msg := xMessage("job-1", "Hello!")

	c.ProcessWithDLQ(ctx, msg)

	rc := newRedisClient(mr)
	attempts, _ := rc.Get(ctx, "notifications:webhook-attempts:"+msg.ID).Int64()
	assert.Equal(t, int64(0), attempts, "attempts key deleted after success")

	dlqMsgs, _ := rc.XRange(ctx, publisher.DLQStreamName, "-", "+").Result()
	assert.Empty(t, dlqMsgs, "DLQ should be empty on success")
}

func TestConsumer_ProcessWithDLQ_MovesToDLQAfterMaxAttempts(t *testing.T) {
	mr := miniredis.RunT(t)
	c := newTestConsumer(t, mr, &mockDB{err: fmt.Errorf("no job")})
	ctx := context.Background()
	msg := xMessage("bad-job", "Hello!")

	rc := newRedisClient(mr)
	rc.Set(ctx, "notifications:webhook-attempts:"+msg.ID, 3, 0)

	c.ProcessWithDLQ(ctx, msg)

	dlqMsgs, err := rc.XRange(ctx, publisher.DLQStreamName, "-", "+").Result()
	require.NoError(t, err)
	require.Len(t, dlqMsgs, 1, "message should be in DLQ")

	dlq := dlqMsgs[0].Values
	assert.Equal(t, "bad-job", dlq["job_id"])
	assert.Equal(t, msg.ID, dlq["dlq_original_id"])
	assert.Contains(t, dlq["dlq_reason"], "exceeded")
}

func TestConsumer_ProcessWithDLQ_DoesNotDLQOnFirstFailure(t *testing.T) {
	mr := miniredis.RunT(t)
	c := newTestConsumer(t, mr, &mockDB{err: fmt.Errorf("no job")})
	ctx := context.Background()
	msg := xMessage("bad-job", "Hello!")

	c.ProcessWithDLQ(ctx, msg)

	rc := newRedisClient(mr)
	dlqMsgs, _ := rc.XRange(ctx, publisher.DLQStreamName, "-", "+").Result()
	assert.Empty(t, dlqMsgs, "message should NOT be in DLQ after first failure")

	attempts, _ := rc.Get(ctx, "notifications:webhook-attempts:"+msg.ID).Int64()
	assert.Equal(t, int64(1), attempts)
}

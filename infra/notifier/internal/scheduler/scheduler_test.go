package scheduler_test

import (
	"context"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/allerac/notifier/internal/publisher"
	"github.com/allerac/notifier/internal/scheduler"
)

// --- mocks ---

type mockDB struct {
	execID string
	err    error
}

func (m *mockDB) Query(_ context.Context, _ string, _ ...any) (pgx.Rows, error) {
	return nil, nil
}
func (m *mockDB) QueryRow(_ context.Context, _ string, _ ...any) pgx.Row {
	return &mockRow{id: m.execID, err: m.err}
}
func (m *mockDB) Exec(_ context.Context, _ string, _ ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, m.err
}

type mockRow struct {
	id  string
	err error
}

func (r *mockRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	if len(dest) > 0 {
		if s, ok := dest[0].(*string); ok {
			*s = r.id
		}
	}
	return nil
}

// countingRunner counts how many times Run is called and returns a fixed result/error.
type countingRunner struct {
	calls  atomic.Int32
	result string
	err    error
}

func (m *countingRunner) Run(_ context.Context, _, _ string) (string, error) {
	m.calls.Add(1)
	return m.result, m.err
}

// failThenSucceedRunner fails the first N calls, then succeeds.
type failThenSucceedRunner struct {
	failUntil int
	calls     atomic.Int32
	result    string
}

func (m *failThenSucceedRunner) Run(_ context.Context, _, _ string) (string, error) {
	n := int(m.calls.Add(1))
	if n <= m.failUntil {
		return "", fmt.Errorf("transient error (attempt %d)", n)
	}
	return m.result, nil
}

type mockPublisher struct {
	notifications []publisher.Notification
	err           error
}

func (m *mockPublisher) Publish(_ context.Context, n publisher.Notification) error {
	if m.err != nil {
		return m.err
	}
	m.notifications = append(m.notifications, n)
	return nil
}

func newSched(db *mockDB, run scheduler.Runner, pub *mockPublisher) *scheduler.Scheduler {
	return scheduler.New(db, run, pub).WithRetryDelay(time.Millisecond)
}

func baseJob() scheduler.Job {
	return scheduler.Job{
		ID: "job-1", UserID: "user-1", Name: "Test Job",
		CronExpr: "0 8 * * *", Prompt: "say hello", Channels: []string{"telegram"},
	}
}

// --- tests ---

func TestScheduler_ExecuteJob_Success(t *testing.T) {
	run := &countingRunner{result: "Hello, World!"}
	pub := &mockPublisher{}

	newSched(&mockDB{execID: "exec-1"}, run, pub).ExecuteJob(context.Background(), baseJob())

	assert.Equal(t, int32(1), run.calls.Load(), "runner called once")
	require.Len(t, pub.notifications, 1)
	assert.Equal(t, "Hello, World!", pub.notifications[0].Content)
	assert.Equal(t, "telegram", pub.notifications[0].Channel)
}

func TestScheduler_ExecuteJob_RetriesOnTransientFailure(t *testing.T) {
	// Fails first 2 attempts, succeeds on 3rd
	run := &failThenSucceedRunner{failUntil: 2, result: "Hello after retry!"}
	pub := &mockPublisher{}

	newSched(&mockDB{execID: "exec-2"}, run, pub).ExecuteJob(context.Background(), baseJob())

	assert.Equal(t, int32(3), run.calls.Load(), "runner called 3 times (2 failures + 1 success)")
	require.Len(t, pub.notifications, 1)
	assert.Equal(t, "Hello after retry!", pub.notifications[0].Content)
}

func TestScheduler_ExecuteJob_AllAttemptsExhausted(t *testing.T) {
	run := &countingRunner{err: fmt.Errorf("LLM permanently down")}
	pub := &mockPublisher{}

	newSched(&mockDB{execID: "exec-3"}, run, pub).ExecuteJob(context.Background(), baseJob())

	assert.Equal(t, int32(3), run.calls.Load(), "runner retried 3 times")
	assert.Empty(t, pub.notifications, "no notifications when all attempts fail")
}

func TestScheduler_ExecuteJob_MultipleChannels(t *testing.T) {
	run := &countingRunner{result: "Hello!"}
	pub := &mockPublisher{}
	job := baseJob()
	job.Channels = []string{"telegram", "browser"}

	newSched(&mockDB{execID: "exec-4"}, run, pub).ExecuteJob(context.Background(), job)

	require.Len(t, pub.notifications, 2)
	assert.Equal(t, "telegram", pub.notifications[0].Channel)
	assert.Equal(t, "browser", pub.notifications[1].Channel)
}

func TestScheduler_ExecuteJob_DBCreateExecutionError(t *testing.T) {
	run := &countingRunner{result: "Hello!"}
	pub := &mockPublisher{}

	// DB fails on QueryRow (createExecution)
	newSched(&mockDB{err: fmt.Errorf("db connection refused")}, run, pub).
		ExecuteJob(context.Background(), baseJob())

	assert.Equal(t, int32(0), run.calls.Load(), "runner not called when DB fails")
	assert.Empty(t, pub.notifications)
}

func TestScheduler_RegisterJob_InvalidCronExpr(t *testing.T) {
	sched := scheduler.New(&mockDB{}, &countingRunner{}, &mockPublisher{})
	err := sched.RegisterJob(context.Background(), scheduler.Job{
		ID: "bad", Name: "Bad Cron", CronExpr: "not-a-cron",
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid cron expr")
}

func TestScheduler_ExecuteJob_ContextCancelledDuringRetry(t *testing.T) {
	// Runner always fails; context cancelled mid-retry
	run := &countingRunner{err: fmt.Errorf("always fails")}
	pub := &mockPublisher{}

	ctx, cancel := context.WithCancel(context.Background())

	// Use a real (small) delay so we can cancel during the wait
	sched := scheduler.New(&mockDB{execID: "exec-ctx"}, run, pub).
		WithRetryDelay(50 * time.Millisecond)

	go func() {
		time.Sleep(10 * time.Millisecond)
		cancel()
	}()

	sched.ExecuteJob(ctx, baseJob())

	// At most 2 calls (cancelled during first retry wait)
	assert.LessOrEqual(t, run.calls.Load(), int32(2))
	assert.Empty(t, pub.notifications)
}

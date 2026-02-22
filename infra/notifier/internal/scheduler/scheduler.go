package scheduler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/robfig/cron/v3"

	"github.com/allerac/notifier/internal/publisher"
)

const (
	maxRunnerAttempts  = 3
	defaultRetryDelay  = 5 * time.Second
	watchReconnectWait = 5 * time.Second
)

// DBPool is the subset of pgxpool.Pool used by the Scheduler.
type DBPool interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// Runner executes a prompt for a given user and returns the LLM response.
type Runner interface {
	Run(ctx context.Context, userID, prompt string) (string, error)
}

// NotificationPublisher sends a notification to a delivery channel.
type NotificationPublisher interface {
	Publish(ctx context.Context, n publisher.Notification) error
}

// Job represents a scheduled prompt job.
type Job struct {
	ID       string
	UserID   string
	Name     string
	CronExpr string
	Prompt   string
	Channels []string
}

// Scheduler loads jobs from PostgreSQL and executes them on cron schedule.
type Scheduler struct {
	db         DBPool
	cron       *cron.Cron
	runner     Runner
	publisher  NotificationPublisher
	retryDelay time.Duration

	mu      sync.Mutex
	entries map[string]cron.EntryID // job.ID → cron entry
}

// New creates a Scheduler with default settings.
func New(db DBPool, r Runner, p NotificationPublisher) *Scheduler {
	return &Scheduler{
		db:         db,
		cron:       cron.New(),
		runner:     r,
		publisher:  p,
		retryDelay: defaultRetryDelay,
		entries:    make(map[string]cron.EntryID),
	}
}

// WithRetryDelay overrides the base delay between runner retry attempts.
// Useful in tests to avoid slow retries.
func (s *Scheduler) WithRetryDelay(d time.Duration) *Scheduler {
	s.retryDelay = d
	return s
}

// Start loads all enabled jobs from the database and begins the cron scheduler.
func (s *Scheduler) Start(ctx context.Context) error {
	jobs, err := s.LoadJobs(ctx)
	if err != nil {
		return fmt.Errorf("loading jobs: %w", err)
	}
	for _, job := range jobs {
		if err := s.RegisterJob(ctx, job); err != nil {
			log.Printf("[scheduler] Skipping job %q: %v", job.Name, err)
		}
	}
	s.cron.Start()
	log.Printf("[scheduler] Started with %d jobs", len(jobs))
	return nil
}

// Stop halts the cron scheduler.
func (s *Scheduler) Stop() {
	s.cron.Stop()
}

// RegisterJob adds a single job to the live cron scheduler.
func (s *Scheduler) RegisterJob(_ context.Context, job Job) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.registerLocked(job)
}

func (s *Scheduler) registerLocked(job Job) error {
	entryID, err := s.cron.AddFunc(job.CronExpr, func() {
		s.ExecuteJob(context.Background(), job)
	})
	if err != nil {
		return fmt.Errorf("invalid cron expr %q: %w", job.CronExpr, err)
	}
	s.entries[job.ID] = entryID
	log.Printf("[scheduler] Registered job: %q (%s)", job.Name, job.CronExpr)
	return nil
}

// LoadJobs fetches all enabled jobs from the database.
func (s *Scheduler) LoadJobs(ctx context.Context) ([]Job, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, user_id, name, cron_expr, prompt, channels
		FROM scheduled_jobs
		WHERE enabled = true
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []Job
	for rows.Next() {
		var j Job
		if err := rows.Scan(&j.ID, &j.UserID, &j.Name, &j.CronExpr, &j.Prompt, &j.Channels); err != nil {
			return nil, err
		}
		jobs = append(jobs, j)
	}
	return jobs, rows.Err()
}

// loadJob fetches a single enabled job by ID. Returns nil if not found or disabled.
func (s *Scheduler) loadJob(ctx context.Context, jobID string) (*Job, error) {
	var j Job
	err := s.db.QueryRow(ctx, `
		SELECT id, user_id, name, cron_expr, prompt, channels
		FROM scheduled_jobs
		WHERE id = $1 AND enabled = true
	`, jobID).Scan(&j.ID, &j.UserID, &j.Name, &j.CronExpr, &j.Prompt, &j.Channels)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // disabled or deleted
		}
		return nil, err
	}
	return &j, nil
}

// SyncJob live-reloads a single job in response to a NOTIFY from PostgreSQL.
// action is "insert", "update", or "delete".
func (s *Scheduler) SyncJob(ctx context.Context, jobID, action string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Always remove any existing cron entry for this job.
	if entryID, ok := s.entries[jobID]; ok {
		s.cron.Remove(entryID)
		delete(s.entries, jobID)
	}

	if action == "delete" {
		log.Printf("[scheduler] Job %s removed (deleted)", jobID)
		return
	}

	// Fetch fresh state from DB (returns nil if disabled or not found).
	job, err := s.loadJob(ctx, jobID)
	if err != nil {
		log.Printf("[scheduler] Failed to reload job %s: %v", jobID, err)
		return
	}
	if job == nil {
		log.Printf("[scheduler] Job %s not scheduled (disabled or not found)", jobID)
		return
	}

	if err := s.registerLocked(*job); err != nil {
		log.Printf("[scheduler] Failed to re-register job %q: %v", job.Name, err)
		return
	}
	log.Printf("[scheduler] Live-reloaded job %q (%s)", job.Name, job.CronExpr)
}

// Watch listens for PostgreSQL NOTIFY on the 'scheduled_jobs_changed' channel
// and calls SyncJob on every notification. It reconnects automatically on
// connection loss until ctx is cancelled.
func (s *Scheduler) Watch(ctx context.Context, dbURL string) {
	for {
		if err := s.watch(ctx, dbURL); err != nil {
			if ctx.Err() != nil {
				return // context cancelled — clean shutdown
			}
			log.Printf("[scheduler] LISTEN connection lost: %v — reconnecting in %s",
				err, watchReconnectWait)
			select {
			case <-ctx.Done():
				return
			case <-time.After(watchReconnectWait):
			}
		}
	}
}

// watch opens a dedicated connection, issues LISTEN, and blocks until an
// error or context cancellation. Exported for testing.
func (s *Scheduler) watch(ctx context.Context, dbURL string) error {
	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer conn.Close(ctx)

	if _, err := conn.Exec(ctx, "LISTEN scheduled_jobs_changed"); err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	log.Printf("[scheduler] Watching for job changes via LISTEN/NOTIFY")

	for {
		notification, err := conn.WaitForNotification(ctx)
		if err != nil {
			return err
		}

		var payload struct {
			Action string `json:"action"`
			JobID  string `json:"job_id"`
		}
		if err := json.Unmarshal([]byte(notification.Payload), &payload); err != nil {
			log.Printf("[scheduler] Invalid notification payload %q: %v", notification.Payload, err)
			continue
		}

		log.Printf("[scheduler] NOTIFY received: action=%s job_id=%s", payload.Action, payload.JobID)
		s.SyncJob(ctx, payload.JobID, payload.Action)
	}
}

// ExecuteJob runs a job: calls the LLM (with retries), records the execution,
// and publishes notifications to all configured channels.
// Exported so it can be triggered directly in tests and one-off scenarios.
func (s *Scheduler) ExecuteJob(ctx context.Context, job Job) {
	log.Printf("[scheduler] Executing job: %q", job.Name)

	execID, err := s.createExecution(ctx, job.ID)
	if err != nil {
		log.Printf("[scheduler] Failed to create execution record for job %s: %v", job.ID, err)
		return
	}

	result, err := s.runWithRetry(ctx, job)
	if err != nil {
		log.Printf("[scheduler] Job %q failed after %d attempts: %v", job.Name, maxRunnerAttempts, err)
		_ = s.updateExecution(ctx, execID, "failed", err.Error())
		return
	}

	_ = s.updateExecution(ctx, execID, "completed", result)

	for _, channel := range job.Channels {
		if err := s.publisher.Publish(ctx, publisher.Notification{
			JobID:   job.ID,
			UserID:  job.UserID,
			Channel: channel,
			Content: result,
		}); err != nil {
			log.Printf("[scheduler] Failed to publish to channel %q: %v", channel, err)
		}
	}
}

// runWithRetry calls the runner up to maxRunnerAttempts times with exponential backoff.
// Delays: 1×retryDelay, 2×retryDelay, … (capped at maxRunnerAttempts-1 waits).
func (s *Scheduler) runWithRetry(ctx context.Context, job Job) (string, error) {
	var lastErr error
	for attempt := 1; attempt <= maxRunnerAttempts; attempt++ {
		result, err := s.runner.Run(ctx, job.UserID, job.Prompt)
		if err == nil {
			if attempt > 1 {
				log.Printf("[scheduler] Job %q succeeded on attempt %d/%d", job.Name, attempt, maxRunnerAttempts)
			}
			return result, nil
		}
		lastErr = err

		if attempt < maxRunnerAttempts {
			delay := s.retryDelay * time.Duration(attempt)
			log.Printf("[scheduler] Job %q attempt %d/%d failed: %v — retrying in %s",
				job.Name, attempt, maxRunnerAttempts, err, delay)
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(delay):
			}
		}
	}
	return "", fmt.Errorf("all %d attempts failed, last: %w", maxRunnerAttempts, lastErr)
}

func (s *Scheduler) createExecution(ctx context.Context, jobID string) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `
		INSERT INTO job_executions (job_id, status, started_at)
		VALUES ($1, 'running', $2)
		RETURNING id
	`, jobID, time.Now()).Scan(&id)
	return id, err
}

func (s *Scheduler) updateExecution(ctx context.Context, execID, status, result string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE job_executions
		SET status = $1, result = $2, completed_at = $3
		WHERE id = $4
	`, status, result, time.Now(), execID)
	if err != nil {
		log.Printf("[scheduler] Failed to update execution %s: %v", execID, err)
		return err
	}
	if status == "completed" {
		_, err = s.db.Exec(ctx, `
			UPDATE scheduled_jobs
			SET last_run_at = $1
			WHERE id = (SELECT job_id FROM job_executions WHERE id = $2)
		`, time.Now(), execID)
		if err != nil {
			log.Printf("[scheduler] Failed to update last_run_at: %v", err)
		}
	}
	return nil
}

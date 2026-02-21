package scheduler

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/robfig/cron/v3"

	"github.com/allerac/notifier/internal/publisher"
)

const (
	maxRunnerAttempts = 3
	defaultRetryDelay = 5 * time.Second
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
	db          DBPool
	cron        *cron.Cron
	runner      Runner
	publisher   NotificationPublisher
	retryDelay  time.Duration
}

// New creates a Scheduler with default settings.
func New(db DBPool, r Runner, p NotificationPublisher) *Scheduler {
	return &Scheduler{
		db:         db,
		cron:       cron.New(),
		runner:     r,
		publisher:  p,
		retryDelay: defaultRetryDelay,
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
	_, err := s.cron.AddFunc(job.CronExpr, func() {
		s.ExecuteJob(context.Background(), job)
	})
	if err != nil {
		return fmt.Errorf("invalid cron expr %q: %w", job.CronExpr, err)
	}
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

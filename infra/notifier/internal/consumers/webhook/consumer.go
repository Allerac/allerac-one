// Package webhook delivers job execution results to an outbound webhook URL
// (e.g. an n8n Webhook Trigger) configured per-job in scheduled_jobs.webhook_url.
// See docs/roadmap/n8n-workflow-integration.md.
package webhook

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"

	"github.com/allerac/notifier/internal/publisher"
)

const (
	consumerGroup        = "webhook-group"
	consumerName         = "notifier-consumer-1"
	maxDeliveryAttempts  = 3
	reclaimInterval      = time.Minute
	minIdleBeforeReclaim = 5 * time.Minute
)

// DBPool is the subset of pgxpool.Pool used by the Consumer.
type DBPool interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Consumer reads notifications from the Redis Stream and delivers them via HTTP POST
// to the target job's configured webhook_url.
type Consumer struct {
	redis      *redis.Client
	db         DBPool
	httpClient *http.Client
}

// New creates a Consumer.
func New(redisURL string, db DBPool) (*Consumer, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	return &Consumer{
		redis:      redis.NewClient(opts),
		db:         db,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}, nil
}

// Start creates the consumer group (if needed) and begins consuming in background goroutines.
func (c *Consumer) Start(ctx context.Context) error {
	err := c.redis.XGroupCreateMkStream(ctx, publisher.StreamName, consumerGroup, "$").Err()
	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		return fmt.Errorf("create consumer group: %w", err)
	}
	log.Printf("[webhook-consumer] Started, listening on stream %q", publisher.StreamName)
	go c.consume(ctx)
	go c.reclaimLoop(ctx)
	return nil
}

func (c *Consumer) consume(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		msgs, err := c.redis.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    consumerGroup,
			Consumer: consumerName,
			Streams:  []string{publisher.StreamName, ">"},
			Count:    10,
			Block:    5 * time.Second,
		}).Result()

		if err != nil {
			if err != redis.Nil && ctx.Err() == nil {
				log.Printf("[webhook-consumer] Read error: %v", err)
				time.Sleep(time.Second)
			}
			continue
		}

		for _, stream := range msgs {
			for _, msg := range stream.Messages {
				channel, _ := msg.Values["channel"].(string)
				if channel != "webhook" {
					c.redis.XAck(ctx, publisher.StreamName, consumerGroup, msg.ID)
					continue
				}
				c.ProcessWithDLQ(ctx, msg)
			}
		}
	}
}

func (c *Consumer) reclaimLoop(ctx context.Context) {
	ticker := time.NewTicker(reclaimInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.reclaimStuck(ctx)
		}
	}
}

func (c *Consumer) reclaimStuck(ctx context.Context) {
	msgs, _, err := c.redis.XAutoClaim(ctx, &redis.XAutoClaimArgs{
		Stream:   publisher.StreamName,
		Group:    consumerGroup,
		Consumer: consumerName,
		MinIdle:  minIdleBeforeReclaim,
		Start:    "0-0",
		Count:    100,
	}).Result()
	if err != nil {
		log.Printf("[webhook-consumer] XAutoClaim error: %v", err)
		return
	}
	if len(msgs) > 0 {
		log.Printf("[webhook-consumer] Reclaimed %d stuck message(s) from PEL", len(msgs))
		for _, msg := range msgs {
			c.ProcessWithDLQ(ctx, msg)
		}
	}
}

// ProcessWithDLQ wraps ProcessMessage with attempt tracking and dead-letter routing.
func (c *Consumer) ProcessWithDLQ(ctx context.Context, msg redis.XMessage) {
	attemptsKey := "notifications:webhook-attempts:" + msg.ID
	attempts, _ := c.redis.Incr(ctx, attemptsKey).Result()
	c.redis.Expire(ctx, attemptsKey, 24*time.Hour)

	if attempts > maxDeliveryAttempts {
		reason := fmt.Sprintf("exceeded %d delivery attempts", maxDeliveryAttempts)
		log.Printf("[webhook-consumer] Message %s → DLQ: %s", msg.ID, reason)
		c.moveToDLQ(ctx, msg, reason)
		c.redis.Del(ctx, attemptsKey)
		c.redis.XAck(ctx, publisher.StreamName, consumerGroup, msg.ID)
		return
	}

	if err := c.ProcessMessage(ctx, msg); err != nil {
		log.Printf("[webhook-consumer] Attempt %d/%d for message %s failed: %v",
			attempts, maxDeliveryAttempts, msg.ID, err)
		// Do NOT ACK — reclaimLoop will reclaim after minIdleBeforeReclaim
		return
	}

	c.redis.Del(ctx, attemptsKey)
	c.redis.XAck(ctx, publisher.StreamName, consumerGroup, msg.ID)
}

// ProcessMessage delivers a single stream message via HTTP POST to the job's
// configured webhook_url. Exported for testing.
func (c *Consumer) ProcessMessage(ctx context.Context, msg redis.XMessage) error {
	jobID, _ := msg.Values["job_id"].(string)
	content, _ := msg.Values["content"].(string)

	url, err := c.getWebhookURL(ctx, jobID)
	if err != nil {
		return fmt.Errorf("get webhook_url for job %s: %w", jobID, err)
	}
	if url == "" {
		return fmt.Errorf("job %s has no webhook_url configured", jobID)
	}

	log.Printf("[webhook-consumer] Delivering job %s to %s", jobID, url)
	return c.postWebhook(url, jobID, content)
}

func (c *Consumer) moveToDLQ(ctx context.Context, msg redis.XMessage, reason string) {
	values := make(map[string]interface{}, len(msg.Values)+4)
	for k, v := range msg.Values {
		values[k] = v
	}
	values["dlq_reason"] = reason
	values["dlq_original_id"] = msg.ID
	values["dlq_consumer_group"] = consumerGroup
	values["dlq_timestamp"] = time.Now().UTC().Format(time.RFC3339)

	if err := c.redis.XAdd(ctx, &redis.XAddArgs{
		Stream: publisher.DLQStreamName,
		MaxLen: 10000,
		Approx: true,
		Values: values,
	}).Err(); err != nil {
		log.Printf("[webhook-consumer] Failed to write message %s to DLQ: %v", msg.ID, err)
	}
}

func (c *Consumer) getWebhookURL(ctx context.Context, jobID string) (string, error) {
	var url *string
	err := c.db.QueryRow(ctx, `
		SELECT webhook_url FROM scheduled_jobs WHERE id = $1
	`, jobID).Scan(&url)
	if err != nil {
		return "", err
	}
	if url == nil {
		return "", nil
	}
	return *url, nil
}

func (c *Consumer) postWebhook(url, jobID, content string) error {
	payload := map[string]interface{}{
		"job_id":       jobID,
		"content":      content,
		"delivered_at": time.Now().UTC().Format(time.RFC3339),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	resp, err := c.httpClient.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("webhook request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("webhook endpoint returned %d", resp.StatusCode)
	}
	return nil
}

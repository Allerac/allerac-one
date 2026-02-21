package telegram

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
	consumerGroup       = "telegram-group"
	consumerName        = "notifier-consumer-1"
	maxDeliveryAttempts = 3
	reclaimInterval     = time.Minute
	minIdleBeforeReclaim = 5 * time.Minute
)

// DBPool is the subset of pgxpool.Pool used by the Consumer.
type DBPool interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Consumer reads notifications from the Redis Stream and delivers them via Telegram.
type Consumer struct {
	redis           *redis.Client
	db              DBPool
	botToken        string
	telegramBaseURL string
	httpClient      *http.Client
}

// New creates a Consumer using the production Telegram API.
func New(redisURL string, db DBPool, botToken string) (*Consumer, error) {
	return newConsumer(redisURL, db, botToken, "https://api.telegram.org")
}

// NewForTest creates a Consumer with a custom Telegram API base URL, useful in tests.
func NewForTest(redisURL string, db DBPool, botToken, telegramBaseURL string) (*Consumer, error) {
	return newConsumer(redisURL, db, botToken, telegramBaseURL)
}

func newConsumer(redisURL string, db DBPool, botToken, telegramBaseURL string) (*Consumer, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	return &Consumer{
		redis:           redis.NewClient(opts),
		db:              db,
		botToken:        botToken,
		telegramBaseURL: telegramBaseURL,
		httpClient:      &http.Client{Timeout: 10 * time.Second},
	}, nil
}

// Start creates the consumer group (if needed) and begins consuming in background goroutines.
func (c *Consumer) Start(ctx context.Context) error {
	err := c.redis.XGroupCreateMkStream(ctx, publisher.StreamName, consumerGroup, "$").Err()
	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		return fmt.Errorf("create consumer group: %w", err)
	}
	log.Printf("[telegram-consumer] Started, listening on stream %q", publisher.StreamName)
	go c.consume(ctx)
	go c.reclaimLoop(ctx)
	return nil
}

// consume reads new messages from the stream in a loop.
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
				log.Printf("[telegram-consumer] Read error: %v", err)
				time.Sleep(time.Second)
			}
			continue
		}

		for _, stream := range msgs {
			for _, msg := range stream.Messages {
				channel, _ := msg.Values["channel"].(string)
				if channel != "telegram" {
					c.redis.XAck(ctx, publisher.StreamName, consumerGroup, msg.ID)
					continue
				}
				c.ProcessWithDLQ(ctx, msg)
			}
		}
	}
}

// reclaimLoop periodically reclaims messages that have been stuck in the PEL
// (read but never acknowledged) longer than minIdleBeforeReclaim.
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
		log.Printf("[telegram-consumer] XAutoClaim error: %v", err)
		return
	}
	if len(msgs) > 0 {
		log.Printf("[telegram-consumer] Reclaimed %d stuck message(s) from PEL", len(msgs))
		for _, msg := range msgs {
			c.ProcessWithDLQ(ctx, msg)
		}
	}
}

// ProcessWithDLQ wraps ProcessMessage with attempt tracking and dead-letter routing.
// On success it ACKs the message. On repeated failure it moves it to the DLQ.
// Exported so it can be called directly in tests.
func (c *Consumer) ProcessWithDLQ(ctx context.Context, msg redis.XMessage) {
	attemptsKey := "notifications:attempts:" + msg.ID
	attempts, _ := c.redis.Incr(ctx, attemptsKey).Result()
	c.redis.Expire(ctx, attemptsKey, 24*time.Hour)

	if attempts > maxDeliveryAttempts {
		reason := fmt.Sprintf("exceeded %d delivery attempts", maxDeliveryAttempts)
		log.Printf("[telegram-consumer] Message %s → DLQ: %s", msg.ID, reason)
		c.moveToDLQ(ctx, msg, reason)
		c.redis.Del(ctx, attemptsKey)
		c.redis.XAck(ctx, publisher.StreamName, consumerGroup, msg.ID)
		return
	}

	if err := c.ProcessMessage(ctx, msg); err != nil {
		log.Printf("[telegram-consumer] Attempt %d/%d for message %s failed: %v",
			attempts, maxDeliveryAttempts, msg.ID, err)
		// Do NOT ACK — reclaimLoop will reclaim after minIdleBeforeReclaim
		return
	}

	c.redis.Del(ctx, attemptsKey)
	c.redis.XAck(ctx, publisher.StreamName, consumerGroup, msg.ID)
}

// ProcessMessage delivers a single stream message via Telegram. Exported for testing.
func (c *Consumer) ProcessMessage(ctx context.Context, msg redis.XMessage) error {
	userID, _ := msg.Values["user_id"].(string)
	content, _ := msg.Values["content"].(string)

	chatID, err := c.getChatID(ctx, userID)
	if err != nil {
		return fmt.Errorf("get chat_id for user %s: %w", userID, err)
	}

	return c.sendMessage(chatID, content)
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
		log.Printf("[telegram-consumer] Failed to write message %s to DLQ: %v", msg.ID, err)
	}
}

func (c *Consumer) getChatID(ctx context.Context, userID string) (int64, error) {
	var chatID int64
	err := c.db.QueryRow(ctx, `
		SELECT telegram_chat_id FROM telegram_chat_mapping
		WHERE user_id = $1
		LIMIT 1
	`, userID).Scan(&chatID)
	return chatID, err
}

func (c *Consumer) sendMessage(chatID int64, text string) error {
	payload := map[string]interface{}{
		"chat_id": chatID,
		"text":    text,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/bot%s/sendMessage", c.telegramBaseURL, c.botToken)
	resp, err := c.httpClient.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("telegram request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram API returned %d", resp.StatusCode)
	}
	return nil
}

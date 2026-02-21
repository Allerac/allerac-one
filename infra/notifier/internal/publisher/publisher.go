package publisher

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

// StreamName is the Redis Stream used for all notifications.
const StreamName = "notifications"

// DLQStreamName is the dead-letter stream for messages that exceeded delivery attempts.
const DLQStreamName = "notifications:dead"

// Notification is a message to be delivered to a channel.
type Notification struct {
	JobID   string
	UserID  string
	Channel string
	Content string
}

// Publisher writes notifications to a Redis Stream.
type Publisher struct {
	client *redis.Client
}

// New creates a Publisher connected to the given Redis URL.
func New(redisURL string) (*Publisher, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	return &Publisher{client: redis.NewClient(opts)}, nil
}

// NewFromClient creates a Publisher from an existing Redis client (useful for testing).
func NewFromClient(client *redis.Client) *Publisher {
	return &Publisher{client: client}
}

// Publish writes a notification to the Redis Stream.
func (p *Publisher) Publish(ctx context.Context, n Notification) error {
	return p.client.XAdd(ctx, &redis.XAddArgs{
		Stream: StreamName,
		Values: map[string]interface{}{
			"job_id":  n.JobID,
			"user_id": n.UserID,
			"channel": n.Channel,
			"content": n.Content,
		},
	}).Err()
}

// Close releases the Redis connection.
func (p *Publisher) Close() error {
	return p.client.Close()
}

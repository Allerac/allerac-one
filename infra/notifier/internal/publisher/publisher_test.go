package publisher_test

import (
	"context"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/allerac/notifier/internal/publisher"
)

func newTestPublisher(t *testing.T) (*publisher.Publisher, *redis.Client, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	pub := publisher.NewFromClient(client)
	return pub, client, mr
}

func TestPublisher_Publish_WritesToStream(t *testing.T) {
	pub, client, _ := newTestPublisher(t)
	ctx := context.Background()

	n := publisher.Notification{
		JobID:   "job-1",
		UserID:  "user-1",
		Channel: "telegram",
		Content: "Hello, World!",
	}

	err := pub.Publish(ctx, n)
	require.NoError(t, err)

	msgs, err := client.XRange(ctx, publisher.StreamName, "-", "+").Result()
	require.NoError(t, err)
	require.Len(t, msgs, 1)

	got := msgs[0].Values
	assert.Equal(t, "job-1", got["job_id"])
	assert.Equal(t, "user-1", got["user_id"])
	assert.Equal(t, "telegram", got["channel"])
	assert.Equal(t, "Hello, World!", got["content"])
}

func TestPublisher_Publish_MultipleNotifications(t *testing.T) {
	pub, client, _ := newTestPublisher(t)
	ctx := context.Background()

	notifications := []publisher.Notification{
		{JobID: "job-1", UserID: "user-1", Channel: "telegram", Content: "First"},
		{JobID: "job-1", UserID: "user-1", Channel: "browser", Content: "First"},
		{JobID: "job-2", UserID: "user-2", Channel: "telegram", Content: "Second"},
	}

	for _, n := range notifications {
		require.NoError(t, pub.Publish(ctx, n))
	}

	msgs, err := client.XRange(ctx, publisher.StreamName, "-", "+").Result()
	require.NoError(t, err)
	assert.Len(t, msgs, 3)
}

func TestPublisher_Publish_RedisDown(t *testing.T) {
	mr := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	pub := publisher.NewFromClient(client)

	mr.Close() // shut down Redis

	err := pub.Publish(context.Background(), publisher.Notification{
		JobID: "job-1", UserID: "user-1", Channel: "telegram", Content: "hi",
	})
	require.Error(t, err)
}

package runner_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/allerac/notifier/internal/runner"
)

func TestRunner_Run_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/chat", r.URL.Path)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(runner.ChatResponse{
			Message: runner.ChatMsg{Role: "assistant", Content: "Hello, World!"},
		})
	}))
	defer srv.Close()

	r := runner.New(srv.URL, "test-model")
	result, err := r.Run(context.Background(), "user-1", "Say hello world")

	require.NoError(t, err)
	assert.Equal(t, "Hello, World!", result)
}

func TestRunner_Run_LLMError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(runner.ChatResponse{
			Error: "model not found",
		})
	}))
	defer srv.Close()

	r := runner.New(srv.URL, "nonexistent-model")
	_, err := r.Run(context.Background(), "user-1", "hello")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "model not found")
}

func TestRunner_Run_ServerUnavailable(t *testing.T) {
	r := runner.New("http://127.0.0.1:1", "test-model")
	_, err := r.Run(context.Background(), "user-1", "hello")
	require.Error(t, err)
}

func TestRunner_Run_SendsPromptInRequest(t *testing.T) {
	const wantPrompt = "What is the capital of France?"

	var gotPrompt string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Messages []runner.ChatMsg `json:"messages"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		if len(req.Messages) > 0 {
			gotPrompt = req.Messages[0].Content
		}
		json.NewEncoder(w).Encode(runner.ChatResponse{
			Message: runner.ChatMsg{Role: "assistant", Content: "Paris"},
		})
	}))
	defer srv.Close()

	r := runner.New(srv.URL, "test-model")
	_, err := r.Run(context.Background(), "user-1", wantPrompt)

	require.NoError(t, err)
	assert.Equal(t, wantPrompt, gotPrompt)
}

package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// ChatMsg is a single message in a chat request/response.
type ChatMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ChatResponse is the response from the Ollama chat endpoint.
type ChatResponse struct {
	Message ChatMsg `json:"message"`
	Error   string  `json:"error"`
}

type chatRequest struct {
	Model    string    `json:"model"`
	Messages []ChatMsg `json:"messages"`
	Stream   bool      `json:"stream"`
}

// Runner executes prompts against an Ollama-compatible LLM API.
type Runner struct {
	baseURL string
	model   string
	client  *http.Client
}

// New creates a Runner pointing at the given Ollama base URL.
func New(baseURL, model string) *Runner {
	return &Runner{
		baseURL: baseURL,
		model:   model,
		client:  &http.Client{Timeout: 120 * time.Second},
	}
}

// Run sends a prompt to the LLM and returns the response text.
// userID is passed for context but not used in the HTTP request (future: per-user model selection).
func (r *Runner) Run(ctx context.Context, _ string, prompt string) (string, error) {
	body, err := json.Marshal(chatRequest{
		Model:    r.model,
		Messages: []ChatMsg{{Role: "user", Content: prompt}},
		Stream:   false,
	})
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.baseURL+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	var result ChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}
	if result.Error != "" {
		return "", fmt.Errorf("llm error: %s", result.Error)
	}
	return result.Message.Content, nil
}

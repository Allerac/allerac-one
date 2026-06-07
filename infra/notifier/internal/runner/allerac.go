package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// AlleracRunner calls the Allerac /api/jobs/run endpoint, giving scheduled jobs
// access to the full chat pipeline (tools, skills, memory).
type AlleracRunner struct {
	appURL string
	secret string
	client *http.Client
}

// NewAllerac creates an AlleracRunner pointing at the given app base URL.
func NewAllerac(appURL, secret string) *AlleracRunner {
	return &AlleracRunner{
		appURL: appURL,
		secret: secret,
		client: &http.Client{Timeout: 120 * time.Second},
	}
}

// Run sends the job prompt to /api/jobs/run and returns the text response.
func (r *AlleracRunner) Run(ctx context.Context, userID, jobID, prompt string) (string, error) {
	body, err := json.Marshal(map[string]string{
		"jobId":  jobID,
		"userId": userID,
		"prompt": prompt,
	})
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.appURL+"/api/jobs/run", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+r.secret)

	resp, err := r.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Result string `json:"result"`
		Error  string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("allerac runner error (%d): %s", resp.StatusCode, result.Error)
	}
	return result.Result, nil
}

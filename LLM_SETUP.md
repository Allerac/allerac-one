# LLM Provider Setup Guide

## Overview

Allerac-One supports two LLM providers:
1. **GitHub Models** - Cloud-based, free during preview
2. **Ollama** - Local LLMs running on your machine

## GitHub Models Setup

### 1. Get GitHub Token

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Give it a name like "Allerac-One"
4. No specific scopes needed - just basic access
5. Copy the token

### 2. Configure Environment

```bash
LLM_PROVIDER=github
GITHUB_TOKEN=github_pat_xxxxxxxxxxxxx
GITHUB_MODEL=gpt-4o
```

### 3. Available Models

- `gpt-4o` - Most capable, best for complex tasks
- `gpt-4o-mini` - Fast and efficient, good for most tasks
- `o1-preview` - Best reasoning, slower
- `o1-mini` - Fast reasoning

### 4. Rate Limits

GitHub Models has rate limits during preview:
- 15 requests/minute for GPT-4o
- 15 requests/minute for GPT-4o-mini
- 10 requests/minute for o1 models

## Ollama Setup

### 1. Install Ollama

Download from [ollama.ai](https://ollama.ai) and install for your platform.

### 2. Pull Models

```bash
# Recommended models:
ollama pull llama3.2        # Meta's latest, great all-around
ollama pull mistral         # Fast and efficient
ollama pull phi3            # Microsoft's small but capable
ollama pull codellama       # Specialized for coding

# Check available models:
ollama list
```

### 3. Configure Environment

```bash
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

### 4. Start Ollama

Ollama runs as a background service after installation. To verify:

```bash
ollama serve  # If not running
curl http://localhost:11434  # Should return "Ollama is running"
```

### 5. Model Selection

| Model | Size | Best For | Speed |
|-------|------|----------|-------|
| llama3.2 | 2-90B | General tasks | Medium-Fast |
| mistral | 7B | Fast responses | Very Fast |
| phi3 | 3.8B | Quick tasks | Very Fast |
| codellama | 7-34B | Code generation | Medium |
| qwen2.5 | 7-72B | Multilingual | Medium |

## Comparing Providers

| Feature | GitHub Models | Ollama |
|---------|--------------|--------|
| **Cost** | Free (preview) | Free (always) |
| **Speed** | Fast | Depends on hardware |
| **Privacy** | Data sent to cloud | 100% local |
| **Setup** | Just a token | Install + download models |
| **Models** | GPT-4o, o1 series | Llama, Mistral, Phi, etc. |
| **Internet** | Required | Not required |
| **Rate Limits** | Yes | No |

## Switching Between Providers

Simply update your `.env.local` and restart the dev server:

```bash
# Switch to GitHub
LLM_PROVIDER=github

# Switch to Ollama
LLM_PROVIDER=ollama
```

No code changes needed!

## Troubleshooting

### GitHub Models

**Error: "Rate limit exceeded"**
- Wait the specified time before trying again
- Switch to Ollama for unlimited requests
- Use gpt-4o-mini which has the same limit but is faster

**Error: "Invalid token"**
- Regenerate your GitHub token
- Make sure it's not expired
- Check there are no extra spaces

### Ollama

**Error: "Connection refused"**
- Check Ollama is running: `ollama serve`
- Verify the URL in .env.local
- Check firewall isn't blocking port 11434

**Error: "Model not found"**
- Pull the model: `ollama pull llama3.2`
- Check model name matches in .env.local
- List models: `ollama list`

**Slow responses**
- Use a smaller model (mistral, phi3)
- Check system resources (CPU/RAM/GPU)
- Reduce max_tokens in requests

## Performance Tips

### GitHub Models
- Use gpt-4o-mini for faster responses
- Implement caching for repeated queries
- Batch similar requests

### Ollama
- Use GPU acceleration if available
- Choose model size based on hardware:
  - 8GB RAM: phi3, mistral 7B
  - 16GB RAM: llama3.2 7B, codellama 7B
  - 32GB+ RAM: llama3.2 70B, larger models
- Keep frequently-used models pulled

## Best Practices

1. **Start with GitHub Models** - Easy setup, test your app
2. **Switch to Ollama** - When you need privacy or unlimited requests
3. **Use Environment Variables** - Easy to switch without code changes
4. **Monitor Metrics** - Check response times and token usage
5. **Choose Right Model** - Balance capability vs speed/cost

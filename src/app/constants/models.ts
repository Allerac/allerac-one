// AI Model constants - shared between client and server

// Available GitHub Models
export const GITHUB_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o', icon: '🤖', description: 'Most capable model' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', icon: '⚡', description: 'Faster and efficient' },
  { id: 'mistral-large-2411', name: 'Mistral Large', icon: '🌊', description: 'Mistral flagship' },
  { id: 'ministral-3b', name: 'Ministral 3B', icon: '💨', description: 'Edge-optimized' },
];

// Available Ollama Models (that we support)
export const SUPPORTED_OLLAMA_MODELS = [
  { id: 'qwen2.5:3b', name: 'Qwen 2.5 3B', icon: '🐼', description: 'Fast & efficient (4GB RAM)', size: '2 GB' },
  { id: 'qwen2.5:7b', name: 'Qwen 2.5 7B', icon: '🐼', description: 'Best quality (8GB RAM)', size: '4.7 GB' },
  { id: 'deepseek-r1:1.5b', name: 'DeepSeek R1 1.5B', icon: '🧠', description: 'Fast & light (CPU-friendly)', size: '1.1 GB' },
  { id: 'minimax-m2.5:cloud', name: 'MiniMax M2.5', icon: '☁️', description: 'Cloud model (requires cloud setup)', size: 'N/A' },
];

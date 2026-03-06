// AI Model constants - shared between client and server

// Available GitHub Models
export const GITHUB_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o', icon: '🤖', description: 'Most capable model' },
  { id: 'ministral-3b', name: 'Ministral 3B', icon: '💨', description: 'Edge-optimized, fast' },
];

// Available Ollama Models (that we support)
export const SUPPORTED_OLLAMA_MODELS = [
  { id: 'qwen3.5:2b', name: 'Qwen 3.5 2B', icon: '🐼', description: 'Fast, balanced quality', size: '2.7 GB' },
  { id: 'qwen3.5:0.8b', name: 'Qwen 3.5 0.8B', icon: '🐼', description: 'Ultra-lightweight, maximum speed', size: '1.0 GB' },
];

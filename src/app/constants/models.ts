// AI Model constants - shared between client and server

// Available GitHub Models
export const GITHUB_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o', icon: '🤖', description: 'Most capable model' },
  { id: 'ministral-3b', name: 'Ministral 3B', icon: '💨', description: 'Edge-optimized, fast' },
];

// Available Ollama Models (that we support)
export const SUPPORTED_OLLAMA_MODELS = [
  { id: 'qwen2.5:3b', name: 'Qwen 2.5 3B', icon: '🐼', description: 'Fast & efficient', size: '2 GB' },
  { id: 'deepseek-r1:1.5b', name: 'DeepSeek R1 1.5B', icon: '🧠', description: 'Reasoning model with thinking', size: '1.1 GB' },
  { id: 'deepseek-r1:7b', name: 'DeepSeek R1 7B', icon: '🧠', description: 'Reasoning model with thinking', size: '4.7 GB' },
];

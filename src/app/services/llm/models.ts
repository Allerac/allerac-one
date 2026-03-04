// AI Model configurations
import { Model } from '../../types';

export const MODELS: Model[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    icon: '🤖',
    description: 'Most capable model, best for complex tasks',
    provider: 'github',
    baseUrl: 'https://models.inference.ai.azure.com',
    requiresToken: true
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    icon: '⚡',
    description: 'Faster and more cost-effective',
    provider: 'github',
    baseUrl: 'https://models.inference.ai.azure.com',
    requiresToken: true
  },
  // {
  //   id: 'claude-3-5-sonnet',
  //   name: 'Claude 3.5 Sonnet',
  //   icon: '🎭',
  //   description: 'Anthropic\'s most capable model',
  //   provider: 'github',
  //   baseUrl: 'https://models.inference.ai.azure.com',
  //   requiresToken: true
  // },
  // {
  //   id: 'llama-3.3-70b-instruct',
  //   name: 'Llama 3.3 70B',
  //   icon: '🦙',
  //   description: 'Meta\'s latest open model',
  //   provider: 'github',
  //   baseUrl: 'https://models.inference.ai.azure.com',
  //   requiresToken: true
  // },
  {
    id: 'mistral-large-2411',
    name: 'Mistral Large',
    icon: '🌊',
    description: 'Mistral\'s flagship model',
    provider: 'github',
    baseUrl: 'https://models.inference.ai.azure.com',
    requiresToken: true
  },
  {
    id: 'ministral-3b',
    name: 'Ministral 3B',
    icon: '💨',
    description: 'Edge-optimized model',
    provider: 'github',
    baseUrl: 'https://models.inference.ai.azure.com',
    requiresToken: true
  },
  // {
  //   id: 'phi-4',
  //   name: 'Phi-4',
  //   icon: '🔬',
  //   description: 'Microsoft\'s efficient small model',
  //   provider: 'github',
  //   baseUrl: 'https://models.inference.ai.azure.com',
  //   requiresToken: true
  // },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    icon: '✨',
    description: "Google's fast multimodal model",
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    requiresToken: true
  },
  {
    id: 'qwen2.5:3b',
    name: 'Qwen 2.5 3B (Local)',
    icon: '🐼',
    description: 'Fast & efficient local model (4GB RAM)',
    provider: 'ollama',
    baseUrl: '/api/ollama',
    requiresToken: false
  },
  {
    id: 'qwen2.5:7b',
    name: 'Qwen 2.5 7B (Local)',
    icon: '🐼',
    description: 'Best quality local model for 16GB RAM',
    provider: 'ollama',
    baseUrl: '/api/ollama',
    requiresToken: false
  },
  {
    id: 'llama3.2:1b',
    name: 'Llama 3.2 1B (Local)',
    icon: '🧠',
    description: 'Fast local model via Ollama (CPU-friendly)',
    provider: 'ollama',
    baseUrl: '/api/ollama',
    requiresToken: false
  },
  {
    id: 'deepseek-r1:1.5b',
    name: 'DeepSeek R1 1.5B (Local)',
    icon: '🧠',
    description: 'Fast local model via Ollama (CPU-friendly)',
    provider: 'ollama',
    baseUrl: '/api/ollama',
    requiresToken: false
  },
  // {
  //   id: 'gemini-2-pro',
  //   name: 'Gemini 2 Pro',
  //   icon: '🔷',
  //   description: 'Google\'s advanced multimodal model',
  //   provider: 'github',
  //   baseUrl: 'https://models.inference.ai.azure.com',
  //   requiresToken: true
  // }
];

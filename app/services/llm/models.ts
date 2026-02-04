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
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    icon: '🎭',
    description: 'Anthropic\'s most capable model',
    provider: 'github',
    baseUrl: 'https://models.inference.ai.azure.com',
    requiresToken: true
  },
  {
    id: 'llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    icon: '🦙',
    description: 'Meta\'s latest open model',
    provider: 'github',
    baseUrl: 'https://models.inference.ai.azure.com',
    requiresToken: true
  },
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
  {
    id: 'phi-4',
    name: 'Phi-4',
    icon: '🔬',
    description: 'Microsoft\'s efficient small model',
    provider: 'github',
    baseUrl: 'https://models.inference.ai.azure.com',
    requiresToken: true
  },
  {
    id: 'deepseek-r1:8b',
    name: 'DeepSeek R1 8B',
    icon: '🧠',
    description: 'Local reasoning model via Ollama',
    provider: 'ollama',
    baseUrl: process.env.NEXT_PUBLIC_OLLAMA_BASE_URL || 'http://localhost:11434',
    requiresToken: false
  },
  {
    id: 'gemini-2-pro',
    name: 'Gemini 2 Pro',
    icon: '🔷',
    description: 'Google\'s advanced multimodal model',
    provider: 'github',
    baseUrl: 'https://models.inference.ai.azure.com',
    requiresToken: true
  }
];

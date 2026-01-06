// AI Model configurations
import { Model } from '../types';

export const MODELS: Model[] = [
  { 
    id: 'gpt-4o', 
    name: 'GPT-4o', 
    icon: '🤖', 
    description: 'Most capable model, best quality responses', 
    provider: 'github',
    baseUrl: 'https://models.inference.ai.azure.com',
    requiresToken: true
  },
  { 
    id: 'gpt-4o-mini', 
    name: 'GPT-4o Mini', 
    icon: '⚡', 
    description: 'Faster and more efficient, great for most tasks', 
    provider: 'github',
    baseUrl: 'https://models.inference.ai.azure.com',
    requiresToken: true
  },
  { 
    id: 'deepseek-r1:8b', 
    name: 'DeepSeek R1 8B', 
    icon: '🧠', 
    description: 'Local reasoning model with chain-of-thought', 
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    requiresToken: false
  },
];

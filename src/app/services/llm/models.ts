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
    id: 'ministral-3b',
    name: 'Ministral 3B',
    icon: '💨',
    description: 'Edge-optimized model, fast and efficient',
    provider: 'github',
    baseUrl: 'https://models.inference.ai.azure.com',
    requiresToken: true
  },
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
    description: 'Fast & efficient local model',
    provider: 'ollama',
    baseUrl: '/api/ollama',
    requiresToken: false
  },
];

import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock translations
const translations = {
  onboarding: {
    step1Title: (params) => `Welcome, ${params?.name || 'User'}!`,
    step4Title: (params) => `You're all set, ${params?.name || 'User'}!`,
    stepOf: (params) => `Step ${params?.current || 1} of ${params?.total || 4}`,
    step1Subtitle: 'Get started with Allerac One',
    step1Bullet1: 'Private & self-hosted',
    step1Bullet2: 'Local LLM support',
    step1Bullet3: 'Cross-conversation memory',
    letsGo: "Let's go",
    skipSetup: 'Skip setup',
    step2Title: 'Connect an AI Model',
    step2Subtitle: 'Choose your LLM provider',
    step2Instructions: 'Get a free API key from Google AI Studio',
    step3Title: 'Tell us about yourself',
    step3Subtitle: 'Customize your AI assistant',
    step3LocationLabel: 'Location (optional)',
    step3LocationPlaceholder: 'San Francisco, CA',
    step3InstructionsLabel: 'System Instructions',
    step3Placeholder: 'Tell the AI about your role, expertise...',
    next: 'Next',
    back: 'Back',
    skipStep: 'Skip',
    saveAndNext: 'Save & Continue',
    startChatting: 'Start Chatting',
    pasteKeyLabel: 'Paste your API Key',
    keyPlaceholder: 'AIza...',
    keySaved: 'Saved',
    openStudio: 'Open Google AI Studio',
    orDivider: 'Or',
    haveGithubToken: 'I have a GitHub token',
    useOllama: 'Use Ollama locally',
    githubTokenLabel: 'GitHub Token',
    githubTokenPlaceholder: 'ghp_...',
    step2PrivacyNote: 'Your keys are encrypted and stored securely.',
    ollamaConnected: 'Ollama is connected',
    ollamaNotConnected: 'Ollama is not connected',
    step4ConfiguredWith: 'Configured with:',
    step4Gemini: 'Google Gemini',
    step4Github: 'GitHub Models',
    step4Ollama: 'Ollama (local)',
    step4AboutMe: 'System Instructions',
    step4TipsTitle: 'Pro tips:',
    step4Tip1: 'You can change settings anytime',
    step4Tip2: 'Use system instructions to customize behavior',
    step4Tip3: 'Enable memory for cross-conversation learning',
  },
  chat: {
    typeMessage: 'Type a message...',
    addAttachment: 'Add attachment',
    image: 'Image',
    document: 'Document',
    ollamaNotConnected: 'Ollama is not connected',
    googleNotConfigured: 'Google API key not configured',
    githubNotConfigured: 'GitHub token not configured',
  },
};

// Mock next-intl globally
jest.mock('next-intl', () => ({
  useTranslations: (namespace) => (key, params) => {
    const ns = namespace || 'common';
    const messages = translations[ns] || translations.common || {};
    const value = messages[key];

    if (!value) return key;
    if (typeof value === 'function') return value(params || {});
    return value;
  },
  useLocale: () => 'en',
}))

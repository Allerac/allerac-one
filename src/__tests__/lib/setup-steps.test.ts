import {
  defaultSetupModel,
  firstIncompleteStep,
  ollamaModelInstalled,
  parseDoneSteps,
  setupModelOptions,
  setupProviderForModel,
} from '@/app/lib/setup-steps';

describe('setup steps', () => {
  it('parses the progress cookie, ignoring unknown and duplicate ids', () => {
    expect(parseDoneSteps('google,llm,evil,llm, language')).toEqual(['language', 'llm', 'google']);
    expect(parseDoneSteps(undefined)).toEqual([]);
  });

  it('resumes at the first incomplete step in wizard order', () => {
    expect(firstIncompleteStep([])).toBe('language');
    expect(firstIncompleteStep(['language', 'google'])).toBe('llm');
    expect(firstIncompleteStep(['language', 'llm', 'google', 'email', 'search', 'telegram'])).toBeNull();
  });

  it('offers known chat models per provider with a sensible default', () => {
    for (const provider of ['openai', 'anthropic', 'ollama'] as const) {
      const options = setupModelOptions(provider);
      expect(options.length).toBeGreaterThan(0);
      expect(options.map(o => o.id)).toContain(defaultSetupModel(provider));
      for (const option of options) expect(setupProviderForModel(option.id)).toBe(provider);
    }
    expect(setupProviderForModel('gemini-2.5-flash')).toBeNull();
  });

  it('matches Ollama tags with and without ":latest"', () => {
    expect(ollamaModelInstalled('gemma4', ['gemma4:latest'])).toBe(true);
    expect(ollamaModelInstalled('qwen2.5:3b', ['qwen2.5:3b'])).toBe(true);
    expect(ollamaModelInstalled('qwen2.5:3b', ['qwen2.5:7b'])).toBe(false);
  });
});

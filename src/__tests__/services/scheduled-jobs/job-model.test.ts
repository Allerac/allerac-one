import { resolveJobModel, validateJobModelSelection } from '@/app/services/scheduled-jobs/job-model';

const noCredentials = {
  githubToken: '',
  googleApiKey: '',
  anthropicApiKey: '',
};

describe('scheduled job model selection', () => {
  it('keeps automatic jobs compatible by falling back to Ollama', () => {
    expect(resolveJobModel(null, null, noCredentials)).toMatchObject({
      selectedModel: 'qwen2.5:3b',
      modelProvider: 'ollama',
    });
  });

  it('respects an explicitly selected local model', () => {
    expect(resolveJobModel('deepseek-r1:7b', 'ollama', noCredentials)).toMatchObject({
      selectedModel: 'deepseek-r1:7b',
      modelProvider: 'ollama',
    });
  });

  it('does not silently replace an unavailable explicit cloud model', () => {
    expect(() => resolveJobModel('gemini-2.5-flash', 'gemini', noCredentials))
      .toThrow('requires a configured Google API key');
  });

  it('rejects model and provider mismatches', () => {
    expect(validateJobModelSelection('deepseek-r1:7b', 'gemini'))
      .toBe('Invalid model selection');
  });
});

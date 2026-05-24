export interface ReadUrlResult {
  url: string;
  title?: string;
  content?: string;
  error?: string;
}

export class ReadUrlTool {
  constructor(private tavilyApiKey: string) {}

  async execute(url: string): Promise<ReadUrlResult> {
    if (!this.tavilyApiKey) {
      return { url, error: 'Tavily API key not configured. Please add your Tavily API key in settings.' };
    }

    try {
      const response = await fetch('https://api.tavily.com/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: this.tavilyApiKey, urls: [url] }),
      });

      if (!response.ok) {
        return { url, error: `Failed to fetch URL: ${response.statusText}` };
      }

      const data = await response.json();
      const result = data.results?.[0];

      if (!result) {
        const failed = data.failed_results?.[0];
        return { url, error: failed?.error || 'No content extracted from URL' };
      }

      // Truncate to avoid overwhelming the context window
      const content = (result.raw_content as string | undefined)?.slice(0, 8000) ?? '';

      return { url, content };
    } catch (err: any) {
      return { url, error: err.message };
    }
  }
}

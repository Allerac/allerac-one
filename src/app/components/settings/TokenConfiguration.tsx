'use client';

interface TokenConfigurationProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  githubToken: string;
  tavilyApiKey: string;
  telegramBotToken: string;
  tokenInput: string;
  setTokenInput: (value: string) => void;
  tavilyKeyInput: string;
  setTavilyKeyInput: (value: string) => void;
  telegramBotTokenInput: string;
  setTelegramBotTokenInput: (value: string) => void;
  onSave: () => void;
}

export default function TokenConfiguration({
  isOpen,
  onClose,
  isDarkMode,
  githubToken,
  tavilyApiKey,
  telegramBotToken,
  tokenInput,
  setTokenInput,
  tavilyKeyInput,
  setTavilyKeyInput,
  telegramBotTokenInput,
  setTelegramBotTokenInput,
  onSave
}: TokenConfigurationProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.3)' }}>
      <div className={`rounded-lg shadow-xl p-6 w-full max-w-md ${isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
        <h2 className={`text-2xl font-bold mb-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Configure API Keys</h2>
        <div className="space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              GitHub Personal Access Token
            </label>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder={githubToken ? '••••••••' : 'ghp_...'}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
            />
            <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Create a token at{' '}
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                github.com/settings/tokens
              </a>
              {' '}with &quot;models&quot; scope
            </p>
          </div>
          
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Tavily API Key (Optional - for web search)
            </label>
            <input
              type="password"
              value={tavilyKeyInput}
              onChange={(e) => setTavilyKeyInput(e.target.value)}
              placeholder={tavilyApiKey ? '••••••••' : 'tvly-...'}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
            />
            <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Get a free API key at{' '}
              <a
                href="https://app.tavily.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                tavily.com
              </a>
              {' '}to enable web search capabilities
            </p>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Telegram Bot Token (Optional - for Telegram access)
            </label>
            <input
              type="password"
              value={telegramBotTokenInput}
              onChange={(e) => setTelegramBotTokenInput(e.target.value)}
              placeholder={telegramBotToken ? '••••••••' : 'Enter bot token...'}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
            />
            <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Create a bot via{' '}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                @BotFather
              </a>
              {' '}on Telegram to get your token
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onSave}
              disabled={!tokenInput.trim() && !tavilyKeyInput.trim() && !telegramBotTokenInput.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Save Keys
            </button>
            {(githubToken || telegramBotToken) && (
              <button
                onClick={onClose}
                className={`flex-1 px-4 py-2 rounded-md transition-colors ${isDarkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'}`}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

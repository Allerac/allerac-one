'use client';

/**
 * Telegram Bot Settings Component
 * Allows users to manage their own Telegram bot configurations
 */

import { useState, useEffect } from 'react';
import {
  getUserBotConfigs,
  createBotConfig,
  updateBotConfig,
  toggleBotEnabled,
  deleteBotConfig,
  testBotToken,
} from '@/app/actions/telegram-bot-config';

interface BotConfig {
  id: string;
  botName: string;
  botToken: string;
  botUsername?: string;
  allowedTelegramIds: number[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface TelegramBotSettingsProps {
  userId: string;
  onClose: () => void;
}

export default function TelegramBotSettings({ userId, onClose }: TelegramBotSettingsProps) {
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingBot, setEditingBot] = useState<BotConfig | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    botName: '',
    botToken: '',
    botUsername: '',
    allowedTelegramIds: '',
  });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [testingToken, setTestingToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load bots
  useEffect(() => {
    loadBots();
  }, [userId]);

  const loadBots = async () => {
    setLoading(true);
    const result = await getUserBotConfigs(userId);
    if (result.success && result.configs) {
      setBots(result.configs);
    }
    setLoading(false);
  };

  const handleTestToken = async () => {
    if (!formData.botToken) {
      setFormError('Please enter a bot token first');
      return;
    }

    setTestingToken(true);
    setFormError('');
    const result = await testBotToken(formData.botToken);
    setTestingToken(false);

    if (result.success && result.botInfo) {
      setFormSuccess(`✅ Token valid! Bot: @${result.botInfo.username}`);
      setFormData(prev => ({ ...prev, botUsername: result.botInfo!.username }));
    } else {
      setFormError(result.error || 'Invalid token');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);

    // Parse allowed IDs
    const allowedIds = formData.allowedTelegramIds
      .split(',')
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id));

    if (allowedIds.length === 0) {
      setFormError('Please enter at least one Telegram User ID');
      setSubmitting(false);
      return;
    }

    let result;
    if (editingBot) {
      result = await updateBotConfig(userId, editingBot.id, {
        botName: formData.botName,
        botToken: formData.botToken !== '••••••••' ? formData.botToken : undefined,
        botUsername: formData.botUsername || undefined,
        allowedTelegramIds: allowedIds,
      });
    } else {
      result = await createBotConfig(
        userId,
        formData.botName,
        formData.botToken,
        allowedIds,
        formData.botUsername || undefined
      );
    }

    setSubmitting(false);

    if (result.success) {
      setFormSuccess(editingBot ? 'Bot updated successfully!' : 'Bot created successfully!');
      setFormData({ botName: '', botToken: '', botUsername: '', allowedTelegramIds: '' });
      setShowAddForm(false);
      setEditingBot(null);
      loadBots();
    } else {
      setFormError(result.error || 'Failed to save bot configuration');
    }
  };

  const handleEdit = (bot: BotConfig) => {
    setEditingBot(bot);
    setFormData({
      botName: bot.botName,
      botToken: '••••••••', // Masked
      botUsername: bot.botUsername || '',
      allowedTelegramIds: bot.allowedTelegramIds.join(', '),
    });
    setShowAddForm(true);
    setFormError('');
    setFormSuccess('');
  };

  const handleToggle = async (botId: string) => {
    const result = await toggleBotEnabled(userId, botId);
    if (result.success) {
      loadBots();
    }
  };

  const handleDelete = async (botId: string, botName: string) => {
    if (!confirm(`Are you sure you want to delete "${botName}"? This action cannot be undone.`)) {
      return;
    }

    const result = await deleteBotConfig(userId, botId);
    if (result.success) {
      loadBots();
    }
  };

  const cancelForm = () => {
    setShowAddForm(false);
    setEditingBot(null);
    setFormData({ botName: '', botToken: '', botUsername: '', allowedTelegramIds: '' });
    setFormError('');
    setFormSuccess('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
              Telegram Bot Settings
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
              Manage your personal Telegram bots
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl sm:text-3xl leading-none flex-shrink-0 ml-2"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          {/* Add/Edit Form */}
          {showAddForm ? (
            <form onSubmit={handleSubmit} className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-900 dark:text-white">
                {editingBot ? 'Edit Bot' : 'Add New Bot'}
              </h3>

              {formError && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">
                  {formError}
                </div>
              )}

              {formSuccess && (
                <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded text-green-700 dark:text-green-300 text-sm">
                  {formSuccess}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Bot Name *
                  </label>
                  <input
                    type="text"
                    value={formData.botName}
                    onChange={(e) => setFormData({ ...formData, botName: e.target.value })}
                    placeholder="My Telegram Bot"
                    required
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Bot Token *
                    {editingBot && <span className="text-xs ml-2 text-gray-500">(leave masked to keep current)</span>}
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={formData.botToken}
                      onChange={(e) => setFormData({ ...formData, botToken: e.target.value })}
                      placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                      required={!editingBot}
                      className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:text-white font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleTestToken}
                      disabled={testingToken || !formData.botToken}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {testingToken ? 'Testing...' : 'Test Token'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Get token from @BotFather on Telegram
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Bot Username
                  </label>
                  <input
                    type="text"
                    value={formData.botUsername}
                    onChange={(e) => setFormData({ ...formData, botUsername: e.target.value })}
                    placeholder="my_bot (auto-filled after testing token)"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Allowed Telegram User IDs *
                  </label>
                  <input
                    type="text"
                    value={formData.allowedTelegramIds}
                    onChange={(e) => setFormData({ ...formData, allowedTelegramIds: e.target.value })}
                    placeholder="123456789, 987654321"
                    required
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Comma-separated list. Get your ID from @userinfobot
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mt-6">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Saving...' : editingBot ? 'Update Bot' : 'Create Bot'}
                </button>
                <button
                  type="button"
                  onClick={cancelForm}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full mb-4 sm:mb-6 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2"
            >
              <span className="text-xl">+</span>
              Add New Bot
            </button>
          )}

          {/* Bot List */}
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading bots...</div>
          ) : bots.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-base sm:text-lg mb-2">No bots configured yet</p>
              <p className="text-sm">Click "Add New Bot" to get started</p>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {bots.map((bot) => (
                <div
                  key={bot.id}
                  className="p-3 sm:p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-3 gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                        <span className="truncate">{bot.botName}</span>
                        {bot.enabled ? (
                          <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full whitespace-nowrap">
                            Active
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full whitespace-nowrap">
                            Inactive
                          </span>
                        )}
                      </h3>
                      {bot.botUsername && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 truncate">
                          @{bot.botUsername}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                      <button
                        onClick={() => handleToggle(bot.id)}
                        className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50"
                      >
                        {bot.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => handleEdit(bot)}
                        className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(bot.id, bot.botName)}
                        className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  
                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <p>
                      <span className="font-medium">Allowed Users:</span>{' '}
                      {bot.allowedTelegramIds.join(', ')}
                    </p>
                    <p>
                      <span className="font-medium">Created:</span>{' '}
                      {new Date(bot.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Help Section */}
          <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
              📱 How to create a Telegram bot:
            </h4>
            <ol className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-decimal list-inside">
              <li>Open Telegram and search for <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">@BotFather</code></li>
              <li>Send <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">/newbot</code> and follow instructions</li>
              <li>Copy the bot token (looks like: 123456789:ABCdef...)</li>
              <li>Get your Telegram User ID from <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">@userinfobot</code></li>
              <li>Paste both here and click "Test Token"</li>
              <li>After saving, the bot will start automatically</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

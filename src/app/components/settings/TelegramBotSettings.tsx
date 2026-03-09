'use client';

/**
 * Telegram Bot Settings Component
 * Allows users to manage their own Telegram bot configurations
 */

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('telegram');
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
      setFormError(t('enterTokenFirst'));
      return;
    }

    setTestingToken(true);
    setFormError('');
    const result = await testBotToken(formData.botToken);
    setTestingToken(false);

    if (result.success && result.botInfo) {
      setFormSuccess(`✅ ${t('tokenValid', { username: result.botInfo.username })}`);
      setFormData(prev => ({ ...prev, botUsername: result.botInfo!.username }));
    } else {
      setFormError(result.error || t('invalidToken'));
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
      setFormError(t('enterAtLeastOneId'));
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
      setFormSuccess(editingBot ? t('botUpdated') : t('botCreated'));
      setFormData({ botName: '', botToken: '', botUsername: '', allowedTelegramIds: '' });
      setShowAddForm(false);
      setEditingBot(null);
      loadBots();
    } else {
      setFormError(result.error || t('saveFailed'));
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
    if (!confirm(t('confirmDelete', { name: botName }))) {
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
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[95dvh] sm:max-h-[90dvh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
              {t('title')}
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
              {t('subtitle')}
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
                {editingBot ? t('editBot') : t('addNewBot')}
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
                    {t('botName')} *
                  </label>
                  <input
                    type="text"
                    value={formData.botName}
                    onChange={(e) => setFormData({ ...formData, botName: e.target.value })}
                    placeholder="My Telegram Bot"
                    required
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('botToken')} *
                    {editingBot && <span className="text-xs ml-2 text-gray-500">{t('leavemasked')}</span>}
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={formData.botToken}
                      onChange={(e) => setFormData({ ...formData, botToken: e.target.value })}
                      placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                      required={!editingBot}
                      className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:text-white font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleTestToken}
                      disabled={testingToken || !formData.botToken}
                      className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {testingToken ? t('testing') : t('testToken')}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('botTokenHint')}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('botUsername')}
                  </label>
                  <input
                    type="text"
                    value={formData.botUsername}
                    onChange={(e) => setFormData({ ...formData, botUsername: e.target.value })}
                    placeholder={t('botUsernameHint')}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('allowedIds')} *
                  </label>
                  <input
                    type="text"
                    value={formData.allowedTelegramIds}
                    onChange={(e) => setFormData({ ...formData, allowedTelegramIds: e.target.value })}
                    placeholder="123456789, 987654321"
                    required
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('allowedIdsHint')}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mt-6">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? t('saving') : editingBot ? t('updateBot') : t('createBot')}
                </button>
                <button
                  type="button"
                  onClick={cancelForm}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  {t('cancel')}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full mb-4 sm:mb-6 px-4 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium flex items-center justify-center gap-2"
            >
              <span className="text-xl">+</span>
              {t('addNewBot')}
            </button>
          )}

          {/* Bot List */}
          {loading ? (
            <div className="text-center py-8 text-gray-500">{t('loadingBots')}</div>
          ) : bots.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-base sm:text-lg mb-2">{t('noBotsYet')}</p>
              <p className="text-sm">{t('noBotsHint')}</p>
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
                            {t('active')}
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full whitespace-nowrap">
                            {t('inactive')}
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
                        className="px-3 py-1 text-sm bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded hover:bg-brand-200 dark:hover:bg-brand-900/50"
                      >
                        {bot.enabled ? t('disable') : t('enable')}
                      </button>
                      <button
                        onClick={() => handleEdit(bot)}
                        className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        {t('edit')}
                      </button>
                      <button
                        onClick={() => handleDelete(bot.id, bot.botName)}
                        className="px-3 py-1 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50"
                      >
                        {t('delete')}
                      </button>
                    </div>
                  </div>

                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <p>
                      <span className="font-medium">{t('allowedUsers')}:</span>{' '}
                      {bot.allowedTelegramIds.join(', ')}
                    </p>
                    <p>
                      <span className="font-medium">{t('created')}:</span>{' '}
                      {new Date(bot.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Help Section */}
          <div className="mt-8 p-4 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg">
            <h4 className="font-semibold text-brand-900 dark:text-brand-300 mb-2">
              📱 {t('howToCreate')}
            </h4>
            <ol className="text-sm text-brand-800 dark:text-brand-300 space-y-1 list-decimal list-inside">
              <li>{t('howToStep1')}</li>
              <li>{t('howToStep2')}</li>
              <li>{t('howToStep3')}</li>
              <li>{t('howToStep4')}</li>
              <li>{t('howToStep5')}</li>
              <li>{t('howToStep6')}</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

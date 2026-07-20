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
  onClose?: () => void;
  displayMode?: 'modal' | 'page';
  isDarkMode?: boolean;
}

export default function TelegramBotSettings({ userId, onClose, displayMode = 'modal', isDarkMode = true }: TelegramBotSettingsProps) {
  const t = useTranslations('telegram');
  const isPage = displayMode === 'page';
  const d = isDarkMode;
  const labelClass = `block text-sm font-medium mb-1 ${d ? 'text-gray-300' : 'text-gray-700'}`;
  const inputClass = `w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 ${d ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`;
  const mutedClass = d ? 'text-gray-400' : 'text-gray-500';
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
    const result = await getUserBotConfigs();
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
      result = await updateBotConfig(editingBot.id, {
        botName: formData.botName,
        botToken: formData.botToken !== '••••••••' ? formData.botToken : undefined,
        botUsername: formData.botUsername || undefined,
        allowedTelegramIds: allowedIds,
      });
    } else {
      result = await createBotConfig(
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
    const result = await toggleBotEnabled(botId);
    if (result.success) {
      loadBots();
    }
  };

  const handleDelete = async (botId: string, botName: string) => {
    if (!confirm(t('confirmDelete', { name: botName }))) {
      return;
    }

    const result = await deleteBotConfig(botId);
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
    <div className={isPage
      ? `h-full min-h-0 flex ${d ? 'bg-gray-950' : 'bg-gray-100'}`
      : 'fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4'}>
      <div className={`w-full overflow-hidden flex flex-col ${d ? 'bg-gray-800' : 'bg-white'} ${isPage ? 'h-full' : 'max-w-4xl max-h-[95dvh] sm:max-h-[90dvh] rounded-xl shadow-2xl'}`}>
        {/* Header */}
        <div className={`px-4 sm:px-6 py-3 sm:py-4 border-b flex items-center justify-between ${d ? 'border-gray-700' : 'border-gray-200'} ${isPage ? 'w-full max-w-5xl mx-auto' : ''}`}>
          <div className="flex-1 min-w-0">
            <h2 className={`text-lg sm:text-2xl font-bold truncate ${d ? 'text-white' : 'text-gray-900'}`}>
              {t('title')}
            </h2>
            <p className={`text-xs sm:text-sm mt-1 ${d ? 'text-gray-400' : 'text-gray-600'}`}>
              {t('subtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className={`${onClose ? '' : 'hidden '}${d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'} text-2xl sm:text-3xl leading-none flex-shrink-0 ml-2`}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-y-auto p-3 sm:p-6 ${isPage ? 'w-full max-w-5xl mx-auto' : ''}`}>
          {/* Add/Edit Form */}
          {showAddForm ? (
            <form onSubmit={handleSubmit} className={`mb-4 sm:mb-6 p-3 sm:p-4 rounded-lg border ${d ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
              <h3 className={`text-base sm:text-lg font-semibold mb-3 sm:mb-4 ${d ? 'text-white' : 'text-gray-900'}`}>
                {editingBot ? t('editBot') : t('addNewBot')}
              </h3>

              {formError && (
                <div className={`mb-4 p-3 border rounded text-sm ${d ? 'bg-red-900/30 border-red-800 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  {formError}
                </div>
              )}

              {formSuccess && (
                <div className={`mb-4 p-3 border rounded text-sm ${d ? 'bg-green-900/30 border-green-800 text-green-300' : 'bg-green-50 border-green-200 text-green-700'}`}>
                  {formSuccess}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className={labelClass}>
                    {t('botName')} *
                  </label>
                  <input
                    type="text"
                    value={formData.botName}
                    onChange={(e) => setFormData({ ...formData, botName: e.target.value })}
                    placeholder="My Telegram Bot"
                    required
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>
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
                      className={`${inputClass} flex-1 font-mono text-sm`}
                    />
                    <button
                      type="button"
                      onClick={handleTestToken}
                      disabled={testingToken || !formData.botToken}
                      className="px-4 py-2 bg-brand-900 text-white rounded-lg hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {testingToken ? t('testing') : t('testToken')}
                    </button>
                  </div>
                  <p className={`text-xs mt-1 ${mutedClass}`}>
                    {t('botTokenHint')}
                  </p>
                </div>

                <div>
                  <label className={labelClass}>
                    {t('botUsername')}
                  </label>
                  <input
                    type="text"
                    value={formData.botUsername}
                    onChange={(e) => setFormData({ ...formData, botUsername: e.target.value })}
                    placeholder={t('botUsernameHint')}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    {t('allowedIds')} *
                  </label>
                  <input
                    type="text"
                    value={formData.allowedTelegramIds}
                    onChange={(e) => setFormData({ ...formData, allowedTelegramIds: e.target.value })}
                    placeholder="123456789, 987654321"
                    required
                    className={inputClass}
                  />
                  <p className={`text-xs mt-1 ${mutedClass}`}>
                    {t('allowedIdsHint')}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mt-6">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-brand-900 text-white rounded-lg hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? t('saving') : editingBot ? t('updateBot') : t('createBot')}
                </button>
                <button
                  type="button"
                  onClick={cancelForm}
                  className={`px-4 py-2 rounded-lg ${d ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                >
                  {t('cancel')}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full mb-4 sm:mb-6 px-4 py-3 bg-brand-900 text-white rounded-lg hover:bg-brand-800 font-medium flex items-center justify-center gap-2"
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
                  className={`p-3 sm:p-4 border rounded-lg hover:shadow-md transition-shadow ${d ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-3 gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className={`text-base sm:text-lg font-semibold flex items-center gap-2 flex-wrap ${d ? 'text-white' : 'text-gray-900'}`}>
                        <span className="truncate">{bot.botName}</span>
                        {bot.enabled ? (
                          <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${d ? 'bg-green-900/30 text-green-300' : 'bg-green-100 text-green-700'}`}>
                            {t('active')}
                          </span>
                        ) : (
                          <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${d ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-600'}`}>
                            {t('inactive')}
                          </span>
                        )}
                      </h3>
                      {bot.botUsername && (
                        <p className={`text-sm mt-1 truncate ${d ? 'text-gray-400' : 'text-gray-600'}`}>
                          @{bot.botUsername}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                      <button
                        onClick={() => handleToggle(bot.id)}
                        className={`px-3 py-1 text-sm rounded ${d ? 'bg-brand-900/30 text-brand-300 hover:bg-brand-900/50' : 'bg-brand-100 text-brand-700 hover:bg-brand-200'}`}
                      >
                        {bot.enabled ? t('disable') : t('enable')}
                      </button>
                      <button
                        onClick={() => handleEdit(bot)}
                        className={`px-3 py-1 text-sm rounded ${d ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                      >
                        {t('edit')}
                      </button>
                      <button
                        onClick={() => handleDelete(bot.id, bot.botName)}
                        className={`px-3 py-1 text-sm rounded ${d ? 'bg-red-900/30 text-red-300 hover:bg-red-900/50' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                      >
                        {t('delete')}
                      </button>
                    </div>
                  </div>

                  <div className={`text-sm space-y-1 ${d ? 'text-gray-400' : 'text-gray-600'}`}>
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
          <div className={`mt-8 p-4 border rounded-lg ${d ? 'bg-brand-900/20 border-brand-800' : 'bg-brand-50 border-brand-200'}`}>
            <h4 className={`font-semibold mb-2 ${d ? 'text-brand-300' : 'text-brand-900'}`}>
              📱 {t('howToCreate')}
            </h4>
            <ol className={`text-sm space-y-1 list-decimal list-inside ${d ? 'text-brand-300' : 'text-brand-800'}`}>
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

'use client';

import { useTheme } from '@/app/context/ThemeContext';
import { useState, useRef, useEffect, useCallback } from 'react';
import { MODELS } from '@/app/services/llm/models';
import type { Message, Conversation } from '@/app/types';
import { DomainProvider } from '@/app/context/DomainContext';
import { useConversations } from '@/app/hooks/useConversations';
import { useDomainChat } from '@/app/hooks/useDomainChat';
import SidebarDesktop from '@/app/components/layout/SidebarDesktop';
import SidebarMobile from '@/app/components/layout/SidebarMobile';
import ChatMessages from '@/app/components/chat/ChatMessages';
import ChatInput from '@/app/components/chat/ChatInput';
import { AlleracIcon } from '@/app/components/ui/AlleracIcon';
import HealthDashboard from '@/app/components/health/HealthDashboard';
import MyAlleracModal from '@/app/components/allerac/MyAlleracModal';
import { formatPace } from '@/app/components/health/ActivityCharts';
import type { ActivityChatContext } from '@/app/components/health/RecentActivity';

type HealthPeriod = 'today' | '3days' | '7days' | '30days';

function buildHealthViewContext(period: HealthPeriod, selectedDate: string): string {
  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  if (period === 'today') {
    return `## Health dashboard context\nThe user is currently viewing their health data for ${fmt(selectedDate)}. Use this as the default date for health queries unless they specify otherwise.`;
  }
  const days = period === '3days' ? 3 : period === '7days' ? 7 : 30;
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - (days - 1) * 86400000).toISOString().split('T')[0];
  return `## Health dashboard context\nThe user is currently viewing their health dashboard for the last ${days} days (${fmt(startDate)} → ${fmt(endDate)}). Use this as the default date range for health queries unless they specify otherwise.`;
}

function fmtDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Mirrors exactly what ActivityDetailPanel.tsx renders on screen for the
// selected day's activity (header stats, dynamics, laps, zones), so the
// assistant can answer questions grounded in what the user is looking at —
// deliberately excludes route/GPS data (see ActivityChatContext's docstring).
function buildActivityContext(ctx: ActivityChatContext | null): string {
  if (!ctx) return '';
  const a = ctx.activity;
  const lines: string[] = ['## Currently viewed activity'];
  lines.push(`${a.activity_name ?? a.activity_type ?? 'Activity'} (${a.activity_type ?? 'unknown'}) on ${a.date}`);

  const stats = [
    a.duration_seconds ? `duration ${fmtDuration(a.duration_seconds)}` : null,
    a.distance_meters ? `distance ${(a.distance_meters / 1000).toFixed(2)}km` : null,
    a.calories ? `${Math.round(a.calories)}kcal` : null,
    a.avg_heart_rate ? `avg HR ${Math.round(a.avg_heart_rate)}bpm` : null,
    a.max_heart_rate ? `max HR ${Math.round(a.max_heart_rate)}bpm` : null,
    a.average_pace_seconds_per_km ? `pace ${formatPace(a.average_pace_seconds_per_km)}` : null,
    a.average_power_watts ? `power ${Math.round(a.average_power_watts)}W` : null,
    a.elevation_gain ? `elevation +${Math.round(a.elevation_gain)}m` : null,
  ].filter(Boolean);
  if (stats.length > 0) lines.push(stats.join(', '));

  const dynamics = [
    a.average_cadence_spm ? `cadence ${Math.round(Number(a.average_cadence_spm))}spm` : null,
    a.average_stride_length_meters ? `stride ${Number(a.average_stride_length_meters).toFixed(2)}m` : null,
    a.average_vertical_oscillation_cm ? `vertical oscillation ${Number(a.average_vertical_oscillation_cm).toFixed(1)}cm` : null,
    a.average_vertical_ratio_percent ? `vertical ratio ${Number(a.average_vertical_ratio_percent).toFixed(1)}%` : null,
    a.average_ground_contact_time_ms ? `ground contact ${Math.round(Number(a.average_ground_contact_time_ms))}ms` : null,
    a.vo2_max ? `VO2 max ${Number(a.vo2_max).toFixed(1)}` : null,
    a.training_effect_aerobic ? `training effect aerobic ${Number(a.training_effect_aerobic).toFixed(1)}` : null,
    a.training_effect_anaerobic ? `anaerobic ${Number(a.training_effect_anaerobic).toFixed(1)}` : null,
    a.training_benefit ? `benefit ${a.training_benefit}` : null,
    a.exercise_load ? `exercise load ${Math.round(Number(a.exercise_load))}` : null,
    a.estimated_sweat_loss_ml ? `sweat loss ${Math.round(Number(a.estimated_sweat_loss_ml))}ml` : null,
  ].filter(Boolean);
  if (dynamics.length > 0) lines.push(dynamics.join(', '));

  if (ctx.exercises && ctx.exercises.length > 0) {
    lines.push('Exercises: ' + ctx.exercises.map((ex) => {
      const parts = [ex.sets ? `${ex.sets} sets` : null, ex.reps ? `${ex.reps} reps` : null, ex.maxWeight ? `${ex.maxWeight}kg` : null].filter(Boolean).join(' × ');
      return `${ex.category}${parts ? ` (${parts})` : ''}`;
    }).join('; '));
  }

  // Cap laps shown — ultra-endurance activities can have hundreds of
  // auto-laps, which would otherwise flood the prompt for little benefit.
  const MAX_LAPS = 20;
  if (ctx.laps.length > 0) {
    const shown = ctx.laps.slice(0, MAX_LAPS);
    lines.push('Laps: ' + shown.map((l) =>
      `#${l.lap_index} ${fmtDuration(l.duration_seconds)}${l.distance_meters ? ` ${(l.distance_meters / 1000).toFixed(2)}km` : ''}${l.pace_seconds_per_km ? ` ${formatPace(l.pace_seconds_per_km)}` : ''}${l.average_heart_rate ? ` ${Math.round(l.average_heart_rate)}bpm` : ''}`
    ).join('; ') + (ctx.laps.length > MAX_LAPS ? ` (+${ctx.laps.length - MAX_LAPS} more)` : ''));
  }

  if (ctx.zones.length > 0) {
    const byMetric = new Map<string, typeof ctx.zones>();
    for (const z of ctx.zones) byMetric.set(z.metric_type, [...(byMetric.get(z.metric_type) ?? []), z]);
    for (const [metric, zones] of byMetric) {
      const sorted = zones.slice().sort((x, y) => x.zone_number - y.zone_number);
      lines.push(`${metric} zones: ` + sorted.map((z) => `Z${z.zone_number} ${Math.round(z.percent ?? 0)}%`).join(', '));
    }
  }

  return lines.join('\n');
}

interface Props {
  userId: string;
  userName: string | null;
  userEmail: string;
  isAdmin: boolean;
  defaultSkillName?: string;
}

export default function HealthClient({ userId, userName, userEmail, isAdmin, defaultSkillName }: Props) {
  const { isDark: isDarkMode, toggleDark } = useTheme();
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [isSidebarOpen, setSidebarOpen]           = useState(false);

  const healthViewContextRef = useRef('');
  const activityContextRef = useRef('');

  const {
    conversations, currentConvId, setCurrentConvId,
    messages, setMessages,
    selectConversation, newConversation,
    deleteConversation, pinConversation, renameConversation, reload,
  } = useConversations(userId, 'health');

  const [mobileHealthTab, setMobileHealthTab] = useState<'dashboard' | 'chat'>('dashboard');

  const handleConvCreated = useCallback((id: string) => {
    setCurrentConvId(id); reload();
  }, [setCurrentConvId, reload]);

  const {
    input, setInput, sending, selectedModel, setSelectedModel,
    convId, isAgentMode, toggleAgentMode, githubToken,
    messagesEndRef, lastToolCall, setLastToolCall,
    send, stop, handleKeyPress,
  } = useDomainChat({
    userId, domain: 'health', defaultSkillName,
    currentConvId, messages, setMessages,
    onConversationCreated: handleConvCreated,
    getPostContext: () => [healthViewContextRef.current, activityContextRef.current].filter(Boolean).join('\n\n'),
  });

  const [isMyAlleracOpen, setIsMyAlleracOpen] = useState(false);
  useEffect(() => {
    const open = () => setIsMyAlleracOpen(true);
    window.addEventListener('openMyAlleracModal', open);
    return () => window.removeEventListener('openMyAlleracModal', open);
  }, []);

  const handleLogout = async () => { const { logout } = await import('@/app/actions/auth'); await logout(); };
  const loadConversation = useCallback(async (id: string) => { await selectConversation(id); }, [selectConversation]);
  const clearChat = useCallback(() => { newConversation(); }, [newConversation]);
  const handleDelete = useCallback(async (id: string) => { await deleteConversation(id); }, [deleteConversation]);

  const convList: Conversation[] = conversations.map(c => ({ ...c, pinned: c.pinned ?? false }));
  const activeSkill = defaultSkillName ? { name: defaultSkillName, display_name: defaultSkillName } : null;
  const currentTitle = conversations.find(c => c.id === convId)?.title;
  const displayName = userName?.split(' ')[0] || userName || 'there';
  const d = isDarkMode;

  return (
    <DomainProvider value={{ isDark: d, lastToolCall: null, setLastToolCall: () => {}, postContext: '', setPostContext: () => {} }}>
      <div className={`h-full flex flex-col ${d ? 'bg-gray-900' : 'bg-white'}`}>

        {isSidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        <div className="flex flex-1 overflow-hidden">

          <div className="lg:hidden">
            <SidebarMobile
              isSidebarOpen={isSidebarOpen} isDarkMode={d} onClose={() => setSidebarOpen(false)}
              conversations={convList} currentConversationId={convId}
              loadConversation={loadConversation} deleteConversation={handleDelete}
              pinConversation={pinConversation} renameConversation={renameConversation}
              showHealth
              isAdmin={isAdmin} onNewConversation={clearChat} userName={userName ?? undefined} userEmail={userEmail} onLogout={handleLogout} onToggleTheme={toggleDark}
            />
          </div>

          <div className="hidden lg:block">
            <SidebarDesktop
              isSidebarCollapsed={isSidebarCollapsed} setIsSidebarCollapsed={setSidebarCollapsed}
              isDarkMode={d} conversations={convList} currentConversationId={convId}
              loadConversation={loadConversation} deleteConversation={handleDelete}
              pinConversation={pinConversation} renameConversation={renameConversation}
              showHealth
              isAdmin={isAdmin} onNewConversation={clearChat} userName={userName ?? undefined} userEmail={userEmail} onLogout={handleLogout} onToggleTheme={toggleDark}
            />
          </div>

          <div className={`flex-1 flex flex-col overflow-hidden ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>

            {/* Mobile tab bar */}
            <div className={`lg:hidden flex-shrink-0 flex items-center border-b ${d ? 'border-gray-700' : 'border-gray-200'}`}>
              <button onClick={() => setSidebarOpen(true)} className={`px-3 py-2.5 ${d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              {(['dashboard', 'chat'] as const).map(tab => (
                <button key={tab} onClick={() => setMobileHealthTab(tab)}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors capitalize ${
                    mobileHealthTab === tab
                      ? `border-b-2 border-blue-500 ${d ? 'text-white' : 'text-gray-900'}`
                      : d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {tab === 'dashboard' ? 'Dashboard' : 'Chat'}
                </button>
              ))}
            </div>

            <div className="flex flex-1 overflow-hidden">

              {/* Health dashboard — main panel */}
              <div className={`${mobileHealthTab === 'dashboard' ? 'flex' : 'hidden'} lg:flex flex-1 flex-col overflow-hidden`}>
                <HealthDashboard
                  isOpen
                  onClose={() => {}}
                  isDarkMode={d}
                  userId={userId}
                  inline
                  syncUrl
                  onViewChange={(period, date) => {
                    healthViewContextRef.current = buildHealthViewContext(period, date);
                  }}
                  onActivityContextChange={(ctx) => {
                    activityContextRef.current = buildActivityContext(ctx);
                  }}
                />
              </div>

              {/* Chat panel */}
              <div className={`${mobileHealthTab === 'chat' ? 'flex flex-1' : 'hidden'} lg:flex lg:flex-none lg:w-[360px] flex-col border-l overflow-hidden ${d ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
                {messages.length === 0 && !sending ? (
                  <div className={`flex-1 flex flex-col items-center justify-center px-4 ${d ? 'bg-gray-900' : 'bg-white'}`}>
                    <div className="w-full max-w-sm">
                      <div className="text-center mb-8">
                        <div className="w-fit mx-auto mb-6"><AlleracIcon size={64} /></div>
                        <h2 className={`text-xl font-bold mb-2 ${d ? 'text-gray-100' : 'text-gray-900'}`}>Hello, {displayName}!</h2>
                        <h3 className={`text-sm font-medium ${d ? 'text-gray-400' : 'text-gray-600'}`}>How can I help you today?</h3>
                      </div>
                      <ChatInput
                        inputMessage={input} setInputMessage={setInput}
                        handleKeyPress={handleKeyPress} handleSendMessage={send}
                        isSending={sending} githubToken={githubToken} isDarkMode={d}
                        setIsDocumentModalOpen={() => {}} selectedModel={selectedModel}
                        setSelectedModel={setSelectedModel}
                        MODELS={MODELS} githubConfigured ollamaConnected googleConfigured anthropicConfigured
                        isAgentMode={isAgentMode} onToggleAgentMode={toggleAgentMode}
                        onStop={stop}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={`flex-1 overflow-y-auto ${d ? 'bg-gray-900' : 'bg-white'}`}>
                      <ChatMessages
                        messages={messages as unknown as Message[]} isSending={sending}
                        selectedModel={selectedModel} MODELS={MODELS} isDarkMode={d}
                        currentConversationId={convId} userId={userId} githubToken={githubToken}
                        messagesEndRef={messagesEndRef} domainSlug="health"
                      />
                    </div>
                    <div className={`flex-shrink-0 px-3 sm:px-4 pt-3 ${d ? 'bg-gray-900' : 'bg-white'}`}
                      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
                      <ChatInput
                        inputMessage={input} setInputMessage={setInput}
                        handleKeyPress={handleKeyPress} handleSendMessage={send}
                        isSending={sending} githubToken={githubToken} isDarkMode={d}
                        setIsDocumentModalOpen={() => {}} selectedModel={selectedModel}
                        setSelectedModel={setSelectedModel}
                        MODELS={MODELS} githubConfigured ollamaConnected googleConfigured anthropicConfigured
                        isAgentMode={isAgentMode} onToggleAgentMode={toggleAgentMode}
                        onStop={stop}
                      />
                    </div>
                  </>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>

      <MyAlleracModal
        isOpen={isMyAlleracOpen}
        onClose={() => setIsMyAlleracOpen(false)}
        isDarkMode={d}
        userId={userId}
        githubToken={githubToken}
        userName={userName ?? undefined}
        domainSlug="health"
      />
    </DomainProvider>
  );
}

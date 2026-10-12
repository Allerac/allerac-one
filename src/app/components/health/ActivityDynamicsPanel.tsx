'use client';

import { useTranslations } from 'next-intl';

export interface DynamicsFields {
  average_cadence_spm?: number | null;
  average_stride_length_meters?: number | null;
  average_vertical_oscillation_cm?: number | null;
  average_vertical_ratio_percent?: number | null;
  average_ground_contact_time_ms?: number | null;
  estimated_sweat_loss_ml?: number | null;
  beginning_stamina_percent?: number | null;
  ending_stamina_percent?: number | null;
  training_effect_aerobic?: number | null;
  training_effect_anaerobic?: number | null;
  training_benefit?: string | null;
  exercise_load?: number | null;
  vo2_max?: number | null;
}

interface Props {
  activity: DynamicsFields;
  isDarkMode: boolean;
}

// Running dynamics + hydration + training load (Phase 4 of docs/roadmap/
// health-detailed-activities.md). Only ever shows tiles for fields the
// device actually reported — never a placeholder for missing data, same
// "never infer a metric" rule the Phase 1 mapper follows.
export default function ActivityDynamicsPanel({ activity, isDarkMode }: Props) {
  const t = useTranslations('health');
  const d = isDarkMode;
  const cardCls = `rounded-lg border p-4 ${d ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200'}`;
  const textMuted = d ? 'text-gray-400' : 'text-gray-500';
  const textMain = d ? 'text-gray-100' : 'text-gray-900';
  const tileCls = `flex items-center gap-2.5 px-3 py-3 rounded-lg border ${
    d ? 'border-gray-700 bg-gray-800/40' : 'border-gray-200 bg-white'
  }`;

  const stamina =
    activity.beginning_stamina_percent != null && activity.ending_stamina_percent != null
      ? `${Math.round(activity.beginning_stamina_percent)}% → ${Math.round(activity.ending_stamina_percent)}%`
      : null;

  const tiles = [
    { icon: '👣', label: t('cadence'), value: activity.average_cadence_spm, unit: 'spm', round: true },
    { icon: '📏', label: t('strideLength'), value: activity.average_stride_length_meters, unit: 'm', decimals: 2 },
    { icon: '🦘', label: t('verticalOscillation'), value: activity.average_vertical_oscillation_cm, unit: 'cm', decimals: 1 },
    { icon: '📐', label: t('verticalRatio'), value: activity.average_vertical_ratio_percent, unit: '%', decimals: 1 },
    { icon: '👟', label: t('groundContactTime'), value: activity.average_ground_contact_time_ms, unit: 'ms', round: true },
    { icon: '💧', label: t('sweatLoss'), value: activity.estimated_sweat_loss_ml, unit: 'mL', round: true },
    { icon: '📊', label: t('trainingLoad'), value: activity.exercise_load, unit: '', round: true },
    { icon: '📈', label: t('vo2Max'), value: activity.vo2_max, unit: 'ml/kg/min', round: true },
    { icon: '🫁', label: t('aerobicEffect'), value: activity.training_effect_aerobic, unit: '', decimals: 1 },
    { icon: '⚡', label: t('anaerobicEffect'), value: activity.training_effect_anaerobic, unit: '', decimals: 1 },
  ].filter((tile) => tile.value != null);

  if (tiles.length === 0 && !stamina && !activity.training_benefit) return null;

  return (
    <div className={cardCls}>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${textMuted}`}>{t('runningDynamics')}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {stamina && (
          <div className={tileCls}>
            <span className="text-xl flex-shrink-0">🔋</span>
            <p className={`text-sm font-bold leading-tight ${textMain}`}>
              {stamina}
              <span className={`block text-xs font-normal ${textMuted}`}>{t('stamina')}</span>
            </p>
          </div>
        )}
        {activity.training_benefit && (
          <div className={tileCls}>
            <span className="text-xl flex-shrink-0">🎯</span>
            <p className={`text-sm font-bold leading-tight capitalize ${textMain}`}>
              {activity.training_benefit.toLowerCase().replace(/_/g, ' ')}
              <span className={`block text-xs font-normal ${textMuted}`}>{t('trainingBenefit')}</span>
            </p>
          </div>
        )}
        {tiles.map(({ icon, label, value, unit, decimals, round }) => {
          // Postgres NUMERIC columns come back from the API as strings, not
          // JS numbers — coerce before .toFixed() (Math.round tolerates a
          // string fine, but .toFixed() only exists on Number.prototype).
          const num = Number(value);
          return (
            <div key={label} className={tileCls}>
              <span className="text-xl flex-shrink-0">{icon}</span>
              <p className={`text-sm font-bold leading-tight ${textMain}`}>
                {round ? Math.round(num) : num.toFixed(decimals ?? 0)}
                {unit && <span className={`text-xs font-normal ml-0.5 ${textMuted}`}>{unit}</span>}
                <span className={`block text-xs font-normal ${textMuted}`}>{label}</span>
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

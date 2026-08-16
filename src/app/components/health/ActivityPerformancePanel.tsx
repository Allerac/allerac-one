'use client';

interface Props {
  activity: {
    provider?: string | null;
    relative_effort?: number | null;
    perceived_exertion?: number | null;
    weighted_average_power_watts?: number | null;
    energy_kilojoules?: number | null;
    source_device?: string | null;
    best_effort_count?: number | null;
  };
  isDarkMode: boolean;
}

export default function ActivityPerformancePanel({ activity, isDarkMode: d }: Props) {
  const tiles = [
    { label: 'Relative Effort', value: activity.relative_effort, unit: '', icon: '📈', decimals: 0 },
    { label: 'Potência ponderada', value: activity.weighted_average_power_watts, unit: 'W', icon: '⚡', decimals: 0 },
    { label: 'Energia', value: activity.energy_kilojoules, unit: 'kJ', icon: '🔥', decimals: 1 },
    { label: 'Esforço percebido', value: activity.perceived_exertion, unit: '/10', icon: '💪', decimals: 0 },
    { label: 'Melhores esforços', value: activity.best_effort_count, unit: '', icon: '🏅', decimals: 0 },
  ].filter((tile) => tile.value != null);
  if (!tiles.length && !activity.source_device) return null;
  const card = `rounded-lg border p-4 ${d ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200'}`;
  const muted = d ? 'text-gray-400' : 'text-gray-500';
  const main = d ? 'text-gray-100' : 'text-gray-900';
  const tile = `flex items-center gap-2.5 px-3 py-3 rounded-lg border ${d ? 'border-gray-700 bg-gray-800/40' : 'border-gray-200 bg-white'}`;
  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>Carga e desempenho</p>
        {activity.provider === 'strava' && <span className="rounded-full bg-[#fc4c02] px-2 py-0.5 text-[10px] font-semibold text-white">STRAVA</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((item) => (
          <div key={item.label} className={tile}>
            <span className="text-xl">{item.icon}</span>
            <p className={`text-sm font-bold ${main}`}>
              {Number(item.value).toFixed(item.decimals)}{item.unit && <span className={`ml-0.5 text-xs font-normal ${muted}`}>{item.unit}</span>}
              <span className={`block text-xs font-normal ${muted}`}>{item.label}</span>
            </p>
          </div>
        ))}
        {activity.source_device && (
          <div className={tile}>
            <span className="text-xl">⌚</span>
            <p className={`text-sm font-bold ${main}`}>{activity.source_device}<span className={`block text-xs font-normal ${muted}`}>Dispositivo</span></p>
          </div>
        )}
      </div>
    </div>
  );
}

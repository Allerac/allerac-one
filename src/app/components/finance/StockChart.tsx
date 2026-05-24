'use client';

import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

type Period = '1W' | '1M' | '6M';

interface Candle {
  t: number;
  c: number;
}

interface Props {
  symbol: string;
  currentPrice: number;
  isDarkMode: boolean;
  isPositive: boolean;
}

function formatDate(ts: number, period: Period): string {
  const d = new Date(ts);
  if (period === '1W') {
    return d.toLocaleDateString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function StockChart({ symbol, currentPrice, isDarkMode: d, isPositive }: Props) {
  const [period, setPeriod]   = useState<Period>('1M');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch(`/api/finance/candle?symbol=${symbol}&period=${period}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setCandles(data.candles ?? []); })
      .catch(() => { if (!cancelled) setCandles([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, period]);

  const color    = isPositive ? '#22c55e' : '#ef4444';
  const fillId   = `fill-${symbol}`;
  const textMuted = d ? '#9ca3af' : '#6b7280';
  const gridColor = d ? '#374151' : '#e5e7eb';

  const PERIODS: Period[] = ['1W', '1M', '6M'];

  return (
    <div className="mt-3 pt-3 border-t border-dashed" style={{ borderColor: d ? '#374151' : '#e5e7eb' }}>
      {/* Period tabs */}
      <div className="flex gap-1 mb-3">
        {PERIODS.map(p => (
          <button
            key={p}
            onClick={e => { e.stopPropagation(); setPeriod(p); }}
            className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${
              period === p
                ? 'bg-blue-500/20 text-blue-400'
                : d ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chart */}
      {isLoading ? (
        <div className="h-24 flex items-center justify-center">
          <svg className="w-5 h-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        </div>
      ) : candles.length === 0 ? (
        <div className="h-24 flex items-center justify-center text-xs" style={{ color: textMuted }}>
          No data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={96}>
          <AreaChart data={candles} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="t"
              tickFormatter={ts => formatDate(ts as number, period)}
              tick={{ fontSize: 10, fill: textMuted }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 10, fill: textMuted }}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            />
            <Tooltip
              contentStyle={{
                background: d ? '#1f2937' : '#fff',
                border: `1px solid ${d ? '#374151' : '#e5e7eb'}`,
                borderRadius: '8px',
                fontSize: '12px',
                color: d ? '#f3f4f6' : '#111827',
              }}
              labelFormatter={ts => formatDate(ts as number, period)}
              formatter={(v: unknown) => [`$${(v as number).toFixed(2)}`, 'Close']}
            />
            <Area
              type="monotone"
              dataKey="c"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${fillId})`}
              dot={false}
              activeDot={{ r: 3, fill: color }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

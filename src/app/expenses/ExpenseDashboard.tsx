'use client';

import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ExpenseInvoice } from '@/app/actions/expenses';
import { computeProviderColors, OTHER_COLOR, OTHER_KEY } from './expenseColors';

interface Props {
  expenses: ExpenseInvoice[];
  isDarkMode: boolean;
}

type Granularity = 'month' | 'quarter' | 'year';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getPeriodRange(granularity: Granularity, offset: number, base: Date): { startISO: string; endISO: string; label: string } {
  if (granularity === 'month') {
    const start = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    return {
      startISO: toISODate(start),
      endISO: toISODate(end),
      label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    };
  }
  if (granularity === 'quarter') {
    const baseQuarterIndex = base.getFullYear() * 4 + Math.floor(base.getMonth() / 3);
    const targetIndex = baseQuarterIndex + offset;
    const year = Math.floor(targetIndex / 4);
    const q = targetIndex - year * 4; // 0-3
    const start = new Date(year, q * 3, 1);
    const end = new Date(year, q * 3 + 3, 0);
    return { startISO: toISODate(start), endISO: toISODate(end), label: `Q${q + 1} ${year}` };
  }
  const year = base.getFullYear() + offset;
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  return { startISO: toISODate(start), endISO: toISODate(end), label: String(year) };
}

/** Months to plot in the trend chart for the selected filter — a single month
 * alone isn't a trend, so 'month' shows a trailing 6-month window ending there;
 * 'quarter'/'year' show exactly the months inside that period. */
function getTrendMonths(granularity: Granularity, offset: number, base: Date): Date[] {
  if (granularity === 'month') {
    const anchor = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    return Array.from({ length: 6 }, (_, i) => new Date(anchor.getFullYear(), anchor.getMonth() - (5 - i), 1));
  }
  if (granularity === 'quarter') {
    const baseQuarterIndex = base.getFullYear() * 4 + Math.floor(base.getMonth() / 3);
    const targetIndex = baseQuarterIndex + offset;
    const year = Math.floor(targetIndex / 4);
    const q = targetIndex - year * 4;
    return Array.from({ length: 3 }, (_, i) => new Date(year, q * 3 + i, 1));
  }
  const year = base.getFullYear() + offset;
  return Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));
}

/** One small-multiple line chart per currency — different currencies are different
 * units, so they never share an axis (see dataviz anti-patterns: no dual-axis).
 * One line per provider (stable color from computeProviderColors), zero-filled
 * for months without an invoice so the line reads as real spend, not a gap. */
function MonthlyTrendCharts({ expenses, isDarkMode: d, months }: { expenses: ExpenseInvoice[]; isDarkMode: boolean; months: Date[] }) {
  const textMuted = d ? '#9ca3af' : '#6b7280';
  const gridColor = d ? '#374151' : '#e5e7eb';
  const { colorByProvider, rankedProviders } = computeProviderColors(expenses, d);

  const monthKeys = months.map(m => `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  const monthKeySet = new Set(monthKeys);

  const perCurrencyMonth = new Map<string, Map<string, Record<string, number>>>();
  for (const expense of expenses) {
    const monthKey = expense.invoice_date.slice(0, 7);
    if (!monthKeySet.has(monthKey)) continue;
    const seriesKey = colorByProvider.has(expense.provider) ? expense.provider : OTHER_KEY;
    if (!perCurrencyMonth.has(expense.currency)) perCurrencyMonth.set(expense.currency, new Map());
    const perMonth = perCurrencyMonth.get(expense.currency)!;
    if (!perMonth.has(monthKey)) perMonth.set(monthKey, {});
    const row = perMonth.get(monthKey)!;
    row[seriesKey] = (row[seriesKey] ?? 0) + Number(expense.amount);
  }

  const byCurrency = Array.from(perCurrencyMonth.entries()).map(([currency, perMonth]) => {
    const seriesPresent = new Set<string>();
    for (const row of perMonth.values()) Object.keys(row).forEach(key => seriesPresent.add(key));
    const series = rankedProviders.filter(p => seriesPresent.has(p));
    if (seriesPresent.has(OTHER_KEY)) series.push(OTHER_KEY);

    const data = monthKeys.map(monthKey => {
      const row = perMonth.get(monthKey) ?? {};
      const [, monthNum] = monthKey.split('-');
      const filled: Record<string, number | string> = { monthKey, month: MONTH_NAMES[Number(monthNum) - 1] };
      for (const s of series) filled[s] = Math.round((row[s] ?? 0) * 100) / 100;
      return filled;
    });

    return { currency, data, series };
  });

  if (byCurrency.length === 0) {
    return <p className={`text-sm ${d ? 'text-gray-400' : 'text-gray-500'}`}>No invoices in this window.</p>;
  }

  return (
    <div className={`grid gap-4 ${byCurrency.length > 1 ? 'sm:grid-cols-2' : ''}`}>
      {byCurrency.map(({ currency, data, series }) => (
        <div key={currency} className={`border rounded-lg p-4 ${d ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${d ? 'text-gray-400' : 'text-gray-500'}`}>
            {currency}
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={gridColor} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                contentStyle={{
                  background: d ? '#1f2937' : '#fff',
                  border: `1px solid ${d ? '#374151' : '#e5e7eb'}`,
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: d ? '#f3f4f6' : '#111827',
                }}
                formatter={(v: unknown, name: unknown) => [`${currency} ${Number(v).toFixed(2)}`, name as string]}
              />
              {series.map(provider => (
                <Line
                  key={provider}
                  dataKey={provider}
                  stroke={colorByProvider.get(provider) ?? OTHER_COLOR}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {series.map(provider => (
              <span key={provider} className="inline-flex items-center gap-1 text-[10px]" style={{ color: textMuted }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorByProvider.get(provider) ?? OTHER_COLOR }} />
                {provider}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const GRANULARITY_LABEL: Record<Granularity, string> = {
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
};

export default function ExpenseDashboard({ expenses, isDarkMode: d }: Props) {
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [offset, setOffset] = useState(0);

  const cardBg = d ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const text = d ? 'text-gray-100' : 'text-gray-900';
  const textMuted = d ? 'text-gray-400' : 'text-gray-500';
  const navBtnCls = `h-7 w-7 flex items-center justify-center rounded-full transition-colors shrink-0 ${
    d ? 'text-gray-400 hover:bg-gray-700 hover:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
  }`;

  const today = new Date();
  const { startISO, endISO, label } = getPeriodRange(granularity, offset, today);
  const { startISO: prevStartISO, endISO: prevEndISO } = getPeriodRange(granularity, offset - 1, today);
  const trendMonths = getTrendMonths(granularity, offset, today);

  const inPeriod = expenses.filter(e => e.invoice_date >= startISO && e.invoice_date <= endISO);
  const inPrevPeriod = expenses.filter(e => e.invoice_date >= prevStartISO && e.invoice_date <= prevEndISO);

  const totalsByCurrency = new Map<string, number>();
  for (const e of inPeriod) totalsByCurrency.set(e.currency, (totalsByCurrency.get(e.currency) ?? 0) + Number(e.amount));

  const prevTotalsByCurrency = new Map<string, number>();
  for (const e of inPrevPeriod) prevTotalsByCurrency.set(e.currency, (prevTotalsByCurrency.get(e.currency) ?? 0) + Number(e.amount));

  const { colorByProvider } = computeProviderColors(expenses, d);

  const providerTotalsByCurrency = new Map<string, Map<string, number>>();
  for (const e of inPeriod) {
    if (!providerTotalsByCurrency.has(e.currency)) providerTotalsByCurrency.set(e.currency, new Map());
    const perProvider = providerTotalsByCurrency.get(e.currency)!;
    perProvider.set(e.provider, (perProvider.get(e.provider) ?? 0) + Number(e.amount));
  }

  const currencies = Array.from(totalsByCurrency.keys()).sort();

  return (
    <div className="space-y-6">
      {/* Period filter */}
      <div className="flex items-center gap-2">
        <select
          value={granularity}
          onChange={e => { setGranularity(e.target.value as Granularity); setOffset(0); }}
          className={`px-2 py-1.5 rounded-lg text-sm font-medium border transition-colors shrink-0 ${d ? 'bg-gray-800 border-gray-700 text-gray-200' : 'bg-gray-100 border-transparent text-gray-700'}`}
        >
          {(['month', 'quarter', 'year'] as Granularity[]).map(g => (
            <option key={g} value={g}>{GRANULARITY_LABEL[g]}</option>
          ))}
        </select>
        <div className={`flex items-center gap-1 rounded-full border px-1 py-1 ${d ? 'border-gray-700' : 'border-gray-200'}`}>
          <button onClick={() => setOffset(o => o - 1)} className={navBtnCls} title={`Previous ${granularity}`}>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <p className={`text-sm font-semibold text-center px-1 min-w-[110px] ${text}`}>{label}</p>
          <button onClick={() => setOffset(o => o + 1)} className={navBtnCls} title={`Next ${granularity}`}>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        {offset !== 0 && (
          <button onClick={() => setOffset(0)} className={`text-xs shrink-0 hover:underline ${textMuted}`}>Today</button>
        )}
      </div>

      {/* Level 1 — total spend */}
      <section>
        <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${textMuted}`}>Total spend</h2>
        {currencies.length === 0 ? (
          <p className={`text-sm ${textMuted}`}>No invoices in this period.</p>
        ) : (
          <div className={`grid gap-3 ${currencies.length > 1 ? 'sm:grid-cols-2' : ''}`}>
            {currencies.map(currency => {
              const total = totalsByCurrency.get(currency)!;
              const prevTotal = prevTotalsByCurrency.get(currency) ?? 0;
              const delta = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
              return (
                <div key={currency} className={`border rounded-lg p-4 ${cardBg}`}>
                  <p className={`text-xs font-semibold uppercase tracking-wide ${textMuted}`}>{currency}</p>
                  <p className={`text-2xl font-bold mt-1 ${text}`}>{currency} {total.toFixed(2)}</p>
                  {delta !== null && (
                    <p className={`text-xs mt-1 ${textMuted}`}>
                      {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(0)}% vs previous {granularity}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Monthly spend trend */}
      <section>
        <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${textMuted}`}>Monthly spend</h2>
        <MonthlyTrendCharts expenses={expenses} isDarkMode={d} months={trendMonths} />
      </section>

      {/* Level 2 — by provider */}
      <section>
        <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${textMuted}`}>By provider</h2>
        {currencies.length === 0 ? (
          <p className={`text-sm ${textMuted}`}>No invoices in this period.</p>
        ) : (
          <div className={`grid gap-3 ${currencies.length > 1 ? 'sm:grid-cols-2' : ''}`}>
            {currencies.map(currency => {
              const perProvider = Array.from(providerTotalsByCurrency.get(currency)!.entries()).sort((a, b) => b[1] - a[1]);
              return (
                <div key={currency} className={`border rounded-lg p-4 ${cardBg}`}>
                  <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${textMuted}`}>{currency}</p>
                  <div className="space-y-1.5">
                    {perProvider.map(([provider, total]) => (
                      <div key={provider} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorByProvider.get(provider) ?? OTHER_COLOR }} />
                          <span className={`truncate ${text}`}>{provider}</span>
                        </span>
                        <span className={`font-medium shrink-0 ${text}`}>{currency} {total.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ExpenseInvoice } from '@/app/actions/expenses';
import { computeProviderColors, computeTagColors, OTHER_COLOR, OTHER_KEY, UNTAGGED_KEY } from './expenseColors';

interface Props {
  expenses: ExpenseInvoice[];
  isDarkMode: boolean;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** All months from the earliest to the latest invoice, inclusive — so a trend
 * line never skips a month just because nothing happened to land on it. */
function getFullMonthRange(expenses: ExpenseInvoice[]): Date[] {
  if (expenses.length === 0) return [];
  const monthKeys = expenses.map(e => e.invoice_date.slice(0, 7)).sort();
  const [minY, minM] = monthKeys[0].split('-').map(Number);
  const [maxY, maxM] = monthKeys[monthKeys.length - 1].split('-').map(Number);
  const months: Date[] = [];
  let y = minY;
  let m = minM;
  while (y < maxY || (y === maxY && m <= maxM)) {
    months.push(new Date(y, m - 1, 1));
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return months;
}

interface CategoryTrendProps {
  expenses: ExpenseInvoice[];
  isDarkMode: boolean;
  categoryOf: (e: ExpenseInvoice) => string;
  colorByCategory: Map<string, string>;
  rankedCategories: string[];
}

/** One small-multiple line chart per currency — different currencies are different
 * units, so they never share an axis (see dataviz anti-patterns: no dual-axis).
 * One line per category (provider or tag), zero-filled for months without spend
 * in that category so the line reads as real history, not a gap. */
function CategoryTrendCharts({ expenses, isDarkMode: d, categoryOf, colorByCategory, rankedCategories }: CategoryTrendProps) {
  const textMuted = d ? '#9ca3af' : '#6b7280';
  const gridColor = d ? '#374151' : '#e5e7eb';

  const months = getFullMonthRange(expenses);
  const monthKeys = months.map(m => `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);

  const perCurrencyMonth = new Map<string, Map<string, Record<string, number>>>();
  for (const expense of expenses) {
    const monthKey = expense.invoice_date.slice(0, 7);
    const rawCategory = categoryOf(expense);
    const category = colorByCategory.has(rawCategory) ? rawCategory : OTHER_KEY;
    if (!perCurrencyMonth.has(expense.currency)) perCurrencyMonth.set(expense.currency, new Map());
    const perMonth = perCurrencyMonth.get(expense.currency)!;
    if (!perMonth.has(monthKey)) perMonth.set(monthKey, {});
    const row = perMonth.get(monthKey)!;
    row[category] = (row[category] ?? 0) + Number(expense.amount);
  }

  const byCurrency = Array.from(perCurrencyMonth.entries()).map(([currency, perMonth]) => {
    const present = new Set<string>();
    for (const row of perMonth.values()) Object.keys(row).forEach(key => present.add(key));
    const series = rankedCategories.filter(c => present.has(c));
    if (present.has(OTHER_KEY)) series.push(OTHER_KEY);

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
    return <p className={`text-sm ${d ? 'text-gray-400' : 'text-gray-500'}`}>No invoices yet — nothing to chart.</p>;
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
              {series.map(category => (
                <Line
                  key={category}
                  dataKey={category}
                  stroke={colorByCategory.get(category) ?? OTHER_COLOR}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {series.map(category => (
              <span key={category} className="inline-flex items-center gap-1 text-[10px]" style={{ color: textMuted }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorByCategory.get(category) ?? OTHER_COLOR }} />
                {category}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ExpenseAnalytics({ expenses, isDarkMode }: Props) {
  const { colorByProvider, rankedProviders } = computeProviderColors(expenses, isDarkMode);
  const { colorByTag, rankedTags } = computeTagColors(expenses, isDarkMode);

  return (
    <div className="space-y-6">
      <section>
        <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Spend by provider
        </h2>
        <CategoryTrendCharts
          expenses={expenses}
          isDarkMode={isDarkMode}
          categoryOf={e => e.provider}
          colorByCategory={colorByProvider}
          rankedCategories={rankedProviders}
        />
      </section>
      <section>
        <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Spend by tag
        </h2>
        <CategoryTrendCharts
          expenses={expenses}
          isDarkMode={isDarkMode}
          categoryOf={e => e.tag || UNTAGGED_KEY}
          colorByCategory={colorByTag}
          rankedCategories={rankedTags}
        />
      </section>
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { ExpenseInvoice, ExpenseStatus } from '@/app/actions/expenses';

interface Props {
  expenses: ExpenseInvoice[];
  isDarkMode: boolean;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function statusDotCls(status: ExpenseStatus, d: boolean): string {
  if (status === 'paid') return d ? 'bg-green-500' : 'bg-green-600';
  if (status === 'overdue') return d ? 'bg-red-500' : 'bg-red-600';
  if (status === 'cancelled') return d ? 'bg-gray-500' : 'bg-gray-400';
  return d ? 'bg-yellow-500' : 'bg-yellow-500';
}

function statusPillCls(status: ExpenseStatus, d: boolean): string {
  if (status === 'paid') return d ? 'bg-green-900/40 text-green-300' : 'bg-green-50 text-green-700';
  if (status === 'overdue') return d ? 'bg-red-900/40 text-red-300' : 'bg-red-50 text-red-700';
  if (status === 'cancelled') return d ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500';
  return d ? 'bg-yellow-900/40 text-yellow-300' : 'bg-yellow-50 text-yellow-700';
}

interface PredictedEntry {
  provider: string;
  day: number;
}

export default function ExpenseCalendar({ expenses, isDarkMode: d }: Props) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const year = cursor.getFullYear();
  const month = cursor.getMonth(); // 0-indexed

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const isCurrentOrFutureMonth = year > today.getFullYear() || (year === today.getFullYear() && month >= today.getMonth());

  const actualByDay = new Map<number, ExpenseInvoice[]>();
  for (const expense of expenses) {
    const [y, m, dayStr] = expense.invoice_date.split('-').map(Number);
    if (y === year && m === month + 1) {
      const day = dayStr;
      if (!actualByDay.has(day)) actualByDay.set(day, []);
      actualByDay.get(day)!.push(expense);
    }
  }

  const predictedByDay = new Map<number, PredictedEntry[]>();
  if (isCurrentOrFutureMonth) {
    const lastInvoiceByProvider = new Map<string, string>(); // provider -> latest invoice_date
    for (const expense of expenses) {
      const current = lastInvoiceByProvider.get(expense.provider);
      if (!current || expense.invoice_date > current) lastInvoiceByProvider.set(expense.provider, expense.invoice_date);
    }

    for (const [provider, lastDateStr] of lastInvoiceByProvider) {
      const [lastY, lastM, lastD] = lastDateStr.split('-').map(Number);
      const isAfterLastInvoiceMonth = year > lastY || (year === lastY && month + 1 > lastM);
      if (!isAfterLastInvoiceMonth) continue;

      const alreadyHasInvoiceThisMonth = expenses.some(e => e.provider === provider && e.invoice_date.slice(0, 7) === `${year}-${String(month + 1).padStart(2, '0')}`);
      if (alreadyHasInvoiceThisMonth) continue;

      const day = Math.min(lastD, daysInMonth);
      if (!predictedByDay.has(day)) predictedByDay.set(day, []);
      predictedByDay.get(day)!.push({ provider, day });
    }
  }

  const cells: Array<number | null> = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const isToday = (day: number) => year === today.getFullYear() && month === today.getMonth() && day === today.getDate();

  return (
    <div className={`border rounded-lg p-4 ${d ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <p className={`text-sm font-semibold ${d ? 'text-gray-200' : 'text-gray-800'}`}>
          {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </p>
        <div className="flex gap-1">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className={`p-1.5 rounded transition-colors ${d ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className={`p-1.5 rounded transition-colors ${d ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map(label => (
          <div key={label} className={`text-center text-[10px] font-semibold uppercase tracking-wide py-1 ${d ? 'text-gray-500' : 'text-gray-400'}`}>
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={`blank-${i}`} className="min-h-[60px]" />;
          const actual = actualByDay.get(day) ?? [];
          const predicted = predictedByDay.get(day) ?? [];
          return (
            <div
              key={day}
              className={`min-h-[60px] rounded-md p-1 border ${
                isToday(day)
                  ? d ? 'border-indigo-500' : 'border-indigo-400'
                  : d ? 'border-gray-700/60' : 'border-gray-100'
              }`}
            >
              <p className={`text-[10px] mb-0.5 ${d ? 'text-gray-500' : 'text-gray-400'}`}>{day}</p>
              <div className="flex flex-col gap-0.5">
                {actual.slice(0, 2).map(expense => (
                  <div key={expense.id} className={`flex items-center gap-1 rounded px-1 py-0.5 ${statusPillCls(expense.status, d)}`} title={`${expense.provider} — ${expense.currency} ${Number(expense.amount).toFixed(2)}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotCls(expense.status, d)}`} />
                    <span className="text-[9px] truncate">{expense.provider}</span>
                  </div>
                ))}
                {actual.length > 2 && (
                  <p className={`text-[9px] ${d ? 'text-gray-500' : 'text-gray-400'}`}>+{actual.length - 2} more</p>
                )}
                {predicted.map(p => (
                  <div
                    key={p.provider}
                    className={`flex items-center gap-1 rounded px-1 py-0.5 border border-dashed ${d ? 'border-gray-600 text-gray-500' : 'border-gray-300 text-gray-400'}`}
                    title={`Expected: ${p.provider} (based on past invoices)`}
                  >
                    <span className="text-[9px] italic truncate">~{p.provider}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className={`flex items-center gap-4 mt-3 pt-3 border-t text-[10px] ${d ? 'border-gray-700 text-gray-500' : 'border-gray-100 text-gray-400'}`}>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Paid</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500" /> Pending</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Overdue</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded border border-dashed border-gray-400" /> Expected</span>
      </div>
    </div>
  );
}

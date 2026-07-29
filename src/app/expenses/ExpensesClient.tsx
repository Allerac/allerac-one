'use client';

import { useTheme } from '@/app/context/ThemeContext';
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import * as expensesActions from '@/app/actions/expenses';
import type { ExpenseInvoice, ExpenseStatus } from '@/app/actions/expenses';
import ExpenseDashboard from './ExpenseDashboard';
import ExpenseCalendar from './ExpenseCalendar';
import ExpenseAnalytics from './ExpenseAnalytics';

interface ExpensesClientProps {
  initialExpenses: ExpenseInvoice[];
}

interface FormValues {
  provider: string;
  invoice_number: string;
  invoice_date: string;
  billing_period: string; // 'YYYY-MM', or '' if not set
  currency: string;
  amount: string;
  status: ExpenseStatus;
  tag: string;
}

const EMPTY_FORM: FormValues = {
  provider: '',
  invoice_number: '',
  invoice_date: '',
  billing_period: '',
  currency: 'EUR',
  amount: '',
  status: 'pending',
  tag: '',
};

/** Expands a 'YYYY-MM' month value into its first and last calendar day. */
function monthToRange(monthValue: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}$/.test(monthValue)) return { start: '', end: '' };
  const [year, month] = monthValue.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${monthValue}-01`,
    end: `${monthValue}-${String(lastDay).padStart(2, '0')}`,
  };
}

function buildFormData(values: FormValues, file: File | null): FormData {
  const { start, end } = monthToRange(values.billing_period);
  const fd = new FormData();
  fd.append('provider', values.provider);
  fd.append('invoice_number', values.invoice_number);
  fd.append('invoice_date', values.invoice_date);
  fd.append('billing_period_start', start);
  fd.append('billing_period_end', end);
  fd.append('currency', values.currency);
  fd.append('amount', values.amount);
  fd.append('status', values.status);
  fd.append('tag', values.tag);
  if (file) fd.append('file', file);
  return fd;
}

const STATUS_LABEL: Record<ExpenseStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};

export default function ExpensesClient({ initialExpenses }: ExpensesClientProps) {
  const { isDark: isDarkMode, toggleDark } = useTheme();
  const d = isDarkMode;

  const [expenses, setExpenses] = useState<ExpenseInvoice[]>(initialExpenses);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'invoices' | 'calendar' | 'analytics'>('dashboard');

  const providerSuggestions = useMemo(
    () => Array.from(new Set(expenses.map(e => e.provider))).sort(),
    [expenses]
  );
  const tagSuggestions = useMemo(
    () => Array.from(new Set(expenses.map(e => e.tag).filter((t): t is string => !!t))).sort(),
    [expenses]
  );

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createValues, setCreateValues] = useState<FormValues>(EMPTY_FORM);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createFileName, setCreateFileName] = useState('');
  const createFileRef = useRef<HTMLInputElement>(null);

  const [editValues, setEditValues] = useState<FormValues>(EMPTY_FORM);
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState('');
  const [deletePending, setDeletePending] = useState(false);
  const [editFileName, setEditFileName] = useState('');
  const editFileRef = useRef<HTMLInputElement>(null);

  const bg = d ? 'bg-gray-900' : 'bg-gray-50';
  const cardBg = d ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const text = d ? 'text-gray-100' : 'text-gray-900';
  const textMuted = d ? 'text-gray-400' : 'text-gray-500';
  const inputCls = `w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
    d ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
  }`;
  const labelCls = `block text-xs font-medium mb-1 ${d ? 'text-gray-300' : 'text-gray-700'}`;
  const btnPrimary = 'px-4 py-2 rounded-md text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const btnDanger = `px-3 py-1 rounded text-xs font-medium transition-colors ${
    d ? 'bg-red-900/40 text-red-400 hover:bg-red-900/60' : 'bg-red-50 text-red-600 hover:bg-red-100'
  }`;

  const selectedExpense = expenses.find(e => e.id === selectedId) ?? null;

  const refreshExpenses = async () => {
    const updated = await expensesActions.listExpenses();
    setExpenses(updated);
  };

  const openCreateModal = () => {
    setCreateValues(EMPTY_FORM);
    setCreateError('');
    setCreateFileName('');
    setShowCreateModal(true);
  };

  const openDetailModal = (expense: ExpenseInvoice) => {
    setSelectedId(expense.id);
    setEditValues({
      provider: expense.provider,
      invoice_number: expense.invoice_number,
      invoice_date: expense.invoice_date.slice(0, 10),
      billing_period: expense.billing_period_start?.slice(0, 7) ?? '',
      currency: expense.currency,
      amount: String(expense.amount),
      status: expense.status,
      tag: expense.tag ?? '',
    });
    setEditError('');
    setEditFileName('');
  };

  const closeDetailModal = () => setSelectedId(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatePending(true);
    setCreateError('');
    const fd = buildFormData(createValues, createFileRef.current?.files?.[0] ?? null);
    const result = await expensesActions.createExpense(fd);
    setCreatePending(false);
    if (result.success) {
      setShowCreateModal(false);
      refreshExpenses();
    } else {
      setCreateError(result.error);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    setEditPending(true);
    setEditError('');
    const fd = buildFormData(editValues, editFileRef.current?.files?.[0] ?? null);
    const result = await expensesActions.updateExpense(selectedId, fd);
    setEditPending(false);
    if (result.success) {
      await refreshExpenses();
      closeDetailModal();
    } else {
      setEditError(result.error);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    setDeletePending(true);
    const result = await expensesActions.deleteExpense(selectedId);
    setDeletePending(false);
    if (result.success) {
      setExpenses(prev => prev.filter(x => x.id !== selectedId));
      closeDetailModal();
    } else {
      setEditError(result.error);
    }
  };

  const statusBadgeCls = (status: ExpenseStatus) => {
    if (status === 'paid') return d ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-green-700';
    if (status === 'overdue') return d ? 'bg-red-900/40 text-red-400' : 'bg-red-50 text-red-600';
    if (status === 'cancelled') return d ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500';
    return d ? 'bg-yellow-900/40 text-yellow-400' : 'bg-yellow-50 text-yellow-700';
  };

  const formatBillingPeriod = (expense: ExpenseInvoice) => {
    if (!expense.billing_period_start || !expense.billing_period_end) return null;
    return `${expense.billing_period_start.slice(0, 10)} → ${expense.billing_period_end.slice(0, 10)}`;
  };

  return (
    <div className={`h-full overflow-y-auto ${bg} ${text}`}>
      {/* Header */}
      <div className={`sticky top-0 z-10 border-b ${d ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        <div className="max-w-5xl mx-auto px-3 sm:px-6">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M17 21l-5-4-5 4V5a2 2 0 012-2h6a2 2 0 012 2v16z" />
              </svg>
              <h1 className="text-sm font-semibold">Expenses</h1>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={toggleDark} className={`p-1.5 rounded-md transition-colors ${d ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`} title={d ? 'Light mode' : 'Dark mode'}>
                {d ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                )}
              </button>
              <Link href="/" className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors ${d ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                <span className="hidden sm:inline">Desktop</span>
              </Link>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 -mb-px">
            {(['dashboard', 'invoices', 'calendar', 'analytics'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? d ? 'border-indigo-400 text-indigo-300' : 'border-indigo-600 text-indigo-600'
                    : d ? 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab === 'dashboard' ? 'Dashboard' : tab === 'invoices' ? 'Invoices' : tab === 'calendar' ? 'Calendar' : 'Analytics'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <datalist id="expense-provider-suggestions">
        {providerSuggestions.map(provider => <option key={provider} value={provider} />)}
      </datalist>
      <datalist id="expense-tag-suggestions">
        {tagSuggestions.map(tag => <option key={tag} value={tag} />)}
      </datalist>

      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        {activeTab === 'dashboard' ? (
          <ExpenseDashboard expenses={expenses} isDarkMode={d} />
        ) : activeTab === 'invoices' ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-sm font-semibold uppercase tracking-wider ${textMuted}`}>Invoices</h2>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add invoice
              </button>
            </div>

            <div className={`md:border md:rounded-lg md:overflow-hidden ${cardBg}`}>
              <table className="block md:table w-full text-sm">
                <thead className="hidden md:table-header-group">
                  <tr className={`border-b text-xs ${d ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                    <th className="px-4 py-3 text-left font-medium">Provider</th>
                    <th className="px-4 py-3 text-left font-medium">Invoice #</th>
                    <th className="px-4 py-3 text-left font-medium">Tag</th>
                    <th className="px-4 py-3 text-left font-medium">Billing period</th>
                    <th className="px-4 py-3 text-left font-medium">Invoice date</th>
                    <th className="px-4 py-3 text-left font-medium">Amount</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="block md:table-row-group space-y-3 md:space-y-0">
                  {expenses.length === 0 && (
                    <tr className="block md:table-row">
                      <td colSpan={7} className={`block md:table-cell px-4 py-6 text-center text-sm ${textMuted}`}>
                        No invoices registered yet.
                      </td>
                    </tr>
                  )}
                  {expenses.map((expense, i) => (
                    <tr
                      key={expense.id}
                      onClick={() => openDetailModal(expense)}
                      className={`block md:table-row cursor-pointer border rounded-lg md:rounded-none md:border-x-0 md:border-t-0 md:border-b md:last:border-b-0 transition-colors ${d ? 'border-gray-700 hover:bg-gray-700/40' : 'border-gray-200 md:border-gray-100 hover:bg-gray-100/70'} ${
                        i % 2 === 0 ? '' : d ? 'bg-gray-800/50' : 'bg-gray-50/50'
                      }`}
                    >
                      <td className="block md:table-cell px-4 pt-4 pb-2 md:py-3 font-medium">{expense.provider}</td>
                      <td className="block md:table-cell px-4 py-2 md:py-3 font-mono text-xs">{expense.invoice_number}</td>
                      <td className="block md:table-cell px-4 py-2 md:py-3">
                        {expense.tag ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${d ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                            {expense.tag}
                          </span>
                        ) : (
                          <span className={textMuted}>—</span>
                        )}
                      </td>
                      <td className={`block md:table-cell px-4 py-2 md:py-3 text-xs ${textMuted}`}>
                        {formatBillingPeriod(expense) ?? '—'}
                      </td>
                      <td className={`block md:table-cell px-4 py-2 md:py-3 text-xs ${textMuted}`}>
                        {expense.invoice_date.slice(0, 10)}
                      </td>
                      <td className="block md:table-cell px-4 py-2 md:py-3 font-medium">
                        {expense.currency} {Number(expense.amount).toFixed(2)}
                      </td>
                      <td className="block md:table-cell px-4 pt-2 pb-4 md:py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadgeCls(expense.status)}`}>
                          {STATUS_LABEL[expense.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : activeTab === 'calendar' ? (
          <ExpenseCalendar expenses={expenses} isDarkMode={d} />
        ) : (
          <ExpenseAnalytics expenses={expenses} isDarkMode={d} />
        )}
      </div>

      {/* ── Create invoice modal ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreateModal(false)} />
          <div className={`relative w-full max-w-lg rounded-2xl border shadow-2xl overflow-y-auto max-h-[90vh] ${cardBg}`}>
            <div className={`sticky top-0 flex items-center justify-between px-6 py-4 border-b ${d ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
              <h2 className={`font-semibold text-sm ${text}`}>Add Invoice</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className={`p-1.5 rounded-lg transition-colors ${d ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Provider</label>
                  <input
                    value={createValues.provider}
                    onChange={e => setCreateValues(prev => ({ ...prev, provider: e.target.value }))}
                    placeholder="Anthropic, OpenAI, Azure…"
                    list="expense-provider-suggestions"
                    required
                    autoFocus
                    disabled={createPending}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Invoice number</label>
                  <input
                    value={createValues.invoice_number}
                    onChange={e => setCreateValues(prev => ({ ...prev, invoice_number: e.target.value }))}
                    required
                    disabled={createPending}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Invoice date</label>
                  <input
                    type="date"
                    value={createValues.invoice_date}
                    onChange={e => setCreateValues(prev => ({ ...prev, invoice_date: e.target.value }))}
                    required
                    disabled={createPending}
                    className={inputCls}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Billing period <span className={`font-normal ${textMuted}`}>(optional)</span></label>
                  <input
                    type="month"
                    value={createValues.billing_period}
                    onChange={e => setCreateValues(prev => ({ ...prev, billing_period: e.target.value }))}
                    disabled={createPending}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Currency</label>
                  <input
                    value={createValues.currency}
                    onChange={e => setCreateValues(prev => ({ ...prev, currency: e.target.value.toUpperCase().slice(0, 3) }))}
                    maxLength={3}
                    required
                    disabled={createPending}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={createValues.amount}
                    onChange={e => setCreateValues(prev => ({ ...prev, amount: e.target.value }))}
                    required
                    disabled={createPending}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select
                    value={createValues.status}
                    onChange={e => setCreateValues(prev => ({ ...prev, status: e.target.value as ExpenseStatus }))}
                    disabled={createPending}
                    className={inputCls}
                  >
                    {(Object.keys(STATUS_LABEL) as ExpenseStatus[]).map(status => (
                      <option key={status} value={status}>{STATUS_LABEL[status]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Tag <span className={`font-normal ${textMuted}`}>(optional)</span></label>
                  <input
                    value={createValues.tag}
                    onChange={e => setCreateValues(prev => ({ ...prev, tag: e.target.value }))}
                    placeholder="AI API, Hosting…"
                    list="expense-tag-suggestions"
                    disabled={createPending}
                    className={inputCls}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Invoice file <span className={`font-normal ${textMuted}`}>(PDF, JPEG or PNG, optional)</span></label>
                  <button
                    type="button"
                    onClick={() => createFileRef.current?.click()}
                    disabled={createPending}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors disabled:opacity-50 ${
                      d ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    {createFileName || 'Attach invoice file'}
                  </button>
                  <input
                    ref={createFileRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    disabled={createPending}
                    onChange={e => setCreateFileName(e.target.files?.[0]?.name ?? '')}
                    className="hidden"
                  />
                </div>
              </div>

              {createError && <p className="text-sm text-red-400">{createError}</p>}

              <button type="submit" disabled={createPending} className={`${btnPrimary} w-full`}>
                {createPending ? 'Saving...' : 'Add invoice'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Invoice detail / edit modal ── */}
      {selectedExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeDetailModal} />
          <div className={`relative w-full max-w-lg rounded-2xl border shadow-2xl overflow-y-auto max-h-[90vh] ${cardBg}`}>
            <div className={`sticky top-0 flex items-center justify-between px-6 py-4 border-b ${d ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
              <h2 className={`font-semibold text-sm ${text}`}>{selectedExpense.provider}</h2>
              <button
                onClick={closeDetailModal}
                className={`p-1.5 rounded-lg transition-colors ${d ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleEdit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Provider</label>
                  <input
                    value={editValues.provider}
                    onChange={e => setEditValues(prev => ({ ...prev, provider: e.target.value }))}
                    list="expense-provider-suggestions"
                    required
                    disabled={editPending}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Invoice number</label>
                  <input
                    value={editValues.invoice_number}
                    onChange={e => setEditValues(prev => ({ ...prev, invoice_number: e.target.value }))}
                    required
                    disabled={editPending}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Invoice date</label>
                  <input
                    type="date"
                    value={editValues.invoice_date}
                    onChange={e => setEditValues(prev => ({ ...prev, invoice_date: e.target.value }))}
                    required
                    disabled={editPending}
                    className={inputCls}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Billing period <span className={`font-normal ${textMuted}`}>(optional)</span></label>
                  <input
                    type="month"
                    value={editValues.billing_period}
                    onChange={e => setEditValues(prev => ({ ...prev, billing_period: e.target.value }))}
                    disabled={editPending}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Currency</label>
                  <input
                    value={editValues.currency}
                    onChange={e => setEditValues(prev => ({ ...prev, currency: e.target.value.toUpperCase().slice(0, 3) }))}
                    maxLength={3}
                    required
                    disabled={editPending}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={editValues.amount}
                    onChange={e => setEditValues(prev => ({ ...prev, amount: e.target.value }))}
                    required
                    disabled={editPending}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select
                    value={editValues.status}
                    onChange={e => setEditValues(prev => ({ ...prev, status: e.target.value as ExpenseStatus }))}
                    disabled={editPending}
                    className={inputCls}
                  >
                    {(Object.keys(STATUS_LABEL) as ExpenseStatus[]).map(status => (
                      <option key={status} value={status}>{STATUS_LABEL[status]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Tag <span className={`font-normal ${textMuted}`}>(optional)</span></label>
                  <input
                    value={editValues.tag}
                    onChange={e => setEditValues(prev => ({ ...prev, tag: e.target.value }))}
                    placeholder="AI API, Hosting…"
                    list="expense-tag-suggestions"
                    disabled={editPending}
                    className={inputCls}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>
                    Invoice file <span className={`font-normal ${textMuted}`}>(PDF, JPEG or PNG — leave empty to keep current)</span>
                  </label>
                  {selectedExpense.has_file && (
                    <a
                      href={`/api/expenses/${selectedExpense.id}/file`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-400 font-medium mb-2"
                    >
                      View current file: {selectedExpense.file_name ?? 'invoice'}
                    </a>
                  )}
                  <div>
                    <button
                      type="button"
                      onClick={() => editFileRef.current?.click()}
                      disabled={editPending}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors disabled:opacity-50 ${
                        d ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      {editFileName || (selectedExpense.has_file ? 'Replace file' : 'Attach invoice file')}
                    </button>
                  </div>
                  <input
                    ref={editFileRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    disabled={editPending}
                    onChange={e => setEditFileName(e.target.files?.[0]?.name ?? '')}
                    className="hidden"
                  />
                </div>
              </div>

              {editError && <p className="text-sm text-red-400">{editError}</p>}

              <button type="submit" disabled={editPending} className={`${btnPrimary} w-full`}>
                {editPending ? 'Saving...' : 'Save changes'}
              </button>
            </form>

            <div className={`px-6 pb-6 pt-2 border-t flex justify-end ${d ? 'border-gray-700' : 'border-gray-200'}`}>
              <button
                onClick={handleDelete}
                disabled={deletePending}
                className={btnDanger}
              >
                {deletePending ? 'Deleting...' : 'Delete invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

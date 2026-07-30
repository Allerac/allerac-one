'use client';

import { useTheme } from '@/app/context/ThemeContext';
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import * as expensesActions from '@/app/actions/expenses';
import type { ExpenseInvoice, ExpenseStatus, RecurrenceInterval } from '@/app/actions/expenses';
import ExpenseDashboard from './ExpenseDashboard';
import ExpenseCalendar from './ExpenseCalendar';
import ExpenseAnalytics from './ExpenseAnalytics';
import TaxFilings from './TaxFilings';
import type { TaxFiling } from '@/app/actions/taxFilings';

interface ExpensesClientProps {
  initialExpenses: ExpenseInvoice[];
  initialTaxFilings: TaxFiling[];
}

interface FormValues {
  provider: string;
  invoice_number: string;
  invoice_date: string;
  billing_period_month: string; // '01'-'12', or '' if not set
  billing_period_year: string; // e.g. '2026', or '' if not set
  currency: string;
  amount: string;
  status: ExpenseStatus;
  tag: string;
  is_recurring: boolean;
  recurrence_interval: RecurrenceInterval | '';
}

const EMPTY_FORM: FormValues = {
  provider: '',
  invoice_number: '',
  invoice_date: '',
  billing_period_month: '',
  billing_period_year: '',
  currency: 'EUR',
  amount: '',
  status: 'pending',
  tag: '',
  is_recurring: false,
  recurrence_interval: '',
};

const RECURRENCE_LABEL: Record<RecurrenceInterval, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Expands a month + year pair into the first and last calendar day. Takes
 * separate select/number inputs (not <input type="month">) since that input
 * type isn't natively supported in Firefox — it silently falls back to a
 * freeform text field there, so an unrecognized value gets dropped instead
 * of parsed. */
function monthToRange(year: string, month: string): { start: string; end: string } {
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) return { start: '', end: '' };
  const y = Number(year);
  const m = Number(month);
  if (m < 1 || m > 12) return { start: '', end: '' };
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: `${year}-${month}-01`,
    end: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

function buildFormData(values: FormValues, file: File | null): FormData {
  const { start, end } = monthToRange(values.billing_period_year, values.billing_period_month);
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
  fd.append('is_recurring', String(values.is_recurring));
  fd.append('recurrence_interval', values.recurrence_interval);
  if (file) fd.append('file', file);
  return fd;
}

const STATUS_LABEL: Record<ExpenseStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};

const UNTAGGED_FILTER = '__untagged__';

export default function ExpensesClient({ initialExpenses, initialTaxFilings }: ExpensesClientProps) {
  const { isDark: isDarkMode, toggleDark } = useTheme();
  const d = isDarkMode;

  const [expenses, setExpenses] = useState<ExpenseInvoice[]>(initialExpenses);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'invoices' | 'calendar' | 'analytics' | 'taxes'>('dashboard');

  const providerSuggestions = useMemo(
    () => Array.from(new Set(expenses.map(e => e.provider))).sort(),
    [expenses]
  );
  const tagSuggestions = useMemo(
    () => Array.from(new Set(expenses.map(e => e.tag).filter((t): t is string => !!t))).sort(),
    [expenses]
  );
  const monthOptions = useMemo(() => {
    const months = Array.from(new Set(expenses.map(e => e.invoice_date.slice(0, 7)))).sort().reverse();
    return months.map(monthKey => {
      const [year, month] = monthKey.split('-').map(Number);
      const label = new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      return { value: monthKey, label };
    });
  }, [expenses]);

  const [filterProvider, setFilterProvider] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterStatus, setFilterStatus] = useState<ExpenseStatus | ''>('');
  const hasActiveFilters = !!(filterProvider || filterTag || filterMonth || filterStatus);
  const clearFilters = () => {
    setFilterProvider('');
    setFilterTag('');
    setFilterMonth('');
    setFilterStatus('');
  };
  const filteredExpenses = expenses.filter(e => (
    (!filterProvider || e.provider === filterProvider)
    && (!filterTag || (filterTag === UNTAGGED_FILTER ? !e.tag : e.tag === filterTag))
    && (!filterMonth || e.invoice_date.slice(0, 7) === filterMonth)
    && (!filterStatus || e.status === filterStatus)
  ));

  const exportUrl = (() => {
    const params = new URLSearchParams();
    if (filterProvider) params.set('provider', filterProvider);
    if (filterTag) params.set('tag', filterTag);
    if (filterMonth) params.set('month', filterMonth);
    if (filterStatus) params.set('status', filterStatus);
    const qs = params.toString();
    return qs ? `/api/expenses/export?${qs}` : '/api/expenses/export';
  })();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createValues, setCreateValues] = useState<FormValues>(EMPTY_FORM);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createFile, setCreateFile] = useState<File | null>(null);
  const createFileRef = useRef<HTMLInputElement>(null);
  const createCameraRef = useRef<HTMLInputElement>(null);

  const [editValues, setEditValues] = useState<FormValues>(EMPTY_FORM);
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState('');
  const [deletePending, setDeletePending] = useState(false);
  const [editFile, setEditFile] = useState<File | null>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
  const editCameraRef = useRef<HTMLInputElement>(null);

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
    setCreateFile(null);
    setShowCreateModal(true);
  };

  const openDetailModal = (expense: ExpenseInvoice) => {
    setSelectedId(expense.id);
    setEditValues({
      provider: expense.provider,
      invoice_number: expense.invoice_number,
      invoice_date: expense.invoice_date.slice(0, 10),
      billing_period_year: expense.billing_period_start?.slice(0, 4) ?? '',
      billing_period_month: expense.billing_period_start?.slice(5, 7) ?? '',
      currency: expense.currency,
      amount: String(expense.amount),
      status: expense.status,
      tag: expense.tag ?? '',
      is_recurring: expense.is_recurring,
      recurrence_interval: expense.recurrence_interval ?? '',
    });
    setEditError('');
    setEditFile(null);
  };

  const closeDetailModal = () => setSelectedId(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatePending(true);
    setCreateError('');
    const fd = buildFormData(createValues, createFile);
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
    const fd = buildFormData(editValues, editFile);
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
          <div className="grid grid-cols-5 sm:flex gap-0.5 -mb-px">
            {(['dashboard', 'invoices', 'calendar', 'analytics', 'taxes'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center justify-center sm:justify-start gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? d ? 'border-indigo-400 text-indigo-300' : 'border-indigo-600 text-indigo-600'
                    : d ? 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {tab === 'dashboard' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />}
                  {tab === 'invoices' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />}
                  {tab === 'calendar' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />}
                  {tab === 'analytics' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 20V10M12 20V4M6 20v-6" />}
                  {tab === 'taxes' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />}
                </svg>
                <span className="hidden sm:inline">
                  {tab === 'dashboard' ? 'Dashboard' : tab === 'invoices' ? 'Invoices' : tab === 'calendar' ? 'Calendar' : tab === 'analytics' ? 'Analytics' : 'Taxes'}
                </span>
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
              <div className="flex gap-2">
                <a
                  href={exportUrl}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${d ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
                  {hasActiveFilters ? 'Export filtered' : 'Export ZIP'}
                </a>
                <button
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add invoice
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <div>
                <label className={labelCls}>Provider</label>
                <select
                  value={filterProvider}
                  onChange={e => setFilterProvider(e.target.value)}
                  className={inputCls}
                >
                  <option value="">All providers</option>
                  {providerSuggestions.map(provider => <option key={provider} value={provider}>{provider}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Tag</label>
                <select
                  value={filterTag}
                  onChange={e => setFilterTag(e.target.value)}
                  className={inputCls}
                >
                  <option value="">All tags</option>
                  <option value={UNTAGGED_FILTER}>Untagged</option>
                  {tagSuggestions.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Month</label>
                <select
                  value={filterMonth}
                  onChange={e => setFilterMonth(e.target.value)}
                  className={inputCls}
                >
                  <option value="">All months</option>
                  {monthOptions.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value as ExpenseStatus | '')}
                  className={inputCls}
                >
                  <option value="">All statuses</option>
                  {(Object.keys(STATUS_LABEL) as ExpenseStatus[]).map(status => (
                    <option key={status} value={status}>{STATUS_LABEL[status]}</option>
                  ))}
                </select>
              </div>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className={`col-span-2 sm:col-span-4 text-xs text-left hover:underline ${textMuted}`}
                >
                  Clear filters ({filteredExpenses.length} of {expenses.length})
                </button>
              )}
            </div>

            {/* Mobile: compact card list */}
            <div className="space-y-2 md:hidden">
              {filteredExpenses.length === 0 && (
                <p className={`text-sm text-center py-6 ${textMuted}`}>
                  {hasActiveFilters ? 'No invoices match these filters.' : 'No invoices registered yet.'}
                </p>
              )}
              {filteredExpenses.map(expense => (
                <div
                  key={expense.id}
                  onClick={() => openDetailModal(expense)}
                  className={`border rounded-lg p-3 cursor-pointer transition-colors ${cardBg} ${d ? 'hover:bg-gray-700/40' : 'hover:bg-gray-100/70'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-1 min-w-0">
                      <p className="font-medium truncate">{expense.provider}</p>
                      {expense.has_file && (
                        <svg className={`w-3 h-3 shrink-0 ${textMuted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Has attached file"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                      )}
                    </span>
                    <p className="font-semibold shrink-0">{expense.currency} {Number(expense.amount).toFixed(2)}</p>
                  </div>
                  <div className={`flex items-center gap-1.5 mt-1 text-xs ${textMuted}`}>
                    <span className="font-mono truncate">{expense.invoice_number}</span>
                    {formatBillingPeriod(expense) && <span className="shrink-0">· {formatBillingPeriod(expense)}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <span className={`text-xs ${textMuted}`}>{expense.invoice_date.slice(0, 10)}</span>
                    <div className="flex items-center gap-1.5">
                      {expense.tag && (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] ${d ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                          {expense.tag}
                        </span>
                      )}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadgeCls(expense.status)}`}>
                        {STATUS_LABEL[expense.status]}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className={`hidden md:block border rounded-lg overflow-hidden ${cardBg}`}>
              <table className="w-full text-sm">
                <thead>
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
                <tbody>
                  {filteredExpenses.length === 0 && (
                    <tr>
                      <td colSpan={7} className={`px-4 py-6 text-center text-sm ${textMuted}`}>
                        {hasActiveFilters ? 'No invoices match these filters.' : 'No invoices registered yet.'}
                      </td>
                    </tr>
                  )}
                  {filteredExpenses.map((expense, i) => (
                    <tr
                      key={expense.id}
                      onClick={() => openDetailModal(expense)}
                      className={`cursor-pointer border-b last:border-0 transition-colors ${d ? 'border-gray-700 hover:bg-gray-700/40' : 'border-gray-100 hover:bg-gray-100/70'} ${
                        i % 2 === 0 ? '' : d ? 'bg-gray-800/50' : 'bg-gray-50/50'
                      }`}
                    >
                      <td className="px-4 py-3 font-medium">
                        <span className="flex items-center gap-1.5">
                          {expense.provider}
                          {expense.has_file && (
                            <svg className={`w-3 h-3 shrink-0 ${textMuted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Has attached file"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{expense.invoice_number}</td>
                      <td className="px-4 py-3">
                        {expense.tag ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${d ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                            {expense.tag}
                          </span>
                        ) : (
                          <span className={textMuted}>—</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-xs ${textMuted}`}>
                        {formatBillingPeriod(expense) ?? '—'}
                      </td>
                      <td className={`px-4 py-3 text-xs ${textMuted}`}>
                        {expense.invoice_date.slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {expense.currency} {Number(expense.amount).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
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
          <ExpenseCalendar expenses={expenses} isDarkMode={d} onSelectExpense={openDetailModal} />
        ) : activeTab === 'analytics' ? (
          <ExpenseAnalytics expenses={expenses} isDarkMode={d} />
        ) : (
          <TaxFilings initialFilings={initialTaxFilings} isDarkMode={d} />
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
                <div className="col-span-2 grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Billing period month <span className={`font-normal ${textMuted}`}>(optional)</span></label>
                    <select
                      value={createValues.billing_period_month}
                      onChange={e => setCreateValues(prev => ({ ...prev, billing_period_month: e.target.value }))}
                      disabled={createPending}
                      className={inputCls}
                    >
                      <option value="">—</option>
                      {MONTH_NAMES.map((name, i) => (
                        <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Billing period year</label>
                    <input
                      type="number"
                      placeholder="2026"
                      value={createValues.billing_period_year}
                      onChange={e => setCreateValues(prev => ({ ...prev, billing_period_year: e.target.value }))}
                      disabled={createPending}
                      className={inputCls}
                    />
                  </div>
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
                <div className="col-span-2 flex items-end gap-3">
                  <label className={`flex items-center gap-2 cursor-pointer select-none ${d ? 'text-gray-300' : 'text-gray-700'}`}>
                    <input
                      type="checkbox"
                      checked={createValues.is_recurring}
                      onChange={e => setCreateValues(prev => ({ ...prev, is_recurring: e.target.checked, recurrence_interval: e.target.checked ? prev.recurrence_interval : '' }))}
                      disabled={createPending}
                      className="w-4 h-4 rounded accent-indigo-600"
                    />
                    <span className="text-sm">Recurring</span>
                  </label>
                  {createValues.is_recurring && (
                    <select
                      value={createValues.recurrence_interval}
                      onChange={e => setCreateValues(prev => ({ ...prev, recurrence_interval: e.target.value as RecurrenceInterval }))}
                      disabled={createPending}
                      className={`${inputCls} flex-1`}
                    >
                      <option value="">Select periodicity…</option>
                      {(Object.keys(RECURRENCE_LABEL) as RecurrenceInterval[]).map(interval => (
                        <option key={interval} value={interval}>{RECURRENCE_LABEL[interval]}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Invoice file <span className={`font-normal ${textMuted}`}>(PDF, JPEG or PNG, optional)</span></label>
                  <div className="flex flex-wrap gap-2">
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
                      Attach file
                    </button>
                    <button
                      type="button"
                      onClick={() => createCameraRef.current?.click()}
                      disabled={createPending}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors disabled:opacity-50 ${
                        d ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 17a4 4 0 100-8 4 4 0 000 8z" />
                      </svg>
                      Take photo
                    </button>
                  </div>
                  {createFile && <p className={`text-xs mt-1.5 truncate ${textMuted}`}>{createFile.name}</p>}
                  <input
                    ref={createFileRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    disabled={createPending}
                    onChange={e => setCreateFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                  <input
                    ref={createCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={createPending}
                    onChange={e => setCreateFile(e.target.files?.[0] ?? null)}
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
                <div className="col-span-2 grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Billing period month <span className={`font-normal ${textMuted}`}>(optional)</span></label>
                    <select
                      value={editValues.billing_period_month}
                      onChange={e => setEditValues(prev => ({ ...prev, billing_period_month: e.target.value }))}
                      disabled={editPending}
                      className={inputCls}
                    >
                      <option value="">—</option>
                      {MONTH_NAMES.map((name, i) => (
                        <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Billing period year</label>
                    <input
                      type="number"
                      placeholder="2026"
                      value={editValues.billing_period_year}
                      onChange={e => setEditValues(prev => ({ ...prev, billing_period_year: e.target.value }))}
                      disabled={editPending}
                      className={inputCls}
                    />
                  </div>
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
                <div className="col-span-2 flex items-end gap-3">
                  <label className={`flex items-center gap-2 cursor-pointer select-none ${d ? 'text-gray-300' : 'text-gray-700'}`}>
                    <input
                      type="checkbox"
                      checked={editValues.is_recurring}
                      onChange={e => setEditValues(prev => ({ ...prev, is_recurring: e.target.checked, recurrence_interval: e.target.checked ? prev.recurrence_interval : '' }))}
                      disabled={editPending}
                      className="w-4 h-4 rounded accent-indigo-600"
                    />
                    <span className="text-sm">Recurring</span>
                  </label>
                  {editValues.is_recurring && (
                    <select
                      value={editValues.recurrence_interval}
                      onChange={e => setEditValues(prev => ({ ...prev, recurrence_interval: e.target.value as RecurrenceInterval }))}
                      disabled={editPending}
                      className={`${inputCls} flex-1`}
                    >
                      <option value="">Select periodicity…</option>
                      {(Object.keys(RECURRENCE_LABEL) as RecurrenceInterval[]).map(interval => (
                        <option key={interval} value={interval}>{RECURRENCE_LABEL[interval]}</option>
                      ))}
                    </select>
                  )}
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
                  <div className="flex flex-wrap gap-2">
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
                      {selectedExpense.has_file ? 'Replace file' : 'Attach file'}
                    </button>
                    <button
                      type="button"
                      onClick={() => editCameraRef.current?.click()}
                      disabled={editPending}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors disabled:opacity-50 ${
                        d ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 17a4 4 0 100-8 4 4 0 000 8z" />
                      </svg>
                      Take photo
                    </button>
                  </div>
                  {editFile && <p className={`text-xs mt-1.5 truncate ${textMuted}`}>{editFile.name}</p>}
                  <input
                    ref={editFileRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    disabled={editPending}
                    onChange={e => setEditFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                  <input
                    ref={editCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={editPending}
                    onChange={e => setEditFile(e.target.files?.[0] ?? null)}
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

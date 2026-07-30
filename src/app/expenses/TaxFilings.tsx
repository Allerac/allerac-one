'use client';

import { useMemo, useRef, useState } from 'react';
import * as taxFilingActions from '@/app/actions/taxFilings';
import type { TaxFiling } from '@/app/actions/taxFilings';

interface Props {
  initialFilings: TaxFiling[];
  isDarkMode: boolean;
}

type FilingStatus = 'filed' | 'pending' | 'overdue';

function computeStatus(filing: TaxFiling): FilingStatus {
  if (filing.submitted_date) return 'filed';
  const today = new Date().toISOString().slice(0, 10);
  return filing.due_date < today ? 'overdue' : 'pending';
}

const STATUS_LABEL: Record<FilingStatus, string> = {
  filed: 'Filed',
  pending: 'Pending',
  overdue: 'Overdue',
};

interface FormValues {
  period_year: string;
  period_quarter: string;
  filing_type: string;
  due_date: string;
  submitted_date: string;
  notes: string;
}

const EMPTY_FORM: FormValues = {
  period_year: String(new Date().getFullYear()),
  period_quarter: String(Math.floor(new Date().getMonth() / 3) + 1),
  filing_type: '',
  due_date: '',
  submitted_date: '',
  notes: '',
};

function buildFormData(values: FormValues, file: File | null): FormData {
  const fd = new FormData();
  fd.append('period_year', values.period_year);
  fd.append('period_quarter', values.period_quarter);
  fd.append('filing_type', values.filing_type);
  fd.append('due_date', values.due_date);
  fd.append('submitted_date', values.submitted_date);
  fd.append('notes', values.notes);
  if (file) fd.append('file', file);
  return fd;
}

export default function TaxFilings({ initialFilings, isDarkMode: d }: Props) {
  const [filings, setFilings] = useState<TaxFiling[]>(initialFilings);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const filingTypeSuggestions = useMemo(
    () => Array.from(new Set(filings.map(f => f.filing_type))).sort(),
    [filings]
  );

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

  const selectedFiling = filings.find(f => f.id === selectedId) ?? null;

  const refreshFilings = async () => {
    const updated = await taxFilingActions.listTaxFilings();
    setFilings(updated);
  };

  const openCreateModal = () => {
    setCreateValues(EMPTY_FORM);
    setCreateError('');
    setCreateFile(null);
    setShowCreateModal(true);
  };

  const openDetailModal = (filing: TaxFiling) => {
    setSelectedId(filing.id);
    setEditValues({
      period_year: String(filing.period_year),
      period_quarter: String(filing.period_quarter),
      filing_type: filing.filing_type,
      due_date: filing.due_date.slice(0, 10),
      submitted_date: filing.submitted_date?.slice(0, 10) ?? '',
      notes: filing.notes ?? '',
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
    const result = await taxFilingActions.createTaxFiling(fd);
    setCreatePending(false);
    if (result.success) {
      setShowCreateModal(false);
      refreshFilings();
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
    const result = await taxFilingActions.updateTaxFiling(selectedId, fd);
    setEditPending(false);
    if (result.success) {
      await refreshFilings();
      closeDetailModal();
    } else {
      setEditError(result.error);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    setDeletePending(true);
    const result = await taxFilingActions.deleteTaxFiling(selectedId);
    setDeletePending(false);
    if (result.success) {
      setFilings(prev => prev.filter(x => x.id !== selectedId));
      closeDetailModal();
    } else {
      setEditError(result.error);
    }
  };

  const statusBadgeCls = (status: FilingStatus) => {
    if (status === 'filed') return d ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-green-700';
    if (status === 'overdue') return d ? 'bg-red-900/40 text-red-400' : 'bg-red-50 text-red-600';
    return d ? 'bg-yellow-900/40 text-yellow-400' : 'bg-yellow-50 text-yellow-700';
  };

  return (
    <>
      <datalist id="tax-filing-type-suggestions">
        {filingTypeSuggestions.map(type => <option key={type} value={type} />)}
      </datalist>

      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-sm font-semibold uppercase tracking-wider ${textMuted}`}>Tax Filings</h2>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add filing
        </button>
      </div>

      {/* Mobile: compact card list */}
      <div className="space-y-2 md:hidden">
        {filings.length === 0 && (
          <p className={`text-sm text-center py-6 ${textMuted}`}>No tax filings registered yet.</p>
        )}
        {filings.map(filing => {
          const status = computeStatus(filing);
          return (
            <div
              key={filing.id}
              onClick={() => openDetailModal(filing)}
              className={`border rounded-lg p-3 cursor-pointer transition-colors ${cardBg} ${d ? 'hover:bg-gray-700/40' : 'hover:bg-gray-100/70'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex items-center gap-1 min-w-0">
                  <p className="font-medium truncate">Q{filing.period_quarter} {filing.period_year} · {filing.filing_type}</p>
                  {filing.has_file && (
                    <svg className={`w-3 h-3 shrink-0 ${textMuted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Has attached file"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                  )}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ${statusBadgeCls(status)}`}>
                  {STATUS_LABEL[status]}
                </span>
              </div>
              <div className={`flex items-center justify-between mt-1.5 text-xs ${textMuted}`}>
                <span>Due {filing.due_date.slice(0, 10)}</span>
                <span>{filing.submitted_date ? `Filed ${filing.submitted_date.slice(0, 10)}` : 'Not filed yet'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: table */}
      <div className={`hidden md:block border rounded-lg overflow-hidden ${cardBg}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className={`border-b text-xs ${d ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
              <th className="px-4 py-3 text-left font-medium">Period</th>
              <th className="px-4 py-3 text-left font-medium">Filing type</th>
              <th className="px-4 py-3 text-left font-medium">Due date</th>
              <th className="px-4 py-3 text-left font-medium">Submitted</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filings.length === 0 && (
              <tr>
                <td colSpan={5} className={`px-4 py-6 text-center text-sm ${textMuted}`}>
                  No tax filings registered yet.
                </td>
              </tr>
            )}
            {filings.map((filing, i) => {
              const status = computeStatus(filing);
              return (
                <tr
                  key={filing.id}
                  onClick={() => openDetailModal(filing)}
                  className={`cursor-pointer border-b last:border-0 transition-colors ${d ? 'border-gray-700 hover:bg-gray-700/40' : 'border-gray-100 hover:bg-gray-100/70'} ${
                    i % 2 === 0 ? '' : d ? 'bg-gray-800/50' : 'bg-gray-50/50'
                  }`}
                >
                  <td className="px-4 py-3 font-medium">Q{filing.period_quarter} {filing.period_year}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      {filing.filing_type}
                      {filing.has_file && (
                        <svg className={`w-3 h-3 shrink-0 ${textMuted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Has attached file"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                      )}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-xs ${textMuted}`}>{filing.due_date.slice(0, 10)}</td>
                  <td className={`px-4 py-3 text-xs ${textMuted}`}>{filing.submitted_date?.slice(0, 10) ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadgeCls(status)}`}>
                      {STATUS_LABEL[status]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create filing modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreateModal(false)} />
          <div className={`relative w-full max-w-lg rounded-2xl border shadow-2xl overflow-y-auto max-h-[90vh] ${cardBg}`}>
            <div className={`sticky top-0 flex items-center justify-between px-6 py-4 border-b ${d ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
              <h2 className={`font-semibold text-sm ${text}`}>Add Tax Filing</h2>
              <button onClick={() => setShowCreateModal(false)} className={`p-1.5 rounded-lg transition-colors ${d ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Year</label>
                  <input
                    type="number"
                    value={createValues.period_year}
                    onChange={e => setCreateValues(prev => ({ ...prev, period_year: e.target.value }))}
                    required
                    autoFocus
                    disabled={createPending}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Quarter</label>
                  <select
                    value={createValues.period_quarter}
                    onChange={e => setCreateValues(prev => ({ ...prev, period_quarter: e.target.value }))}
                    disabled={createPending}
                    className={inputCls}
                  >
                    {[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Filing type</label>
                  <input
                    value={createValues.filing_type}
                    onChange={e => setCreateValues(prev => ({ ...prev, filing_type: e.target.value }))}
                    placeholder="Modelo 303 (IVA), Modelo 130 (IRPF)…"
                    list="tax-filing-type-suggestions"
                    required
                    disabled={createPending}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Due date</label>
                  <input
                    type="date"
                    value={createValues.due_date}
                    onChange={e => setCreateValues(prev => ({ ...prev, due_date: e.target.value }))}
                    required
                    disabled={createPending}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Submitted date <span className={`font-normal ${textMuted}`}>(optional)</span></label>
                  <input
                    type="date"
                    value={createValues.submitted_date}
                    onChange={e => setCreateValues(prev => ({ ...prev, submitted_date: e.target.value }))}
                    disabled={createPending}
                    className={inputCls}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Notes <span className={`font-normal ${textMuted}`}>(optional)</span></label>
                  <input
                    value={createValues.notes}
                    onChange={e => setCreateValues(prev => ({ ...prev, notes: e.target.value }))}
                    disabled={createPending}
                    className={inputCls}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Proof of submission <span className={`font-normal ${textMuted}`}>(PDF, JPEG or PNG, optional)</span></label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => createFileRef.current?.click()}
                      disabled={createPending}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors disabled:opacity-50 ${d ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                      Attach file
                    </button>
                    <button
                      type="button"
                      onClick={() => createCameraRef.current?.click()}
                      disabled={createPending}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors disabled:opacity-50 ${d ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 17a4 4 0 100-8 4 4 0 000 8z" />
                      </svg>
                      Take photo
                    </button>
                  </div>
                  {createFile && <p className={`text-xs mt-1.5 truncate ${textMuted}`}>{createFile.name}</p>}
                  <input ref={createFileRef} type="file" accept="application/pdf,image/jpeg,image/png" disabled={createPending} onChange={e => setCreateFile(e.target.files?.[0] ?? null)} className="hidden" />
                  <input ref={createCameraRef} type="file" accept="image/*" capture="environment" disabled={createPending} onChange={e => setCreateFile(e.target.files?.[0] ?? null)} className="hidden" />
                </div>
              </div>

              {createError && <p className="text-sm text-red-400">{createError}</p>}

              <button type="submit" disabled={createPending} className={`${btnPrimary} w-full`}>
                {createPending ? 'Saving...' : 'Add filing'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Detail / edit filing modal */}
      {selectedFiling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeDetailModal} />
          <div className={`relative w-full max-w-lg rounded-2xl border shadow-2xl overflow-y-auto max-h-[90vh] ${cardBg}`}>
            <div className={`sticky top-0 flex items-center justify-between px-6 py-4 border-b ${d ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
              <h2 className={`font-semibold text-sm ${text}`}>Q{selectedFiling.period_quarter} {selectedFiling.period_year} · {selectedFiling.filing_type}</h2>
              <button onClick={closeDetailModal} className={`p-1.5 rounded-lg transition-colors ${d ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleEdit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Year</label>
                  <input
                    type="number"
                    value={editValues.period_year}
                    onChange={e => setEditValues(prev => ({ ...prev, period_year: e.target.value }))}
                    required
                    disabled={editPending}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Quarter</label>
                  <select
                    value={editValues.period_quarter}
                    onChange={e => setEditValues(prev => ({ ...prev, period_quarter: e.target.value }))}
                    disabled={editPending}
                    className={inputCls}
                  >
                    {[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Filing type</label>
                  <input
                    value={editValues.filing_type}
                    onChange={e => setEditValues(prev => ({ ...prev, filing_type: e.target.value }))}
                    list="tax-filing-type-suggestions"
                    required
                    disabled={editPending}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Due date</label>
                  <input
                    type="date"
                    value={editValues.due_date}
                    onChange={e => setEditValues(prev => ({ ...prev, due_date: e.target.value }))}
                    required
                    disabled={editPending}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Submitted date <span className={`font-normal ${textMuted}`}>(optional)</span></label>
                  <input
                    type="date"
                    value={editValues.submitted_date}
                    onChange={e => setEditValues(prev => ({ ...prev, submitted_date: e.target.value }))}
                    disabled={editPending}
                    className={inputCls}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Notes <span className={`font-normal ${textMuted}`}>(optional)</span></label>
                  <input
                    value={editValues.notes}
                    onChange={e => setEditValues(prev => ({ ...prev, notes: e.target.value }))}
                    disabled={editPending}
                    className={inputCls}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>
                    Proof of submission <span className={`font-normal ${textMuted}`}>(PDF, JPEG or PNG — leave empty to keep current)</span>
                  </label>
                  {selectedFiling.has_file && (
                    <a
                      href={`/api/tax-filings/${selectedFiling.id}/file`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-400 font-medium mb-2"
                    >
                      View current file: {selectedFiling.file_name ?? 'proof'}
                    </a>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => editFileRef.current?.click()}
                      disabled={editPending}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors disabled:opacity-50 ${d ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                      {selectedFiling.has_file ? 'Replace file' : 'Attach file'}
                    </button>
                    <button
                      type="button"
                      onClick={() => editCameraRef.current?.click()}
                      disabled={editPending}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors disabled:opacity-50 ${d ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 17a4 4 0 100-8 4 4 0 000 8z" />
                      </svg>
                      Take photo
                    </button>
                  </div>
                  {editFile && <p className={`text-xs mt-1.5 truncate ${textMuted}`}>{editFile.name}</p>}
                  <input ref={editFileRef} type="file" accept="application/pdf,image/jpeg,image/png" disabled={editPending} onChange={e => setEditFile(e.target.files?.[0] ?? null)} className="hidden" />
                  <input ref={editCameraRef} type="file" accept="image/*" capture="environment" disabled={editPending} onChange={e => setEditFile(e.target.files?.[0] ?? null)} className="hidden" />
                </div>
              </div>

              {editError && <p className="text-sm text-red-400">{editError}</p>}

              <button type="submit" disabled={editPending} className={`${btnPrimary} w-full`}>
                {editPending ? 'Saving...' : 'Save changes'}
              </button>
            </form>

            <div className={`px-6 pb-6 pt-2 border-t flex justify-end ${d ? 'border-gray-700' : 'border-gray-200'}`}>
              <button onClick={handleDelete} disabled={deletePending} className={btnDanger}>
                {deletePending ? 'Deleting...' : 'Delete filing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

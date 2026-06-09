'use client';

import { useTheme } from '@/app/context/ThemeContext';
import { useState, useEffect, useTransition } from 'react';
import * as adminActions from '@/app/actions/admin';
import type { AdminUser, AdminDomain, InstagramAccountEntry, ApiKeyAuditEntry } from '@/app/actions/admin';
import type { SystemSettings } from '@/app/services/system/system-settings.service';
import ApiKeyField from '@/app/components/settings/ApiKeyField';

interface AdminClientProps {
  initialUsers: AdminUser[];
  initialDomains: AdminDomain[];
  initialAllDomains: AdminDomain[];
  initialSystemSettings: SystemSettings;
  initialInstagramAccounts: InstagramAccountEntry[];
  initialConnectedAdmins: Array<{ id: string; email: string; username: string }>;
}

export default function AdminClient({
  initialUsers, initialDomains, initialAllDomains,
  initialSystemSettings, initialInstagramAccounts, initialConnectedAdmins,
}: AdminClientProps) {
  const { isDark: isDarkMode, toggleDark } = useTheme();
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [domains] = useState<AdminDomain[]>(initialDomains);
  const [allDomains, setAllDomains] = useState<AdminDomain[]>(initialAllDomains);
  const [domainTogglingId, setDomainTogglingId] = useState<string | null>(null);

  // System settings state
  const [sysSettings, setSysSettings] = useState<SystemSettings>(initialSystemSettings);
  const [sysSettingsPending, setSysSettingsPending] = useState(false);
  const [sysSettingsMsg, setSysSettingsMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Audit log state
  const [auditLog, setAuditLog] = useState<ApiKeyAuditEntry[]>([]);

  useEffect(() => {
    adminActions.getApiKeyAuditLog(50).then(setAuditLog).catch(() => {});
  }, []);

  // Instagram accounts state
  const [igAccounts, setIgAccounts] = useState<InstagramAccountEntry[]>(initialInstagramAccounts);
  const [connectedAdmins] = useState(initialConnectedAdmins);
  const [igNewLabel, setIgNewLabel] = useState('');
  const [igNewOwner, setIgNewOwner] = useState('');
  const [igRegisterPending, setIgRegisterPending] = useState(false);
  const [igRegisterError, setIgRegisterError] = useState('');
  const [igAssignPending, setIgAssignPending] = useState<string | null>(null);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isPending, startTransition] = useTransition();

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  // Role toggle state
  const [roleChangingId, setRoleChangingId] = useState<string | null>(null);

  // Active toggle state
  const [activeChangingId, setActiveChangingId] = useState<string | null>(null);

  // Domain editor state
  const [domainEditId, setDomainEditId] = useState<string | null>(null);
  const [domainEditSelection, setDomainEditSelection] = useState<string[]>([]);
  const [domainSavePending, setDomainSavePending] = useState(false);

  // Reset password state
  const [resetOpenId, setResetOpenId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetPending, setResetPending] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const [activeTab, setActiveTab] = useState<'users' | 'domains' | 'apikeys' | 'integrations'>('users');

  const toggleTheme = toggleDark;

  const d = isDarkMode;
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

  const refreshUsers = () => {
    startTransition(async () => {
      const updated = await adminActions.listUsers();
      setUsers(updated);
    });
  };

  const toggleDomain = (id: string) => {
    setSelectedDomains(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    startTransition(async () => {
      const result = await adminActions.createDomainUser(email, password, selectedDomains, makeAdmin);
      if (result.success) {
        setFormSuccess('User created successfully.');
        setEmail('');
        setPassword('');
        setSelectedDomains([]);
        setMakeAdmin(false);
        refreshUsers();
      } else {
        setFormError(result.error);
      }
    });
  };

  const openDomainEditor = (user: AdminUser) => {
    setDomainEditId(user.id);
    // Convert slugs back to domain ids for the selection
    setDomainEditSelection(
      domains.filter(d => user.domains.includes(d.slug)).map(d => d.id)
    );
  };

  const handleSaveDomains = async (userId: string) => {
    setDomainSavePending(true);
    const result = await adminActions.updateUserDomains(userId, domainEditSelection);
    setDomainSavePending(false);
    if (result.success) {
      setDomainEditId(null);
      refreshUsers();
    } else {
      setDeleteError(result.error);
    }
  };

  const handleActiveToggle = async (userId: string, isActive: boolean) => {
    setActiveChangingId(userId);
    const result = await adminActions.toggleUserActive(userId, isActive);
    setActiveChangingId(null);
    if (result.success) refreshUsers();
    else setDeleteError(result.error);
  };

  const handleRoleChange = async (userId: string, makeAdmin: boolean) => {
    setRoleChangingId(userId);
    const result = await adminActions.updateUserRole(userId, makeAdmin);
    setRoleChangingId(null);
    if (result.success) refreshUsers();
    else setDeleteError(result.error);
  };

  const handleResetPassword = async (userId: string) => {
    setResetPending(true);
    setResetMsg(null);
    const result = await adminActions.resetUserPassword(userId, resetPassword);
    setResetPending(false);
    if (result.success) {
      setResetMsg({ id: userId, ok: true, text: 'Password updated.' });
      setResetPassword('');
      setResetOpenId(null);
    } else {
      setResetMsg({ id: userId, ok: false, text: result.error });
    }
  };

  const handleSaveSystemSettings = async () => {
    setSysSettingsPending(true);
    setSysSettingsMsg(null);
    const result = await adminActions.saveSystemSettings(sysSettings);
    setSysSettingsPending(false);
    setSysSettingsMsg(result.success ? { ok: true, text: 'Saved.' } : { ok: false, text: (result as any).error });
  };

  const refreshIgAccounts = async () => {
    const updated = await adminActions.listInstagramAccounts();
    setIgAccounts(updated);
  };

  const handleRegisterIgAccount = async () => {
    if (!igNewLabel || !igNewOwner) return;
    setIgRegisterPending(true);
    setIgRegisterError('');
    const result = await adminActions.registerInstagramAccount(igNewOwner, igNewLabel);
    setIgRegisterPending(false);
    if (result.success) { setIgNewLabel(''); setIgNewOwner(''); refreshIgAccounts(); }
    else setIgRegisterError((result as any).error);
  };

  const handleDeleteIgAccount = async (accountId: string) => {
    await adminActions.deleteInstagramAccount(accountId);
    refreshIgAccounts();
  };

  const handleAssignIgAccount = async (userId: string, accountId: string) => {
    setIgAssignPending(userId);
    if (accountId) await adminActions.assignInstagramAccount(userId, accountId);
    else await adminActions.unassignInstagramAccount(userId);
    setIgAssignPending(null);
    refreshIgAccounts();
  };

  const handleDomainToggle = async (domainId: string, isActive: boolean) => {
    setDomainTogglingId(domainId);
    const result = await adminActions.toggleDomainActive(domainId, isActive);
    setDomainTogglingId(null);
    if (result.success) {
      setAllDomains(prev => prev.map(d => d.id === domainId ? { ...d, is_active: isActive } : d));
    }
  };

  const handleDomainMove = async (index: number, direction: 'up' | 'down') => {
    const next = [...allDomains];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= next.length) return;
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    setAllDomains(next);
    await adminActions.reorderDomains(next.map(d => d.id));
  };

  const handleDelete = async (userId: string) => {
    setDeleteError('');
    setDeletingId(userId);
    const result = await adminActions.deleteUser(userId);
    setDeletingId(null);
    if (result.success) {
      setUsers(prev => prev.filter(u => u.id !== userId));
    } else {
      setDeleteError(result.error);
    }
  };

  const tabs = [
    { id: 'users' as const, label: 'Users', count: users.length },
    { id: 'domains' as const, label: 'Domains', count: allDomains.length },
    { id: 'apikeys' as const, label: 'API Keys' },
    { id: 'integrations' as const, label: 'Integrations' },
  ];

  return (
    <div className={`h-full overflow-y-auto ${bg} ${text}`}>
      {/* Header */}
      <div className={`sticky top-0 z-10 border-b ${d ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <h1 className="text-sm font-semibold">Admin</h1>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={toggleTheme} className={`p-1.5 rounded-md transition-colors ${d ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`} title={d ? 'Light mode' : 'Dark mode'}>
                {d ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                )}
              </button>
              <a href="/" className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors ${d ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                Desktop
              </a>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 -mb-px">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? d ? 'border-indigo-400 text-indigo-300' : 'border-indigo-600 text-indigo-600'
                    : d ? 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
                {'count' in tab && tab.count !== undefined && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.id
                      ? d ? 'bg-indigo-900/60 text-indigo-300' : 'bg-indigo-50 text-indigo-600'
                      : d ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
                  }`}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* ── Users tab ── */}
        {activeTab === 'users' && <section>
          <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${textMuted}`}>Users</h2>
          <div className={`border rounded-lg overflow-hidden ${cardBg}`}>
            {deleteError && (
              <div className="px-4 py-2 bg-red-900/30 text-red-400 text-sm border-b border-red-900/40">{deleteError}</div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b text-xs ${d ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Domains</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((user, i) => (
                  <tr
                    key={user.id}
                    className={`border-b last:border-0 ${d ? 'border-gray-700' : 'border-gray-100'} ${
                      i % 2 === 0 ? '' : d ? 'bg-gray-800/50' : 'bg-gray-50/50'
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs">{user.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {user.is_admin ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            d ? 'bg-indigo-900/50 text-indigo-300' : 'bg-indigo-50 text-indigo-700'
                          }`}>Admin</span>
                        ) : (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            d ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                          }`}>Domain</span>
                        )}
                        {!user.is_active && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            d ? 'bg-red-900/40 text-red-400' : 'bg-red-50 text-red-600'
                          }`}>Disabled</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {!user.is_admin && domainEditId === user.id ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap gap-1">
                            {domains.map(domain => {
                              const selected = domainEditSelection.includes(domain.id);
                              return (
                                <button
                                  key={domain.id}
                                  type="button"
                                  onClick={() => setDomainEditSelection(prev =>
                                    selected ? prev.filter(id => id !== domain.id) : [...prev, domain.id]
                                  )}
                                  disabled={domainSavePending}
                                  className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                                    selected
                                      ? 'bg-indigo-600 border-indigo-600 text-white'
                                      : d ? 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                                  }`}
                                >
                                  {domain.slug}
                                </button>
                              );
                            })}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveDomains(user.id)}
                              disabled={domainSavePending}
                              className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors"
                            >
                              {domainSavePending ? '...' : 'Save'}
                            </button>
                            <button
                              onClick={() => setDomainEditId(null)}
                              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${d ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1 items-center">
                          {user.domains.length > 0 ? user.domains.map(slug => (
                            <span key={slug} className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                              d ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                            }`}>{slug}</span>
                          )) : (
                            <span className={textMuted}>—</span>
                          )}
                          {!user.is_admin && (
                            <button
                              onClick={() => openDomainEditor(user)}
                              className={`ml-1 px-2 py-0.5 rounded text-xs transition-colors ${d ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-xs ${textMuted}`}>
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {user.id !== undefined && (
                        <div className="flex flex-col gap-2 items-end">
                          <div className="flex gap-2 flex-wrap justify-end">
                            <button
                              onClick={() => handleActiveToggle(user.id, !user.is_active)}
                              disabled={activeChangingId === user.id}
                              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                user.is_active
                                  ? d ? 'bg-yellow-900/40 text-yellow-400 hover:bg-yellow-900/60' : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                                  : d ? 'bg-green-900/40 text-green-400 hover:bg-green-900/60' : 'bg-green-50 text-green-700 hover:bg-green-100'
                              }`}
                            >
                              {activeChangingId === user.id ? '...' : user.is_active ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              onClick={() => handleRoleChange(user.id, !user.is_admin)}
                              disabled={roleChangingId === user.id}
                              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                user.is_admin
                                  ? d ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  : d ? 'bg-indigo-900/40 text-indigo-300 hover:bg-indigo-900/60' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                              }`}
                            >
                              {roleChangingId === user.id ? '...' : user.is_admin ? 'Make domain' : 'Make admin'}
                            </button>
                            {!user.is_admin && (
                              <button
                                onClick={() => {
                                  setResetOpenId(resetOpenId === user.id ? null : user.id);
                                  setResetPassword('');
                                  setResetMsg(null);
                                }}
                                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                  d ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                Reset password
                              </button>
                            )}
                            {!user.is_admin && (
                              <button
                                onClick={() => handleDelete(user.id)}
                                disabled={deletingId === user.id}
                                className={btnDanger}
                              >
                                {deletingId === user.id ? 'Deleting...' : 'Delete'}
                              </button>
                            )}
                          </div>

                          {resetOpenId === user.id && (
                            <div className="flex gap-2 items-center">
                              <input
                                type="password"
                                value={resetPassword}
                                onChange={e => setResetPassword(e.target.value)}
                                placeholder="New password"
                                disabled={resetPending}
                                className={`px-2 py-1 rounded border text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                                  d ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900'
                                }`}
                              />
                              <button
                                onClick={() => handleResetPassword(user.id)}
                                disabled={resetPending || resetPassword.length < 8}
                                className="px-2 py-1 rounded text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors"
                              >
                                {resetPending ? '...' : 'Save'}
                              </button>
                            </div>
                          )}

                          {resetMsg?.id === user.id && (
                            <p className={`text-xs ${resetMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
                              {resetMsg.text}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        }

        {/* ── Domains tab ── */}
        {activeTab === 'domains' && <section>
          <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${textMuted}`}>Domains</h2>
          <div className={`border rounded-lg overflow-hidden ${cardBg}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b text-xs ${d ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                  <th className="px-4 py-3 text-left font-medium">Order</th>
                  <th className="px-4 py-3 text-left font-medium">Slug</th>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {allDomains.map((domain, i) => (
                  <tr key={domain.id} className={`border-b last:border-0 ${d ? 'border-gray-700' : 'border-gray-100'} ${i % 2 === 0 ? '' : d ? 'bg-gray-800/50' : 'bg-gray-50/50'}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDomainMove(i, 'up')}
                          disabled={i === 0}
                          className={`p-0.5 rounded transition-colors disabled:opacity-20 ${d ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                          title="Move up"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                        </button>
                        <button
                          onClick={() => handleDomainMove(i, 'down')}
                          disabled={i === allDomains.length - 1}
                          className={`p-0.5 rounded transition-colors disabled:opacity-20 ${d ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                          title="Move down"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{domain.slug}</td>
                    <td className="px-4 py-3">{domain.display_name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        domain.is_active
                          ? d ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-green-700'
                          : d ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {domain.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDomainToggle(domain.id, !domain.is_active)}
                        disabled={domainTogglingId === domain.id}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          domain.is_active
                            ? d ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            : d ? 'bg-green-900/40 text-green-400 hover:bg-green-900/60' : 'bg-green-50 text-green-700 hover:bg-green-100'
                        }`}
                      >
                        {domainTogglingId === domain.id ? '...' : domain.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        }

        {/* ── API Keys tab ── */}
        {activeTab === 'apikeys' && <section>
          <h2 className={`text-sm font-semibold uppercase tracking-wider mb-1 ${textMuted}`}>System Settings</h2>
          <p className={`text-xs mb-4 ${textMuted}`}>These keys are used as fallback when users have no personal key configured.</p>

          <div className={`border rounded-lg p-6 ${cardBg} space-y-6`}>
            {/* LLM Providers */}
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-4 ${textMuted}`}>LLM Providers</p>
              <div className="space-y-5">
                <ApiKeyField
                  label="Allerac / GitHub Models"
                  description="(GPT-4o, Ministral, embeddings)"
                  placeholder="ghp_... or similar"
                  provider="github"
                  hasStoredValue={!!sysSettings.github_token}
                  value={sysSettings.github_token ?? ''}
                  onChange={v => setSysSettings(prev => ({ ...prev, github_token: v }))}
                  isDarkMode={isDarkMode}
                  helpText="Used for GitHub Models API (GPT-4o, embeddings)."
                />
                <ApiKeyField
                  label="Anthropic API Key"
                  description="(Claude models)"
                  placeholder="sk-ant-..."
                  provider="anthropic"
                  hasStoredValue={!!sysSettings.anthropic_api_key}
                  value={sysSettings.anthropic_api_key ?? ''}
                  onChange={v => setSysSettings(prev => ({ ...prev, anthropic_api_key: v }))}
                  isDarkMode={isDarkMode}
                  helpText="Default key for Claude (Haiku, Sonnet, Opus)."
                />
                <ApiKeyField
                  label="Google API Key"
                  description="(Gemini models)"
                  placeholder="AIza..."
                  provider="google"
                  hasStoredValue={!!sysSettings.google_api_key}
                  value={sysSettings.google_api_key ?? ''}
                  onChange={v => setSysSettings(prev => ({ ...prev, google_api_key: v }))}
                  isDarkMode={isDarkMode}
                  helpText="Default key for Gemini chat and Gemini Image editing."
                />
              </div>
            </div>

            {/* Services */}
            <div className={`border-t pt-5 ${d ? 'border-gray-700' : 'border-gray-200'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-4 ${textMuted}`}>Services</p>
              <div className="space-y-5">
                <ApiKeyField
                  label="Tavily API Key"
                  description="(web search)"
                  placeholder="tvly-..."
                  provider="tavily"
                  hasStoredValue={!!sysSettings.tavily_api_key}
                  value={sysSettings.tavily_api_key ?? ''}
                  onChange={v => setSysSettings(prev => ({ ...prev, tavily_api_key: v }))}
                  isDarkMode={isDarkMode}
                  helpText="Default key for web search tool."
                />
                <ApiKeyField
                  label="Resend API Key"
                  description="(email sending)"
                  placeholder="re_..."
                  hasStoredValue={!!sysSettings.resend_api_key}
                  value={sysSettings.resend_api_key ?? ''}
                  onChange={v => setSysSettings(prev => ({ ...prev, resend_api_key: v }))}
                  isDarkMode={isDarkMode}
                  helpText="Used to send transactional emails."
                />
                <ApiKeyField
                  label="Resend From Email"
                  description="(sender address)"
                  placeholder="noreply@yourdomain.com"
                  hasStoredValue={!!sysSettings.resend_from_email}
                  value={sysSettings.resend_from_email ?? ''}
                  onChange={v => setSysSettings(prev => ({ ...prev, resend_from_email: v }))}
                  isDarkMode={isDarkMode}
                  inputType="email"
                  helpText="The sender address for outgoing emails."
                />
              </div>
            </div>

            <div className={`flex items-center gap-3 pt-1 border-t ${d ? 'border-gray-700' : 'border-gray-200'}`}>
              <button onClick={handleSaveSystemSettings} disabled={sysSettingsPending} className={btnPrimary}>
                {sysSettingsPending ? 'Saving...' : 'Save Settings'}
              </button>
              {sysSettingsMsg && (
                <p className={`text-sm ${sysSettingsMsg.ok ? 'text-green-400' : 'text-red-400'}`}>{sysSettingsMsg.text}</p>
              )}
            </div>
          </div>
        </section>

        }

        {/* ── Integrations tab ── */}
        {activeTab === 'integrations' && <section>
          <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${textMuted}`}>Instagram Accounts</h2>
          <div className={`border rounded-lg overflow-hidden ${cardBg}`}>
            {/* Registered accounts */}
            {igAccounts.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b text-xs ${d ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                    <th className="px-4 py-3 text-left font-medium">Label</th>
                    <th className="px-4 py-3 text-left font-medium">Account</th>
                    <th className="px-4 py-3 text-left font-medium">Assigned users</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {igAccounts.map((acc, i) => (
                    <tr key={acc.id} className={`border-b last:border-0 ${d ? 'border-gray-700' : 'border-gray-100'} ${i % 2 === 0 ? '' : d ? 'bg-gray-800/50' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-3 font-medium">{acc.label}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs">{acc.username ? `@${acc.username}` : acc.owner_email}</span>
                          <span className={`text-xs ${acc.is_connected ? 'text-green-400' : 'text-red-400'}`}>
                            {acc.is_connected ? 'Connected' : 'Disconnected'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {/* Current assigned users */}
                          <div className="flex flex-wrap gap-1">
                            {acc.assigned_users.map(u => (
                              <span key={u.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${d ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                                {u.email}
                                <button onClick={() => handleAssignIgAccount(u.id, '')} className="ml-0.5 opacity-60 hover:opacity-100">×</button>
                              </span>
                            ))}
                          </div>
                          {/* Assign new user */}
                          <select
                            disabled={igAssignPending !== null}
                            onChange={e => { if (e.target.value) handleAssignIgAccount(e.target.value, acc.id); e.target.value = ''; }}
                            className={`text-xs px-2 py-1 rounded border w-fit ${d ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-white border-gray-300 text-gray-700'}`}
                          >
                            <option value="">+ Assign user…</option>
                            {users.filter(u => !u.is_admin && !acc.assigned_users.find(a => a.id === u.id)).map(u => (
                              <option key={u.id} value={u.id}>{u.email}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleDeleteIgAccount(acc.id)} className={btnDanger}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Register new account */}
            <div className={`p-4 ${igAccounts.length > 0 ? `border-t ${d ? 'border-gray-700' : 'border-gray-200'}` : ''}`}>
              <p className={`text-xs font-medium mb-3 ${textMuted}`}>Register a connected Instagram account as shared</p>
              {connectedAdmins.length === 0 ? (
                <p className={`text-sm ${textMuted}`}>No admin has an active Instagram connection yet. Connect Instagram in Settings first.</p>
              ) : (
                <div className="flex flex-wrap gap-2 items-end">
                  <div>
                    <label className={labelCls}>Label</label>
                    <input value={igNewLabel} onChange={e => setIgNewLabel(e.target.value)} placeholder="@loja_principal" disabled={igRegisterPending} className={`${inputCls} w-48`} />
                  </div>
                  <div>
                    <label className={labelCls}>Account owner</label>
                    <select value={igNewOwner} onChange={e => setIgNewOwner(e.target.value)} disabled={igRegisterPending} className={`px-3 py-2 rounded-md border text-sm ${d ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}>
                      <option value="">Select admin…</option>
                      {connectedAdmins.map(a => (
                        <option key={a.id} value={a.id}>{a.email} (@{a.username})</option>
                      ))}
                    </select>
                  </div>
                  <button onClick={handleRegisterIgAccount} disabled={igRegisterPending || !igNewLabel || !igNewOwner} className={btnPrimary}>
                    {igRegisterPending ? 'Registering...' : 'Register'}
                  </button>
                </div>
              )}
              {igRegisterError && <p className="text-sm text-red-400 mt-2">{igRegisterError}</p>}
            </div>
          </div>
        </section>
        }

        {/* ── Create user (Users tab) ── */}
        {activeTab === 'users' && <section>
          <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${textMuted}`}>Create Domain User</h2>
          <div className={`border rounded-lg p-6 ${cardBg}`}>
            <form onSubmit={handleCreate} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    required
                    disabled={isPending}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    required
                    disabled={isPending}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className={`flex items-center gap-2 cursor-pointer select-none ${d ? 'text-gray-300' : 'text-gray-700'}`}>
                  <input
                    type="checkbox"
                    checked={makeAdmin}
                    onChange={e => { setMakeAdmin(e.target.checked); setSelectedDomains([]); }}
                    disabled={isPending}
                    className="w-4 h-4 rounded accent-indigo-600"
                  />
                  <span className="text-sm">Admin user</span>
                </label>
              </div>

              {!makeAdmin && (
                <div>
                  <label className={labelCls}>Domains</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {domains.map(domain => {
                      const selected = selectedDomains.includes(domain.id);
                      return (
                        <button
                          key={domain.id}
                          type="button"
                          onClick={() => toggleDomain(domain.id)}
                          disabled={isPending}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                            selected
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : d
                                ? 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {domain.display_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {formError && <p className="text-sm text-red-400">{formError}</p>}
              {formSuccess && <p className="text-sm text-green-400">{formSuccess}</p>}

              <div>
                <button type="submit" disabled={isPending} className={btnPrimary}>
                  {isPending ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </section>

        }

        {/* ── Audit Log (API Keys tab) ── */}
        {activeTab === 'apikeys' && <section>
          <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${textMuted}`}>API Key Audit Log</h2>
          <div className={`border rounded-lg overflow-hidden ${cardBg}`}>
            {auditLog.length === 0 ? (
              <p className={`px-6 py-4 text-sm ${textMuted}`}>No key changes recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b text-xs ${d ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                    <th className="px-4 py-3 text-left font-medium">When</th>
                    <th className="px-4 py-3 text-left font-medium">Scope</th>
                    <th className="px-4 py-3 text-left font-medium">Key</th>
                    <th className="px-4 py-3 text-left font-medium">Action</th>
                    <th className="px-4 py-3 text-left font-medium">User</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((entry, i) => (
                    <tr key={entry.id} className={`border-b last:border-0 ${d ? 'border-gray-700' : 'border-gray-100'} ${i % 2 === 0 ? '' : d ? 'bg-gray-800/50' : 'bg-gray-50/50'}`}>
                      <td className={`px-4 py-2.5 text-xs ${textMuted}`}>
                        {new Date(entry.changed_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                          entry.scope === 'system'
                            ? d ? 'bg-purple-900/40 text-purple-300' : 'bg-purple-50 text-purple-700'
                            : d ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700'
                        }`}>
                          {entry.scope}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 font-mono text-xs ${d ? 'text-gray-300' : 'text-gray-700'}`}>
                        {entry.key_name}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                          entry.action === 'set'
                            ? d ? 'bg-green-900/40 text-green-300' : 'bg-green-50 text-green-700'
                            : d ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {entry.action}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-xs ${textMuted}`}>
                        {entry.user_email ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
        }

      </div>
    </div>
  );
}

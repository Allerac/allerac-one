'use client';

import { useState, useEffect, useTransition } from 'react';
import * as adminActions from '@/app/actions/admin';
import type { AdminUser, AdminDomain } from '@/app/actions/admin';

interface AdminClientProps {
  initialUsers: AdminUser[];
  initialDomains: AdminDomain[];
}

export default function AdminClient({ initialUsers, initialDomains }: AdminClientProps) {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [domains] = useState<AdminDomain[]>(initialDomains);

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

  useEffect(() => {
    const saved = localStorage.getItem('chatTheme');
    setIsDarkMode(saved !== 'light');
  }, []);

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

  return (
    <div className={`min-h-dvh ${bg} ${text}`}>
      {/* Header */}
      <div className={`border-b ${d ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h1 className="text-lg font-semibold">Admin Panel</h1>
          </div>
          <a
            href="/"
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-colors ${
              d ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Desktop
          </a>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* Users table */}
        <section>
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

        {/* Create user form */}
        <section>
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

      </div>
    </div>
  );
}

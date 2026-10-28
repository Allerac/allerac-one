'use client';

import { useCallback, useEffect, useState } from 'react';

// Admin-only Settings > Discovery: pair this Unit with other Allerac Units
// (federation P2). Keys are never shown: the API does not return them.

type PeerStatus = 'pending_outbound' | 'pending_inbound' | 'active' | 'rejected' | 'expired' | 'revoked';

export interface PeerDto {
  id: string;
  unitName: string;
  displayName: string | null;
  origin: string;
  initiatedByUs: boolean;
  status: PeerStatus;
  inboundCapabilities: string[];
  outboundCapabilities: string[];
  verificationCode: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface ManifestPreview {
  origin: string;
  manifest: {
    unit: { name: string; displayName: string; url: string | null };
    software: { release: string };
    pairing: { accepting: boolean };
    capabilities: { id: string; version: string }[];
  };
}

interface DiscoveryTabProps {
  isDarkMode: boolean;
}

// Capabilities this Unit can grant (mirrors src/federation/capabilities.ts).
export const GRANTABLE_CAPABILITIES: { id: string; label: string }[] = [
  { id: 'federation.agents.list', label: 'List agents' },
  { id: 'federation.agents.ask', label: 'Ask agents' },
  { id: 'federation.runs.create', label: 'Create agent runs' },
  { id: 'federation.runs.read', label: 'Read agent runs' },
  { id: 'federation.manifest.read', label: 'Read manifest details' },
];

const STATUS_LABELS: Record<PeerStatus, string> = {
  pending_outbound: 'Waiting for approval',
  pending_inbound: 'Needs your approval',
  active: 'Paired',
  rejected: 'Rejected',
  expired: 'Expired',
  revoked: 'Revoked',
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || 'Request failed.');
  return body?.data as T;
}

const post = (body?: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

function CapabilityPicker({
  options, selected, onChange, muted, name,
}: {
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  muted: string;
  name: string;
}) {
  if (options.length === 0) return <p className={`text-xs ${muted}`}>No capabilities available.</p>;
  return (
    <div className="flex flex-wrap gap-3" role="group" aria-label={name}>
      {options.map(option => (
        <label key={option.id} className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={selected.includes(option.id)}
            onChange={event => onChange(event.target.checked
              ? [...selected, option.id]
              : selected.filter(id => id !== option.id))}
          />
          <span>{option.label}</span>
          <code className={muted}>{option.id}</code>
        </label>
      ))}
    </div>
  );
}

function labelFor(id: string): string {
  return GRANTABLE_CAPABILITIES.find(c => c.id === id)?.label ?? id;
}

export default function DiscoveryTab({ isDarkMode }: DiscoveryTabProps) {
  const [peers, setPeers] = useState<PeerDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<ManifestPreview | null>(null);
  const [requested, setRequested] = useState<string[]>([]);
  const [grants, setGrants] = useState<string[]>(['federation.agents.list', 'federation.agents.ask']);
  const [busy, setBusy] = useState(false);
  const [inboundGrants, setInboundGrants] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    try {
      const data = await api<{ peers: PeerDto[] }>('/api/v1/peers', { cache: 'no-store' });
      setPeers(data.peers);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load Units.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = () => run(async () => {
    const data = await api<ManifestPreview>('/api/v1/peers/discover', post({ url }));
    setPreview(data);
    setRequested(data.manifest.capabilities.map(c => c.id));
  });

  const handlePair = () => run(async () => {
    if (!preview) return;
    await api('/api/v1/peers', post({ url: preview.origin, grants, requested }));
    setPreview(null);
    setUrl('');
    await load();
  });

  const handleAccept = (peer: PeerDto) => run(async () => {
    await api(`/api/v1/peers/${peer.id}/accept`, post({ grants: inboundGrants[peer.id] ?? peer.inboundCapabilities }));
    await load();
  });

  const handleReject = (peer: PeerDto) => run(async () => {
    await api(`/api/v1/peers/${peer.id}/reject`, post());
    await load();
  });

  const handleRevoke = (peer: PeerDto) => {
    const action = peer.status === 'active' ? 'Disconnect from' : 'Cancel pairing with';
    if (!window.confirm(`${action} “${peer.displayName ?? peer.unitName}”? It will lose access to this Unit immediately.`)) return;
    void run(async () => {
      await api(`/api/v1/peers/${peer.id}`, { method: 'DELETE' });
      await load();
    });
  };

  const panel = isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50';
  const text = isDarkMode ? 'text-gray-200' : 'text-gray-800';
  const muted = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const field = isDarkMode
    ? 'border-gray-600 bg-gray-700 text-gray-100 placeholder-gray-400'
    : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400';
  const button = 'rounded-md bg-brand-900 px-3 py-2 text-sm text-white disabled:opacity-50';
  const secondary = `rounded-md border px-3 py-1.5 text-xs ${isDarkMode ? 'border-gray-600' : 'border-gray-300'} disabled:opacity-50`;

  const inbound = peers.filter(peer => peer.status === 'pending_inbound');
  const others = peers.filter(peer => peer.status !== 'pending_inbound');

  const code = (value: string | null) => value && (
    <span className="font-mono text-lg tracking-widest" aria-label="Verification code">{value}</span>
  );

  return (
    <div className={`space-y-6 ${text}`}>
      <div>
        <h3 className={`text-base font-semibold ${text}`}>Discovery</h3>
        <p className={`mt-1 text-sm ${muted}`}>
          Pair this Unit with other Allerac Units. Nothing is shared until an admin on the other Unit accepts.
          Compare the verification code on both Units before accepting.
        </p>
      </div>

      {error && (
        <div role="alert" className={`rounded-md border p-3 text-sm ${isDarkMode ? 'border-red-500/40 bg-red-900/20 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {error}
        </div>
      )}

      <div className={`rounded-lg border p-4 space-y-3 ${panel}`}>
        <h3 className={text}>Add a Unit</h3>
        <div className="flex gap-2">
          <input
            aria-label="Unit URL"
            value={url}
            onChange={event => { setUrl(event.target.value); setPreview(null); }}
            placeholder="https://unit2.example.com"
            className={`min-w-0 flex-1 rounded-md border px-3 py-2 text-sm ${field}`}
          />
          <button type="button" className={button} disabled={busy || !url.trim()} onClick={() => void handlePreview()}>
            Look up
          </button>
        </div>

        {preview && (
          <div className="space-y-3">
            <p className="text-sm">
              <strong>{preview.manifest.unit.displayName}</strong>{' '}
              <span className={muted}>({preview.manifest.unit.name} · {preview.origin} · v{preview.manifest.software.release})</span>
            </p>
            {!preview.manifest.pairing.accepting ? (
              <p className={`text-sm ${muted}`}>This Unit is not accepting pairing requests.</p>
            ) : (
              <>
                <div className="space-y-1">
                  <p className={`text-xs font-semibold ${muted}`}>Request access to</p>
                  <CapabilityPicker
                    name="Request access to"
                    options={preview.manifest.capabilities.map(c => ({ id: c.id, label: labelFor(c.id) }))}
                    selected={requested}
                    onChange={setRequested}
                    muted={muted}
                  />
                </div>
                <div className="space-y-1">
                  <p className={`text-xs font-semibold ${muted}`}>Allow this Unit to</p>
                  <CapabilityPicker name="Allow this Unit to" options={GRANTABLE_CAPABILITIES} selected={grants} onChange={setGrants} muted={muted} />
                </div>
                <button type="button" className={button} disabled={busy} onClick={() => void handlePair()}>
                  Send pairing request
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {inbound.length > 0 && (
        <div className={`rounded-lg border p-4 space-y-4 ${panel}`}>
          <h3 className={text}>Pairing requests</h3>
          {inbound.map(peer => (
            <div key={peer.id} className="space-y-2" data-testid={`inbound-${peer.id}`}>
              <p className="text-sm">
                <strong>{peer.displayName ?? peer.unitName}</strong> <span className={muted}>{peer.origin}</span>
              </p>
              <p className="text-sm">Verification code: {code(peer.verificationCode)}</p>
              <p className={`text-xs ${muted}`}>Accept only if the other Unit shows the same code.</p>
              <CapabilityPicker
                name={`Allow ${peer.unitName} to`}
                options={GRANTABLE_CAPABILITIES}
                selected={inboundGrants[peer.id] ?? peer.inboundCapabilities}
                onChange={next => setInboundGrants(current => ({ ...current, [peer.id]: next }))}
                muted={muted}
              />
              <div className="flex gap-2">
                <button type="button" className={button} disabled={busy} onClick={() => void handleAccept(peer)}>Accept</button>
                <button type="button" className={secondary} disabled={busy} onClick={() => void handleReject(peer)}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={`rounded-lg border p-4 space-y-3 ${panel}`}>
        <h3 className={text}>Units</h3>
        {loading ? (
          <p className={`text-sm ${muted}`}>Loading…</p>
        ) : others.length === 0 ? (
          <p className={`text-sm ${muted}`}>No paired Units yet.</p>
        ) : (
          <ul className="space-y-3">
            {others.map(peer => (
              <li key={peer.id} className="flex flex-wrap items-start justify-between gap-2" data-testid={`peer-${peer.id}`}>
                <div className="space-y-1 text-sm">
                  <p>
                    <strong>{peer.displayName ?? peer.unitName}</strong> <span className={muted}>{peer.origin}</span>
                  </p>
                  <p className={`text-xs ${muted}`}>{STATUS_LABELS[peer.status]}</p>
                  {peer.status === 'pending_outbound' && (
                    <p className="text-sm">Verification code: {code(peer.verificationCode)}</p>
                  )}
                  {peer.status === 'active' && (
                    <p className={`text-xs ${muted}`}>
                      They can: {peer.inboundCapabilities.map(labelFor).join(', ') || 'nothing'} · You can: {peer.outboundCapabilities.map(labelFor).join(', ') || 'nothing'}
                    </p>
                  )}
                </div>
                {(peer.status === 'active' || peer.status === 'pending_outbound') && (
                  <button type="button" className={secondary} disabled={busy} onClick={() => handleRevoke(peer)}>
                    {peer.status === 'active' ? 'Disconnect' : 'Cancel'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

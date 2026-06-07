'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { ALLERAC_DOMAINS, getDomainByKey, type AlleracDomain } from './allerac-domains';
import { useTheme } from '@/app/context/ThemeContext';
import { updateLanguage } from '@/app/actions/user';
import DomainSkillsModal from '@/app/components/hub/DomainSkillsModal';
import ConfigModal from './ConfigModal';

const LANGUAGES = [
  { code: 'en', label: 'English'   },
  { code: 'es', label: 'Español'   },
  { code: 'pt', label: 'Português' },
  { code: 'ca', label: 'Català'    },
];

const OPEN_DOMAINS_KEY = 'allerac_open_domains';

interface Props {
  domainKey: string;
  domainName: string;
  domainIcon: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  isAdmin: boolean;
  allowedDomains: string[];
  onLogout: () => void;
}

// ── Win95 border helpers ──────────────────────────────────────────────────────
const RAISED  = '#ffffff #808080 #808080 #ffffff';
const SUNKEN  = '#808080 #ffffff #ffffff #808080';
const TRAY_BG = '#c0c0c0';

export default function AlleracTaskbar({ domainKey, domainName, domainIcon, userId, userName, userEmail, isAdmin, allowedDomains, onLogout }: Props) {
  const router = useRouter();
  const { isDark, toggleDark } = useTheme();
  const locale = useLocale();
  const [langPending, startLangTransition] = useTransition();
  const [time, setTime]               = useState('');
  const [startOpen, setStartOpen]     = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [openDomains, setOpenDomains] = useState<string[]>([]);
  const [domainsModalOpen, setDomainsModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen]   = useState(false);
  const [windowsOpen, setWindowsOpen]           = useState(false);
  const [isMobile, setIsMobile]                 = useState(false);

  const startRef   = useRef<HTMLDivElement>(null);
  const userRef    = useRef<HTMLDivElement>(null);
  const windowsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Clock ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));
    };
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, []);

  // ── Track open domains in sessionStorage ('hub' = desktop, no chip) ───────
  useEffect(() => {
    if (domainKey === 'hub') {
      setOpenDomains(JSON.parse(sessionStorage.getItem(OPEN_DOMAINS_KEY) ?? '[]'));
      return;
    }
    const stored: string[] = JSON.parse(sessionStorage.getItem(OPEN_DOMAINS_KEY) ?? '[]');
    const updated = stored.includes(domainKey) ? stored : [...stored, domainKey];
    sessionStorage.setItem(OPEN_DOMAINS_KEY, JSON.stringify(updated));
    setOpenDomains(updated);
  }, [domainKey]);

  // ── Close menus on outside click ──────────────────────────────────────────
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (startRef.current && !startRef.current.contains(e.target as Node))     setStartOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node))       setUserMenuOpen(false);
      if (windowsRef.current && !windowsRef.current.contains(e.target as Node)) setWindowsOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const navigate = (path: string) => {
    setStartOpen(false);
    router.push(path);
  };

  const closeDomain = (key: string) => {
    const updated = openDomains.filter(k => k !== key);
    sessionStorage.setItem(OPEN_DOMAINS_KEY, JSON.stringify(updated));
    setOpenDomains(updated);

    if (key === domainKey) {
      const next = updated[updated.length - 1];
      router.push(next ? (getDomainByKey(next)?.path ?? '/') : '/');
    }
  };

  const initials = (userName || userEmail).slice(0, 2).toUpperCase();

  // ── Button style helpers ──────────────────────────────────────────────────
  const taskBtn = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 5,
    background: TRAY_BG, border: '2px solid',
    borderColor: active ? SUNKEN : RAISED,
    padding: '2px 10px', height: 28, cursor: 'pointer',
    fontFamily: '"Press Start 2P", monospace', fontSize: 8, color: '#000',
    flexShrink: 0, userSelect: 'none',
  });

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />

      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center',
        background: TRAY_BG,
        borderTop: '2px solid #ffffff',
        padding: '2px 4px',
        height: 'calc(36px + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'calc(2px + env(safe-area-inset-bottom, 0px))',
        gap: 6, position: 'relative', zIndex: 10000,
      }}>

        {/* ── Start button ─────────────────────────────────────────────── */}
        <div ref={startRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setStartOpen(v => !v)}
            style={{
              ...taskBtn(startOpen),
              fontWeight: 'bold',
            }}
          >
            <img src="/icon-nobg-purple.svg" alt="Allerac" style={{ width: 16, height: 16 }} />
            <span>Start</span>
          </button>

          {/* Start Menu */}
          {startOpen && (
            <div style={{
              position: 'absolute', bottom: 34, left: 0,
              width: 220,
              background: TRAY_BG,
              border: '2px solid', borderColor: RAISED,
              boxShadow: '2px 2px 0 #000',
              display: 'flex', zIndex: 200,
            }}>
              {/* Left decorative strip */}
              <div style={{
                width: 28, background: '#4338ca',
                display: 'flex', alignItems: 'flex-end',
                justifyContent: 'center', paddingBottom: 8,
              }}>
                <span style={{
                  fontFamily: '"Press Start 2P", monospace', fontSize: 7,
                  color: TRAY_BG, writingMode: 'vertical-rl',
                  transform: 'rotate(180deg)', letterSpacing: 2,
                }}>Allerac</span>
              </div>

              {/* Menu items */}
              <div style={{ flex: 1, padding: '4px 0' }}>
                {ALLERAC_DOMAINS.filter(d => allowedDomains.includes(d.key)).map(d => (
                  <StartMenuItem key={d.key} icon={d.icon} label={d.name} onClick={() => navigate(d.path)} />
                ))}
                {isAdmin && (
                  <>
                    <div style={{ height: 1, background: '#808080', margin: '4px 8px', borderBottom: '1px solid #fff' }} />
                    <StartMenuItem icon="📡" label="Monitor" onClick={() => { setStartOpen(false); window.open('/logs', 'allerac-monitor', 'width=860,height=640,menubar=no,toolbar=no,location=no,status=no,resizable=yes'); }} />
                    <StartMenuItem icon="⚙️" label="Configuration" onClick={() => { setStartOpen(false); setConfigModalOpen(true); }} />
                    <StartMenuItem icon="🌐" label="Domains" onClick={() => { setStartOpen(false); setDomainsModalOpen(true); }} />
                    <StartMenuItem icon="🔧" label="Admin" onClick={() => navigate('/admin')} />
                    <div style={{ height: 1, background: '#808080', margin: '4px 8px', borderBottom: '1px solid #fff' }} />
                    <StartMenuItem icon="🖥️" label="Desktop" onClick={() => navigate('/')} />
                  </>
                )}
                <div style={{ height: 1, background: '#808080', margin: '4px 8px', borderBottom: '1px solid #fff' }} />
                <StartMenuItem icon="🔌" label="Shut Down..." onClick={() => { setStartOpen(false); onLogout(); }} />
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: '#808080', borderRight: '1px solid #fff', flexShrink: 0 }} />

        {/* ── Open domain windows ──────────────────────────────────────── */}
        {isMobile ? (
          /* Mobile: compact dropdown */
          openDomains.length > 0 && (
            <div ref={windowsRef} style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={() => setWindowsOpen(v => !v)}
                style={{
                  ...taskBtn(windowsOpen),
                  gap: 4, padding: '2px 8px',
                }}
              >
                <span style={{ fontSize: 13, lineHeight: 1 }}>{domainIcon}</span>
                {openDomains.length > 1 && (
                  <span style={{
                    background: '#4338ca', color: '#fff',
                    fontSize: 7, padding: '1px 4px',
                    fontFamily: '"Press Start 2P", monospace',
                  }}>
                    +{openDomains.length - 1}
                  </span>
                )}
              </button>

              {windowsOpen && (
                <div style={{
                  position: 'absolute', bottom: 34, left: 0,
                  minWidth: 180, background: TRAY_BG,
                  border: '2px solid', borderColor: RAISED,
                  boxShadow: '2px 2px 0 #000', zIndex: 200,
                }}>
                  {openDomains.map(key => {
                    const d = getDomainByKey(key);
                    if (!d) return null;
                    const active = key === domainKey;
                    return (
                      <WindowsDropdownItem
                        key={key}
                        domain={d}
                        active={active}
                        onNavigate={() => { setWindowsOpen(false); navigate(d.path); }}
                        onClose={() => closeDomain(key)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )
        ) : (
          /* Desktop: individual chips */
          openDomains.map(key => {
            const d = getDomainByKey(key);
            if (!d) return null;
            const active = key === domainKey;
            return (
              <DomainChip
                key={key}
                domain={d}
                active={active}
                onNavigate={() => navigate(d.path)}
                onClose={() => closeDomain(key)}
              />
            );
          })
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* ── Desktop (Hub) button — admin only ───────────────────────── */}
        {isAdmin && (
          <>
            <button
              onClick={() => navigate('/')}
              title="Desktop (Hub)"
              style={{
                ...taskBtn(false),
                padding: '2px 6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="1" />
                <path d="M8 21h8M12 17v4" />
              </svg>
            </button>
            <div style={{ width: 1, height: 24, background: '#808080', borderRight: '1px solid #fff', flexShrink: 0 }} />
          </>
        )}

        {/* ── System tray ──────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          border: '1px solid', borderColor: SUNKEN,
          padding: '2px 8px', height: 28,
        }}>
          {/* Theme toggle */}
          <button
            onClick={toggleDark}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}
          >
            {isDark ? '☀️' : '🌙'}
          </button>

          <div style={{ width: 1, height: 16, background: '#808080', borderRight: '1px solid #fff' }} />

          {/* Clock */}
          <span style={{ fontSize: 8, fontFamily: '"Press Start 2P", monospace', color: '#000', flexShrink: 0 }}>
            {time}
          </span>

          <div style={{ width: 1, height: 16, background: '#808080', borderRight: '1px solid #fff' }} />

          {/* User avatar */}
          <div ref={userRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              title={userEmail}
              style={{
                width: 20, height: 20, borderRadius: '50%',
                background: '#4338ca', color: '#fff',
                fontSize: 8, fontWeight: 'bold',
                border: '1px solid #333', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Arial, sans-serif',
              }}
            >
              {initials}
            </button>

            {userMenuOpen && (
              <div style={{
                position: 'absolute', bottom: 26, right: 0, minWidth: 180,
                background: TRAY_BG, border: '2px solid', borderColor: RAISED,
                boxShadow: '2px 2px 0 #000', zIndex: 10000,
              }}>
                <div style={{ padding: '8px 12px', borderBottom: '1px solid #808080' }}>
                  {userName && (
                    <div style={{ fontSize: 11, fontWeight: 'bold', color: '#000', fontFamily: 'Arial, sans-serif' }}>
                      {userName}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: '#555', fontFamily: 'Arial, sans-serif' }}>{userEmail}</div>
                </div>

                {/* Language selector */}
                <div style={{ padding: '6px 12px', borderBottom: '1px solid #808080' }}>
                  <div style={{ fontSize: 9, color: '#555', fontFamily: 'Arial, sans-serif', marginBottom: 4 }}>
                    Language
                  </div>
                  <select
                    value={locale}
                    disabled={langPending}
                    onChange={e => {
                      const newLocale = e.target.value;
                      startLangTransition(async () => {
                        await updateLanguage(newLocale);
                        window.location.reload();
                      });
                    }}
                    style={{
                      width: '100%', padding: '3px 6px',
                      border: '1px solid', borderColor: '#808080 #fff #fff #808080',
                      background: '#fff', color: '#000', fontSize: 11,
                      fontFamily: 'Arial, sans-serif', cursor: 'pointer',
                      opacity: langPending ? 0.5 : 1,
                    }}
                  >
                    {LANGUAGES.map(l => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => { setUserMenuOpen(false); onLogout(); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '6px 12px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 11, fontFamily: 'Arial, sans-serif', color: '#000', textAlign: 'left',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#4338ca'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#000'; }}
                >
                  🔌 Shut Down...
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

      <DomainSkillsModal
        isOpen={domainsModalOpen}
        onClose={() => setDomainsModalOpen(false)}
        userId={userId}
        isDarkMode={isDark}
      />

      <ConfigModal
        isOpen={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        userId={userId}
        userName={userName}
        userEmail={userEmail}
        isDarkMode={isDark}
      />
    </>
  );
}

// ── Domain chip (open window button) ─────────────────────────────────────────
function DomainChip({ domain, active, onNavigate, onClose }: {
  domain: AlleracDomain; active: boolean;
  onNavigate: () => void; onClose: () => void;
}) {
  const [closeHovered, setCloseHovered] = useState(false);

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      background: TRAY_BG, border: '2px solid',
      borderColor: active ? SUNKEN : RAISED,
      height: 28, flexShrink: 0, overflow: 'hidden',
    }}>
      {/* Label — click to navigate */}
      <button
        onClick={onNavigate}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '0 6px 0 8px', height: '100%',
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: '"Press Start 2P", monospace', fontSize: 8, color: '#000',
        }}
      >
        <span style={{ fontSize: 13, lineHeight: 1 }}>{domain.icon}</span>
        <span>{domain.name}</span>
      </button>

      {/* Win95-style close button */}
      <button
        onClick={e => { e.stopPropagation(); onClose(); }}
        onMouseEnter={() => setCloseHovered(true)}
        onMouseLeave={() => setCloseHovered(false)}
        title={`Close ${domain.name}`}
        style={{
          width: 16, height: 16, marginRight: 3,
          background: closeHovered ? '#c0c0c0' : TRAY_BG,
          border: '1px solid',
          borderColor: closeHovered ? SUNKEN : RAISED,
          cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontFamily: 'Arial, sans-serif', color: '#000',
          lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  );
}

// ── Windows dropdown item (mobile) ───────────────────────────────────────────
function WindowsDropdownItem({ domain, active, onNavigate, onClose }: {
  domain: AlleracDomain; active: boolean;
  onNavigate: () => void; onClose: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [closeHovered, setCloseHovered] = useState(false);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center',
        background: hovered ? '#4338ca' : active ? '#d4d0cc' : 'none',
        borderBottom: '1px solid #d4d0cc',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onNavigate}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left',
          fontFamily: 'Arial, sans-serif', fontSize: 12,
          color: hovered ? '#fff' : '#000',
        }}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>{domain.icon}</span>
        <span style={{ fontWeight: active ? 'bold' : 'normal' }}>{domain.name}</span>
        {active && <span style={{ fontSize: 9, color: hovered ? '#c7d2fe' : '#4338ca', marginLeft: 'auto' }}>●</span>}
      </button>
      <button
        onClick={e => { e.stopPropagation(); onClose(); }}
        onMouseEnter={() => setCloseHovered(true)}
        onMouseLeave={() => setCloseHovered(false)}
        style={{
          width: 24, height: '100%', minHeight: 30,
          background: closeHovered ? '#c00' : 'none',
          border: 'none', cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, color: closeHovered ? '#fff' : hovered ? '#fff' : '#555',
        }}
      >✕</button>
    </div>
  );
}

// ── Start Menu item ───────────────────────────────────────────────────────────
function StartMenuItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '5px 12px',
        background: hovered ? '#4338ca' : 'none',
        border: 'none', cursor: 'pointer',
        fontSize: 11, fontFamily: 'Arial, sans-serif',
        color: hovered ? '#fff' : '#000', textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1, width: 18, textAlign: 'center' }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

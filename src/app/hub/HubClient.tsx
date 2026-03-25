'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import * as authActions from '@/app/actions/auth';

const DOMAINS = [
  { id: 'chat',    label: 'Chat',    icon: '💬', path: '/',         desc: 'General assistant' },
  { id: 'code',    label: 'Code',    icon: '💻', path: '/code',     desc: 'Programmer mode' },
  { id: 'recipes', label: 'Recipes', icon: '🍳', path: '/recipes',  desc: 'Chef & nutrition' },
  { id: 'search',  label: 'Search',  icon: '🔍', path: '/search',   desc: 'Web research' },
  { id: 'finance', label: 'Finance', icon: '💰', path: '/finance',  desc: 'Financial advisor' },
  { id: 'health',  label: 'Health',  icon: '❤️', path: '/health',   desc: 'Health & wellness' },
  { id: 'write',   label: 'Write',   icon: '✍️', path: '/write',    desc: 'Writer & editor' },
  { id: 'analyze', label: 'Analyze', icon: '📊', path: '/analyze',  desc: 'Data & research' },
];

type ShutdownPhase = 'running' | 'shutting-down' | 'safe-to-turn-off';

export default function HubClient({ userName }: { userName: string }) {
  const router = useRouter();
  const [booting, setBooting] = useState(true);
  const [bootStep, setBootStep] = useState(0);
  const [time, setTime] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [clickCount, setClickCount] = useState<Record<string, number>>({});
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [shutdownPhase, setShutdownPhase] = useState<ShutdownPhase>('running');
  const startMenuRef = useRef<HTMLDivElement>(null);

  const BOOT_LINES = [
    'Allerac OS v1.0',
    'Checking memory... OK',
    'Loading LLM kernel... OK',
    'Initializing agents...',
    '████████████████ 100%',
    'Welcome.',
  ];

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setBootStep(i);
      if (i >= BOOT_LINES.length) {
        clearInterval(interval);
        setTimeout(() => setBooting(false), 500);
      }
    }, 350);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // Close start menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (startMenuRef.current && !startMenuRef.current.contains(e.target as Node)) {
        setStartMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDesktopClick = () => {
    setSelected(null);
    setStartMenuOpen(false);
  };

  const handleIconClick = (e: React.MouseEvent, domain: typeof DOMAINS[0]) => {
    e.stopPropagation();
    setStartMenuOpen(false);
    const count = (clickCount[domain.id] || 0) + 1;
    setClickCount(c => ({ ...c, [domain.id]: count }));
    setSelected(domain.id);

    if (count >= 2) {
      router.push(domain.path);
    } else {
      setTimeout(() => {
        setClickCount(c => ({ ...c, [domain.id]: 0 }));
      }, 600);
    }
  };

  const handleShutDown = async () => {
    setStartMenuOpen(false);
    setShutdownPhase('shutting-down');

    // Call logout in background
    authActions.logout().catch(() => {});

    // After 2.5s show "safe to turn off"
    setTimeout(() => {
      setShutdownPhase('safe-to-turn-off');

      // After another 2.5s redirect to login
      setTimeout(() => {
        router.push('/');
      }, 2500);
    }, 2500);
  };

  // ── Boot screen ──────────────────────────────────────────────────────────
  if (booting) {
    return (
      <div style={{
        background: '#000',
        color: '#aaa',
        fontFamily: '"Courier New", monospace',
        fontSize: '14px',
        height: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
      }}>
        <div style={{ maxWidth: 480, width: '100%' }}>
          {BOOT_LINES.slice(0, bootStep).map((line, i) => (
            <div key={i} style={{ marginBottom: 6, color: i === bootStep - 1 ? '#fff' : '#666' }}>
              {line}
            </div>
          ))}
          {bootStep > 0 && bootStep <= BOOT_LINES.length && (
            <span style={{ color: '#fff' }}>█</span>
          )}
        </div>
      </div>
    );
  }

  // ── Shutdown: "Windows is shutting down…" ────────────────────────────────
  if (shutdownPhase === 'shutting-down') {
    return (
      <div style={{
        background: '#000c5a',
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '32px',
        fontFamily: '"Press Start 2P", monospace',
      }}>
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />
        <img src="/icon-nobg.svg" alt="Allerac" style={{ width: 64, height: 64, opacity: 0.9 }} />
        <div style={{ color: '#fff', fontSize: '13px', textAlign: 'center', lineHeight: 2 }}>
          Allerac is shutting down...
        </div>
        <div style={{ color: '#aaa', fontSize: '9px', textAlign: 'center', lineHeight: 2 }}>
          Please wait while your session is ended.
        </div>
      </div>
    );
  }

  // ── Shutdown: "It is now safe…" ──────────────────────────────────────────
  if (shutdownPhase === 'safe-to-turn-off') {
    return (
      <div style={{
        background: '#000',
        height: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"Press Start 2P", monospace',
      }}>
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />
        <div style={{
          background: '#000c5a',
          border: '3px solid #fff',
          padding: '32px 48px',
          textAlign: 'center',
          maxWidth: '420px',
        }}>
          <div style={{ color: '#fff', fontSize: '11px', lineHeight: 2.2 }}>
            It is now safe to<br />turn off your computer.
          </div>
        </div>
      </div>
    );
  }

  // ── Desktop ──────────────────────────────────────────────────────────────
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />
      <div
        onClick={handleDesktopClick}
        style={{
          background: '#008080',
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          userSelect: 'none',
          fontFamily: 'Arial, sans-serif',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Desktop icon area */}
        <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', overflowY: 'auto' }}>
          {DOMAINS.map(domain => (
            <DesktopIcon
              key={domain.id}
              domain={domain}
              selected={selected === domain.id}
              onClick={(e) => handleIconClick(e, domain)}
            />
          ))}
        </div>

        {/* Start menu (above taskbar) */}
        {startMenuOpen && (
          <div
            ref={startMenuRef}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: '36px',
              left: '0',
              width: '220px',
              background: '#c0c0c0',
              border: '2px solid',
              borderColor: '#ffffff #808080 #808080 #ffffff',
              boxShadow: '2px 2px 0 #000',
              display: 'flex',
              zIndex: 100,
            }}
          >
            {/* Left decorative strip */}
            <div style={{
              width: '28px',
              background: '#000080',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              paddingBottom: '8px',
            }}>
              <span style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: '7px',
                color: '#c0c0c0',
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                letterSpacing: '2px',
              }}>
                Allerac
              </span>
            </div>

            {/* Menu items */}
            <div style={{ flex: 1, padding: '4px 0' }}>
              <StartMenuItem icon="💬" label="Chat" onClick={() => { setStartMenuOpen(false); router.push('/'); }} />
              <div style={{ height: '1px', background: '#808080', margin: '4px 8px', borderBottom: '1px solid #fff' }} />
              <StartMenuItem icon="🔌" label="Shut Down..." onClick={handleShutDown} />
            </div>
          </div>
        )}

        {/* Taskbar */}
        <div style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#c0c0c0',
          borderTop: '2px solid #ffffff',
          padding: '2px 8px 2px 2px',
          height: '36px',
          gap: '8px',
          position: 'relative',
          zIndex: 99,
        }}>
          {/* Start button */}
          <button
            onClick={e => { e.stopPropagation(); setStartMenuOpen(v => !v); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: startMenuOpen ? '#808080' : '#c0c0c0',
              border: '2px solid',
              borderColor: startMenuOpen
                ? '#808080 #ffffff #ffffff #808080'
                : '#ffffff #808080 #808080 #ffffff',
              padding: '2px 10px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              height: '28px',
              fontFamily: '"Press Start 2P", monospace',
              flexShrink: 0,
            }}
          >
            <img src="/icon-nobg.svg" alt="Allerac" style={{ width: 18, height: 18 }} />
            <span style={{ fontSize: '8px' }}>Start</span>
          </button>

          {/* Divider */}
          <div style={{ width: '1px', height: '24px', background: '#808080', borderRight: '1px solid #fff', flexShrink: 0 }} />

          <div style={{ flex: 1 }} />

          {/* Username */}
          <span style={{
            fontSize: '8px',
            fontFamily: '"Press Start 2P", monospace',
            color: '#000080',
          }}>
            {userName}
          </span>

          <div style={{ width: '1px', height: '24px', background: '#808080', borderRight: '1px solid #fff', flexShrink: 0 }} />

          {/* Clock */}
          <span style={{
            fontSize: '8px',
            fontFamily: '"Press Start 2P", monospace',
            color: '#000',
            flexShrink: 0,
          }}>
            {time}
          </span>
        </div>
      </div>
    </>
  );
}

function StartMenuItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px',
        cursor: 'pointer',
        background: hovered ? '#000080' : 'transparent',
        color: hovered ? '#fff' : '#000',
        fontSize: '12px',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <span style={{ fontSize: '16px' }}>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function DesktopIcon({
  domain,
  selected,
  onClick,
}: {
  domain: typeof DOMAINS[0];
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      title={`${domain.desc} — double-click to open`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: '6px',
        width: '72px',
      }}
    >
      <div style={{
        width: 48,
        height: 48,
        fontSize: '30px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: selected ? 'rgba(0,0,128,0.5)' : 'transparent',
        outline: selected ? '1px dotted #fff' : 'none',
      }}>
        {domain.icon}
      </div>
      <span style={{
        fontSize: '11px',
        textAlign: 'center',
        lineHeight: 1.3,
        color: '#fff',
        textShadow: '1px 1px 1px #000, -1px -1px 1px #000, 1px -1px 1px #000, -1px 1px 1px #000',
        background: selected ? '#000080' : 'transparent',
        padding: '1px 3px',
        display: 'block',
        maxWidth: '70px',
        wordBreak: 'break-word',
        fontFamily: 'Arial, sans-serif',
      }}>
        {domain.label}
      </span>
    </button>
  );
}

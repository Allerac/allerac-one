'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import HubTour from '@/app/components/hub/HubTour';
import AlleracTaskbar from '@/app/components/layout/AlleracTaskbar';
import ClippyAssistant from '@/app/jobs/ClippyAssistant';
import * as authActions from '@/app/actions/auth';

type ShutdownPhase = 'running' | 'shutting-down' | 'safe-to-turn-off';

const DOMAINS_ALL = [
  { id: 'chat',    label: 'Chat',    icon: '💬', path: '/chat',     desc: 'General assistant' },
  { id: 'code',    label: 'Code',    icon: '💻', path: '/code',     desc: 'Programmer mode' },
  { id: 'recipes', label: 'Recipes', icon: '🍳', path: '/recipes',  desc: 'Chef & nutrition' },
  { id: 'finance', label: 'Finance', icon: '💰', path: '/finance',  desc: 'Financial advisor' },
  { id: 'health',  label: 'Health',  icon: '❤️', path: '/health',   desc: 'Health & wellness' },
  { id: 'write',   label: 'Content', icon: '✍️', path: '/write',    desc: 'Content creator' },
  { id: 'social',  label: 'Social',  icon: '📸', path: '/social',   desc: 'Instagram manager' },
  { id: 'tickets', label: 'Tickets', icon: '🎫', path: '/tickets',  desc: 'Bug tracker & tasks' },
  { id: 'design',  label: 'Design',  icon: '🎨', path: '/design',   desc: 'Design system assistant' },
  { id: 'search',  label: 'Search',  icon: '🔍', path: '/search',   desc: 'Web search' },
  { id: 'email',   label: 'Email',   icon: '✉️', path: '/email',    desc: 'Email inbox & AI' },
  { id: 'notes',   label: 'Notes',   icon: '📝', path: '/notes',    desc: 'Personal knowledge base' },
  { id: 'jobs',    label: 'Jobs',    icon: '⏰', path: '/jobs',     desc: 'Scheduled tasks & automation' },
  { id: 'space',   label: 'Space',   icon: '🛰️', path: '/space',   desc: '3D satellite orbit simulator' },
  { id: 'learn',   label: 'Learn',   icon: '🧠', path: '/learn',   desc: 'Interactive model learning lab' },
  { id: 'robot-assistant', label: 'Robot', icon: 'R', path: '/robot-assistant', desc: 'Physical robot assistant' },
  { id: 'benchmark', label: 'Benchmark', icon: 'Q', path: '/benchmark', desc: 'Model quality & performance' },
  { id: 'channels', label: 'Channels', icon: '📡', path: '/channels', desc: 'Messaging channels & bots' },
];

const DOCS_SHORTCUT = {
  id: 'docs',
  label: 'Docs',
  icon: '📚',
  path: '#docs',
  desc: 'Allerac documentation',
};

function getDocsUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_DOCS_URL?.trim();
  if (configuredUrl) return configuredUrl;
  if (typeof window === 'undefined') return 'http://localhost:8000';
  return `http://${window.location.hostname}:8000`;
}

export default function HubClient({ userName, userEmail, userId, completedHubTour, allowedDomains }: { userName: string; userEmail: string; userId: string; completedHubTour: boolean; allowedDomains: string[] }) {
  const router = useRouter();
  const [domains, setDomains] = useState<typeof DOMAINS_ALL>([]);
  const [booting, setBooting] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !sessionStorage.getItem('allerac_booted');
  });
  const [bootStep, setBootStep] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [clickCount, setClickCount] = useState<Record<string, number>>({});
  const [shutdownPhase, setShutdownPhase] = useState<ShutdownPhase>('running');
  const [showTour, setShowTour] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !completedHubTour;
  });
  const [isMobile, setIsMobile] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  useEffect(() => { setGithubToken(localStorage.getItem('github_token') || ''); }, []);

  const BOOT_LINES = [
    'Allerac OS v1.0',
    'Checking memory... OK',
    'Loading LLM kernel... OK',
    'Initializing agents...',
    '████████████████ 100%',
    'Welcome.',
  ];

  useEffect(() => {
    // Fetch visible domains from config
    fetch('/api/domains')
      .then(r => r.json())
      .then(data => {
        const filtered = data.visible
          .map((slug: string) => DOMAINS_ALL.find(d => d.id === slug))
          .filter(Boolean);
        setDomains([...filtered, DOCS_SHORTCUT]);
      })
      .catch(() => setDomains([...DOMAINS_ALL, DOCS_SHORTCUT])); // Fallback to all
  }, []);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setBootStep(i);
      if (i >= BOOT_LINES.length) {
        clearInterval(interval);
        setTimeout(() => {
          sessionStorage.setItem('allerac_booted', '1');
          setBooting(false);
        }, 500);
      }
    }, 350);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 480);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleShutDown = async () => {
    setShutdownPhase('shutting-down');
    sessionStorage.removeItem('allerac_booted');
    authActions.logout().catch(() => {});
    setTimeout(() => {
      setShutdownPhase('safe-to-turn-off');
      setTimeout(() => router.push('/login'), 2500);
    }, 2500);
  };

  const handleDesktopClick = () => {
    setSelected(null);
  };

  const handleIconClick = (e: React.MouseEvent, domain: typeof DOMAINS_ALL[0]) => {
    e.stopPropagation();
    const count = (clickCount[domain.id] || 0) + 1;
    setClickCount(c => ({ ...c, [domain.id]: count }));
    setSelected(domain.id);

    if (count >= 2) {
      if (domain.id === 'docs') {
        window.open(getDocsUrl(), '_blank', 'noopener,noreferrer');
        setClickCount(c => ({ ...c, [domain.id]: 0 }));
      } else if (domain.id === 'logs') {
        // Monitor always opens as a floating window
        window.open(domain.path, 'allerac-monitor', 'width=860,height=640,menubar=no,toolbar=no,location=no,status=no,resizable=yes');
        setClickCount(c => ({ ...c, [domain.id]: 0 }));
      } else {
        fetch('/api/log-submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: 'Navigation', message: `Entered domain: ${domain.label}`, level: 'info' }),
        });
        router.push(domain.path);
      }
    } else {
      setTimeout(() => {
        setClickCount(c => ({ ...c, [domain.id]: 0 }));
      }, 600);
    }
  };

  // ── Shutdown screens ─────────────────────────────────────────────────────
  if (shutdownPhase === 'shutting-down') {
    return (
      <div style={{ background: '#000c5a', height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32, fontFamily: '"Press Start 2P", monospace' }}>
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />
        <img src="/icon-nobg-purple.svg" alt="Allerac" style={{ width: 64, height: 64, opacity: 0.9 }} />
        <div style={{ color: '#fff', fontSize: 13, textAlign: 'center', lineHeight: 2 }}>Allerac is shutting down...</div>
        <div style={{ color: '#aaa', fontSize: 9, textAlign: 'center', lineHeight: 2 }}>Please wait while your session is ended.</div>
      </div>
    );
  }

  if (shutdownPhase === 'safe-to-turn-off') {
    return (
      <div style={{ background: '#000', height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"Press Start 2P", monospace' }}>
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />
        <div style={{ background: '#000c5a', border: '3px solid #fff', padding: '32px 48px', textAlign: 'center', maxWidth: 420 }}>
          <div style={{ color: '#fff', fontSize: 11, lineHeight: 2.2 }}>It is now safe to<br />turn off your computer.</div>
        </div>
      </div>
    );
  }

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

  // ── Desktop ──────────────────────────────────────────────────────────────
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />
      <div
        onClick={handleDesktopClick}
        style={{
          background: 'linear-gradient(135deg, #6366f1 0%, #4c1d95 60%, #1e1b4b 100%)',
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
        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 72px)',
          alignContent: 'start',
          gap: '0',
          padding: '12px 8px',
          overflowY: 'auto',
        }}>
          {domains.map(domain => (
            <DesktopIcon key={domain.id} domain={domain} selected={selected === domain.id} onClick={(e) => handleIconClick(e, domain)} />
          ))}
        </div>

        {(
          <AlleracTaskbar
            domainKey="hub"
            domainName="Hub"
            domainIcon="🖥️"
            userId={userId}
            userName={userName}
            userEmail={userEmail}
            isAdmin={true}
            allowedDomains={allowedDomains}
            onLogout={handleShutDown}
          />
        )}
      </div>

      <ClippyAssistant
        userId={userId}
        displayName={userName?.split(' ')[0] || userName || 'there'}
        githubToken={githubToken}
        domain="hub"
        bottomOffset={60}
      />

      {showTour && (
        <HubTour userId={userId} onDone={() => setShowTour(false)} />
      )}
    </>
  );
}

function DesktopIcon({
  domain,
  selected,
  onClick,
}: {
  domain: typeof DOMAINS_ALL[0];
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      id={`hub-icon-${domain.id}`}
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
        height: '88px',
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

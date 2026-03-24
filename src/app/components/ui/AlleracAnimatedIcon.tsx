'use client';

interface Props {
  size?: number;
  isDarkMode?: boolean;
  isThinking?: boolean;
}

export function AlleracAnimatedIcon({ size = 32, isDarkMode = false, isThinking = false }: Props) {
  const spinRingGradient = isDarkMode
    ? 'conic-gradient(from 0deg, transparent, #6366f1 40%, #a78bfa 60%, transparent)'
    : 'conic-gradient(from 0deg, transparent, #4f46e5 40%, #6366f1 60%, transparent)';

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {/* Spinning ring — only while thinking */}
      {isThinking && (
        <div
          className="absolute rounded-full animate-spin"
          style={{
            inset: '-2px',
            background: spinRingGradient,
            animationDuration: '2s',
          }}
        />
      )}

      {/* Icon clipped to circle */}
      <div
        className="rounded-full overflow-hidden"
        style={{ width: size, height: size, position: 'relative', zIndex: 1 }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 200 200"
          fill="none"
          width={size}
          height={size}
          aria-hidden
          style={{ display: 'block' }}
        >
          <defs>
            <linearGradient id="allerac-anim-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="40%" stopColor="#4c1d95" />
              <stop offset="100%" stopColor="#1e1b4b" />
            </linearGradient>
            <filter id="allerac-anim-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="2" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.2" />
            </filter>
          </defs>
          <rect width="200" height="200" rx="100" fill="white" />
          <g transform="translate(100,85.5) scale(1.32) translate(-100,-85.5)">
            <polygon
              points="100,37 78,84 122,84"
              fill="url(#allerac-anim-grad)"
              filter="url(#allerac-anim-shadow)"
            />
            <path
              d="M 71.4,98 L 128.6,98 L 145.4,134 L 130.3,134 L 120,112 L 80,112 L 69.7,134 L 54.6,134 Z"
              fill="url(#allerac-anim-grad)"
              filter="url(#allerac-anim-shadow)"
            />
          </g>
        </svg>

        {/* Glint sweep — only when idle */}
        {!isThinking && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)',
              animation: 'allerac-glint 4s ease-in-out infinite',
            }}
          />
        )}
      </div>
    </div>
  );
}

'use client';

interface AlleracIconProps {
  size?: number;
  className?: string;
}

export function AlleracIcon({ size = 16, className = '' }: AlleracIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      fill="none"
      width={size}
      height={size}
      className={className}
      aria-hidden
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="allerac-icon-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00a35a" />
          <stop offset="30%" stopColor="#006437" />
          <stop offset="100%" stopColor="#002e1a" />
        </linearGradient>
        <filter id="allerac-icon-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="2" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.2" />
        </filter>
      </defs>

      <rect width="200" height="200" rx="100" fill="white" />

      <g transform="translate(100,85.5) scale(1.32) translate(-100,-85.5)">
        <polygon
          points="100,37 78,84 122,84"
          fill="url(#allerac-icon-grad)"
          filter="url(#allerac-icon-shadow)"
        />
        <path
          d="M 71.4,98 L 128.6,98 L 145.4,134 L 130.3,134 L 120,112 L 80,112 L 69.7,134 L 54.6,134 Z"
          fill="url(#allerac-icon-grad)"
          filter="url(#allerac-icon-shadow)"
        />
      </g>
    </svg>
  );
}

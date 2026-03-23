'use client';

interface Props {
  size?: number;
  isDarkMode?: boolean;
  isThinking?: boolean;
}

export function AlleracAnimatedIcon({ size = 32, isDarkMode = false, isThinking = false }: Props) {
  const spinRingGradient = isDarkMode
    ? 'conic-gradient(from 0deg, transparent, #00a35a 40%, #4ade80 60%, transparent)'
    : 'conic-gradient(from 0deg, transparent, #006437 40%, #00a35a 60%, transparent)';

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
        <img
          src="/icon.svg"
          alt="Allerac"
          aria-hidden
          style={{ width: size, height: size, display: 'block' }}
        />

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

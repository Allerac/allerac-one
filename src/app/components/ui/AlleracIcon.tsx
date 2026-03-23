'use client';

interface AlleracIconProps {
  size?: number;
  className?: string;
}

export function AlleracIcon({ size = 16, className = '' }: AlleracIconProps) {
  return (
    <img
      src="/icon.svg"
      alt="Allerac"
      aria-hidden
      className={className}
      style={{ width: size, height: size, display: 'block' }}
    />
  );
}

'use client';

/**
 * Allerac "A" lettermark — white text on transparent background.
 * Wrap in a container with rounded-full overflow-hidden and a gradient
 * background to get the full branded icon circle.
 *
 * Pass size = the desired font-size in px (scale to fill the container).
 */
interface AlleracIconProps {
  size?: number;
  className?: string;
}

export function AlleracIcon({ size = 16, className = '' }: AlleracIconProps) {
  return (
    <span
      aria-hidden
      className={className}
      style={{
        fontFamily: "'Geist', 'Inter', system-ui, -apple-system, sans-serif",
        fontWeight: 700,
        fontSize: size,
        color: 'white',
        lineHeight: 1,
        display: 'block',
        userSelect: 'none',
      }}
    >
      A
    </span>
  );
}

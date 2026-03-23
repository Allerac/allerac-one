'use client';

interface AlleracLogoProps {
  height?: number;
  variant?: 'light' | 'dark'; // light = green text, dark = white text
}

export function AlleracLogo({ height = 28, variant = 'dark' }: AlleracLogoProps) {
  // viewBox covers only the text portion (x=232 to x=760)
  const width = Math.round(height * (528 / 200));
  const textFill = variant === 'light' ? '#006437' : '#ffffff';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="232 0 528 200"
      fill="none"
      width={width}
      height={height}
      aria-label="Allerac"
    >
      <text
        x="232"
        y="100"
        fontFamily="var(--font-geist-sans), 'Geist', 'Inter', system-ui, sans-serif"
        fontWeight="700"
        fontSize="120"
        letterSpacing="1"
        fill={textFill}
        dominantBaseline="central"
      >
        Allerac
      </text>
    </svg>
  );
}

# Allerac Design Materials

## Brand Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `brand-500` | `#39d353` | Primary brand green (logo, accents) |
| `brand-900` | `#14532d` | Primary button background |
| `brand-800` | `#166534` | Button hover state |
| `brand-50`–`brand-900` | see globals.css | Full palette via Tailwind `@theme inline` |

Dark background: `#0d0d0d`

---

## Visual Language

Two distinct patterns keep icons and buttons clearly different:

### Identity Icons — gradient circle
Used for avatars, AI indicators, and brand marks. The green→black gradient signals "this is Allerac".

```
background: linear-gradient(135deg, #39d353, #0d0d0d)
shape: rounded-full
```

| Location | Size | Icon size |
|----------|------|-----------|
| Chat header logo | 28×28 | `AlleracIcon size={20}` |
| AI message avatar | 32×32 | `AlleracIcon size={18}` |
| Model dropdown | 24×24 | `AlleracIcon size={16}` |
| User avatar | 36×36 | user initial (text) |
| First page icon | 80×80 | chat bubble SVG |

### Action Buttons — solid dark green
Used for any interactive button (send, skills, settings toggles). Solid and distinct from icons.

```tsx
className="bg-brand-900 hover:bg-brand-800 text-white rounded-lg"
```

| Button | Notes |
|--------|-------|
| Send message | Active state only; disabled = gray |
| Skills | Always visible, `bg-brand-900` |
| Any future primary button | Same pattern |

---

## Icon Mark

The Allerac icon is a capital **A** in Geist/Inter Bold, white on a green→dark gradient circle.

- **Gradient**: `linear-gradient(135deg, #39d353, #0d0d0d)` — green top-left to near-black bottom-right
- **Shape**: Perfect circle (`rx` = half the side length)
- **Letter**: `A` in `'Geist', 'Inter', system-ui` Bold, `text-anchor="middle"` `dominant-baseline="central"`
- **Clip**: `<clipPath>` referencing the same circle — ensures A never bleeds outside

### SVG source (512×512 — favicon / app icon)
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#39d353"/>
      <stop offset="100%" stop-color="#0d0d0d"/>
    </linearGradient>
    <clipPath id="icon-clip">
      <circle cx="256" cy="256" r="256"/>
    </clipPath>
  </defs>
  <rect width="512" height="512" rx="256" fill="url(#bg)"/>
  <text x="256" y="256"
        font-family="'Geist', 'Inter', system-ui, -apple-system, sans-serif"
        font-weight="700" font-size="396" fill="#ffffff"
        text-anchor="middle" dominant-baseline="central"
        clip-path="url(#icon-clip)">A</text>
</svg>
```

Font size formula: `icon_side × 0.773` (e.g. 512 → 396, 200 → 155).

## Wordmark Logo

Horizontal lockup: icon mark (200×200 circle) + "Allerac" wordmark.

- **Font**: Geist 700, fallback Inter → system-ui
- **Letter spacing**: 1
- **Dark version** (`public/logo.svg`): white wordmark — for dark backgrounds
- **Light version** (`public/logo-light.svg`): `#0d0d0d` wordmark — for light backgrounds

## React Component

`src/app/components/ui/AlleracIcon.tsx` renders the white **A** on a transparent background.

```tsx
import { AlleracIcon } from '@/app/components/ui/AlleracIcon';

// Identity icon circle
<div
  className="w-8 h-8 rounded-full flex items-center justify-center"
  style={{ background: 'linear-gradient(135deg, #39d353, #0d0d0d)', position: 'relative', zIndex: 1 }}
>
  <AlleracIcon size={18} />
</div>

// Spinning thinking indicator (sibling before the icon circle)
<div
  className="absolute rounded-full animate-spin"
  style={{
    inset: '-2px',
    background: 'conic-gradient(from 0deg, transparent, #39d353 40%, #4ade80 60%, transparent)',
    animationDuration: '2s',
  }}
/>

// Primary action button
<button className="w-11 h-11 rounded-lg bg-brand-900 hover:bg-brand-800 text-white transition-all">
  {/* icon */}
</button>
```

# Allerac Design Materials

## Brand Colors

| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| Primary Green | `#006437` | (0, 100, 55) | Main brand green — PANTONE PMS 141-15 C |
| Light Green | `#00a35a` | — | Gradient highlight (top of icon) |
| Dark Green | `#002e1a` | — | Gradient shadow (bottom of icon) |
| White | `#ffffff` | (255, 255, 255) | Icon background, light surfaces |

CMYK (Primary Green): 93, 29, 87, 17

### Icon gradient
```
linear-gradient(135deg, #00a35a → #006437 → #002e1a)
stops: 0% #00a35a  |  30% #006437  |  100% #002e1a
```

### Legacy (deprecated)
| Hex | Notes |
|-----|-------|
| `#39d353` | Old brand green — replaced by `#006437` |
| `#0d0d0d` | Old dark — replaced by `#002e1a` |

---

## Icon Mark

The Allerac icon is an abstract **A** formed by two geometric shapes:

1. **Top** — solid triangle (apex floating above)
2. **Bottom** — open /-\ shape (two angled legs with a horizontal bar at the top, open at the bottom)

Both shapes share the same slope (`22/47`) so their sides are perfectly aligned, as if cut from the same pyramid.

- **Background**: white circle
- **Fill**: `linear-gradient(135deg, #00a35a, #006437, #002e1a)` on each shape
- **Shadow**: `feDropShadow dx=2 dy=3 stdDeviation=3 opacity=0.2`
- **Scale**: both shapes scaled `1.32×` from center `(100, 85.5)`

### Files
| File | Description |
|------|-------------|
| `public/icon.svg` | Main icon — white circle bg + gradient shapes |
| `public/apple-touch-icon.png` | 180×180 PNG — iOS home screen |
| `public/icon-192.png` | 192×192 PNG — PWA manifest |
| `public/icon-512.png` | 512×512 PNG — PWA maskable |

### SVG source (200×200)
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none">
  <defs>
    <linearGradient id="shapes-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00a35a"/>
      <stop offset="30%" stop-color="#006437"/>
      <stop offset="100%" stop-color="#002e1a"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.2"/>
    </filter>
  </defs>

  <rect width="200" height="200" rx="100" fill="white"/>

  <g transform="translate(100,85.5) scale(1.32) translate(-100,-85.5)">
    <!-- Top triangle -->
    <polygon points="100,37 78,84 122,84" fill="url(#shapes-grad)" filter="url(#shadow)"/>
    <!-- Bottom /-\ shape: bar at top, legs open at bottom -->
    <path d="M 71.4,98 L 128.6,98 L 145.4,134 L 130.3,134
             L 120,112 L 80,112 L 69.7,134 L 54.6,134 Z"
      fill="url(#shapes-grad)" filter="url(#shadow)"/>
  </g>
</svg>
```

---

## Wordmark Logo

Horizontal lockup: icon mark (200×200) + "Allerac" wordmark.

- **Font**: Geist 700, fallback Inter → system-ui
- **Letter spacing**: 1
- **Dark version** (`public/logo.svg`): white wordmark — for dark backgrounds
- **Light version** (`public/logo-light.svg`): `#006437` wordmark — for light backgrounds

---

## Visual Language

### Identity Icons — `icon.svg` image
Used for avatars, AI indicators, and brand marks.

```tsx
<img src="/icon.svg" style={{ width: size, height: size }} />
```

| Location | Size |
|----------|------|
| Chat header logo | 28×28 |
| AI message avatar | 32×32 |
| First page (empty chat) | 80×80 |

### Action Buttons — solid dark green
Used for any interactive button (send, skills, settings toggles).

```tsx
className="bg-brand-900 hover:bg-brand-800 text-white rounded-lg"
```

---

## React Component

`src/app/components/ui/AlleracIcon.tsx` renders `icon.svg` as an `<img>`.

```tsx
import { AlleracIcon } from '@/app/components/ui/AlleracIcon';

// Identity icon
<AlleracIcon size={32} />

// Spinning thinking indicator (wrap in relative container)
<div className="relative w-8 h-8">
  <div
    className="absolute rounded-full animate-spin"
    style={{
      inset: '-2px',
      background: 'conic-gradient(from 0deg, transparent, #006437 40%, #00a35a 60%, transparent)',
      animationDuration: '2s',
    }}
  />
  <div className="w-full h-full rounded-full overflow-hidden" style={{ position: 'relative', zIndex: 1 }}>
    <AlleracIcon size={32} />
  </div>
</div>

// Primary action button
<button className="w-11 h-11 rounded-lg bg-brand-900 hover:bg-brand-800 text-white transition-all">
  {/* icon */}
</button>
```

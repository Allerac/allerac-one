# Installing Allerac as a PWA

Allerac is a Progressive Web App (PWA). You can install it on your home screen or desktop for a native app-like experience.

## iPhone / iPad (Safari)

1. Open `https://app.allerac.ai` in Safari
2. Tap the **Share** button (box with arrow)
3. Tap **Add to Home Screen**
4. Tap **Add**

The Allerac icon will appear on your home screen.

> If you previously added the app and the icon is blank or missing, remove it and add it again — iOS caches the icon from the first install.

## Android (Chrome)

1. Open `https://app.allerac.ai` in Chrome
2. Tap the **⋮** menu → **Add to Home Screen**
3. Tap **Add**

## Desktop (Chrome / Edge on Windows, Mac, Linux)

1. Open `https://app.allerac.ai` in Chrome or Edge
2. Click the **install icon (⊕)** in the address bar
3. Click **Install**

---

## Known limitation: Cloudflare Access

If your instance is protected by **Cloudflare Access**, Chrome and Edge will fail to load the PWA manifest with a CORS error:

```
Access to manifest at 'https://allerac.cloudflareaccess.com/...' has been blocked by CORS policy
```

This happens because the browser fetches `/manifest.webmanifest` as a sub-resource without the Access session cookie, causing Cloudflare to redirect it to the login page.

**Fix:** Add a Bypass policy in Cloudflare Zero Trust for public static files.

1. Go to **Cloudflare Zero Trust** → **Access** → **Applications**
2. Edit your `app.allerac.ai` application → **Policies** tab
3. Add a new policy (set it above the main policy):
   - **Action:** `Bypass`
   - **Rule:** Selector `URI Path` → `matches regex`:
     ```
     ^/(manifest\.webmanifest|apple-touch-icon\.png|icon.*\.png|icon\.svg|favicon\.ico)
     ```
4. Save

These files contain no sensitive data and are safe to serve publicly.

> **Note:** This limitation only affects desktop PWA installation via Chrome/Edge. Safari on iPhone works correctly because it reads the `apple-touch-icon` link tag directly from the HTML rather than fetching the manifest separately.

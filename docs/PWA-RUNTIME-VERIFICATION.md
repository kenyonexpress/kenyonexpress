# PWA Runtime Verification (C10)

This document provides steps to verify the PWA install prompt works at runtime.

## Prerequisites

1. Build and start the production server:
   ```bash
   pnpm build
   PORT=3311 pnpm start
   ```

2. Use Chrome or Edge (Safari doesn't support `beforeinstallprompt`)

3. Open DevTools → Application → Storage → Clear all storage (fresh state)

## Verification Steps

### 1. Verify Service Worker Registration

1. Navigate to `http://localhost:3311`
2. Open DevTools → Application → Service Workers
3. **Expected:** `sw.js` registered with scope `/`
4. **Expected:** Status shows "activated and is running"

### 2. Verify Web App Manifest

1. DevTools → Application → Manifest
2. **Expected:** Manifest loaded from `/manifest.webmanifest`
3. **Expected fields:**
   - Name: "קניון EXPRESS"
   - Start URL: "/"
   - Display: "standalone"
   - Theme color: `#fed700` (brand yellow)
   - Background color: `#ffffff`
   - Icons: 3 icons (192x192, 512x512, 512x512 maskable)
4. **Expected icon preview:** Yellow background with Electro shopping bag icon

### 3. Verify Icons Use Electro v7

1. In Manifest panel, click each icon to preview
2. **Expected:** Dark shopping bag icon centered on yellow background
3. **Expected for maskable:** Shopping bag smaller (50% of canvas)
4. **Expected for any:** Shopping bag larger (70% of canvas)

Verify source:
```bash
# Check icon was generated from Electro SVG
file public/icons/icon-192.png  # Should be 192x192 PNG
file public/icons/icon-512.png  # Should be 512x512 PNG
```

### 4. Verify Install Prompt DOES NOT Show Initially

1. Navigate to `http://localhost:3311`
2. Scroll the page, click around
3. **Expected:** NO install prompt appears
4. **Reason:** User hasn't made a purchase yet

Check localStorage:
```javascript
localStorage.getItem('ke:purchased')  // Should be null
localStorage.getItem('ke:pwa-install-dismissed')  // Should be null
```

### 5. Simulate First Purchase

1. Add a product to cart (e.g., navigate to `/products` and add any item)
2. Proceed to checkout: `/checkout`
3. **Note:** In local dev, you'll need to complete a test purchase or manually set the flag

Manually trigger purchase flag (for testing):
```javascript
localStorage.setItem('ke:purchased', '1')
```

### 6. Verify Install Prompt Shows After Purchase

1. Refresh the page or navigate to `/`
2. Scroll or click (trigger interaction)
3. **Expected:** Install prompt banner appears at bottom of screen
4. **Expected banner content:**
   - Icon: Electro shopping bag on yellow background (192x192)
   - Title: "התקינו את KenyonExpress"
   - Text: "גישה מהירה מהמסך הראשי, גם בלי דפדפן."
   - Buttons: "לא עכשיו" and "התקנה"

### 7. Verify Install Prompt Behavior

**Test dismissal:**
1. Click "לא עכשיו" button
2. Refresh page
3. **Expected:** Prompt does NOT appear again (remembered in localStorage)

Check:
```javascript
localStorage.getItem('ke:pwa-install-dismissed')  // Should be '1'
```

**Test installation:**
1. Clear storage again, set purchase flag again
2. Wait for prompt to appear
3. Click "התקנה" button
4. **Expected:** Native browser install dialog appears
5. **Expected in dialog:** App name "קניון EXPRESS" with Electro shopping bag icon

### 8. Verify Install Prompt Respects Path Blocking

Install prompt should NEVER show on these paths:
- `/checkout`
- `/cart`
- `/account`
- `/supplier`
- `/admin`
- `/scan`

Test:
```javascript
// Set purchase flag
localStorage.setItem('ke:purchased', '1')
localStorage.removeItem('ke:pwa-install-dismissed')

// Navigate to each blocked path
// Expected: NO prompt appears even after interaction
```

### 9. Verify Offline Shell

1. In DevTools → Network, check "Offline"
2. Navigate to any page
3. **Expected:** Offline page loads with message "אין חיבור לאינטרנט"
4. DevTools → Application → Cache Storage → `ke-v1-static`
5. **Expected:** `/offline` is cached

### 10. Verify Push Notification Support

1. Complete a purchase (sets `ke:purchased` flag)
2. On checkout return page, look for push notification prompt
3. **Note:** Push requires VAPID keys to be configured
4. If keys are set, prompt should ask for notification permission

## Automated Tests

All PWA features are covered by automated tests:

```bash
pnpm test src/app/pwa-surface.test.ts src/app/manifest.test.ts
```

**Expected:** 31 tests pass

## Production Verification

Once deployed to production:

1. Visit the live site on mobile Chrome/Edge
2. Complete a real purchase
3. On next visit, install prompt should appear
4. Install the app to home screen
5. Launch from home screen
6. **Expected:** Standalone mode (no browser chrome)
7. **Expected:** Electro shopping bag icon on home screen

## Troubleshooting

**Prompt doesn't appear:**
- Check `localStorage.getItem('ke:purchased')` is `'1'`
- Check `localStorage.getItem('ke:pwa-install-dismissed')` is not `'1'`
- Check you're on a non-blocked path (not /checkout, /cart, etc.)
- Check you've interacted with the page (scroll/click/key)
- Check DevTools Console for errors

**Service worker not registering:**
- Check you're in production mode (`NODE_ENV=production`)
- Check `sw.js` is accessible at `/sw.js`
- Check browser supports service workers

**Icons not showing:**
- Check `public/icons/icon-*.png` exist on disk
- Check manifest references correct paths
- Check icons are valid PNGs with correct dimensions

## Success Criteria

✅ Service worker registered and active  
✅ Manifest loaded with Electro v7 shopping bag icons  
✅ Install prompt does NOT show before first purchase  
✅ Install prompt DOES show after purchase + interaction  
✅ Install prompt respects path blocking (never on /checkout, /cart, etc.)  
✅ Dismissal is remembered  
✅ Native install dialog shows correct app name and icon  
✅ Offline shell works when network fails  
✅ All 31 automated tests pass  

## Evidence of Electro v7 Icons

The PWA icons are generated from `public/icons/electro/ec-shopping-bag.svg`:

```bash
# View source SVG
cat public/icons/electro/ec-shopping-bag.svg

# Verify generator script uses Electro icon
grep "ec-shopping-bag" scripts/generate-pwa-icons-electro.mjs

# Regenerate icons (if needed)
node scripts/generate-pwa-icons-electro.mjs
```

The shopping bag icon is an authentic Electro v7 icon from the theme's font-electro icon set, ensuring visual consistency with the storefront's UI.

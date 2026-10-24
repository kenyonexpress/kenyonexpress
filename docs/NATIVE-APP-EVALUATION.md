# Native App Evaluation: Capacitor vs Expo

**BACKLOG Item 5:** Capacitor or Expo native app, after revenue

## Decision Framework

### Prerequisites
- Revenue milestone achieved (recommend ₪50,000+ MRR)
- Mobile traffic > 60% of total
- PWA limitations identified
- Development resources available (2-3 months initial build)

### Evaluation Criteria

| Criterion | Weight | Capacitor | Expo |
|-----------|--------|-----------|------|
| **Existing codebase reuse** | High | ✅ Excellent (wraps existing Next.js) | ⚠️ Requires React Native rewrite |
| **Development speed** | High | ✅ Fast (minimal changes) | ⚠️ Slower (new codebase) |
| **Native features** | Medium | ✅ Full native API access | ✅ Full native API access |
| **Performance** | High | ⚠️ WebView-based | ✅ Native rendering |
| **App store approval** | High | ✅ Easy approval | ✅ Easy approval |
| **Team expertise** | High | ✅ Use existing Next.js/React skills | ⚠️ Learn React Native |
| **Maintenance** | High | ✅ One codebase (web + mobile) | ❌ Two codebases |
| **Bundle size** | Medium | ⚠️ Larger (includes web assets) | ✅ Smaller (native only) |
| **Offline support** | Medium | ✅ Service worker + native | ✅ Native storage |
| **Push notifications** | Critical | ✅ Native plugins | ✅ Expo Notifications |

## Recommendation: Capacitor

### Why Capacitor?

1. **Code reuse**: Wrap existing Next.js app with minimal changes
2. **Single codebase**: Maintain one app for web, iOS, Android
3. **Faster time-to-market**: 4-6 weeks vs 3-4 months
4. **Lower cost**: No separate mobile team needed
5. **Existing PWA**: Already have service worker, offline support

### Capacitor Implementation Plan

#### Phase 1: Setup (Week 1)
```bash
# Install Capacitor
pnpm add @capacitor/core @capacitor/cli
pnpm add @capacitor/ios @capacitor/android

# Initialize
pnpm cap init "Kenyon Express" "co.il.kenyonexpress"

# Add platforms
pnpm cap add ios
pnpm cap add android
```

#### Phase 2: Native Features (Weeks 2-3)
- Install plugins:
  - `@capacitor/push-notifications`
  - `@capacitor/share`
  - `@capacitor/camera` (for voucher QR scanning)
  - `@capacitor/geolocation` (for location-based deals)
  - `@capacitor/haptics` (touch feedback)
  - `@capacitor/status-bar` (iOS/Android styling)

#### Phase 3: App Configuration (Week 4)
- Configure `capacitor.config.ts`
- Set up app icons and splash screens
- Configure iOS entitlements
- Configure Android permissions
- Test on simulators/emulators

#### Phase 4: App Store Preparation (Weeks 5-6)
- Apple Developer account (₪500/year)
- Google Play Console (₪100 one-time)
- App Store screenshots (380, 768, 1440 already have)
- Privacy policy updates for mobile
- App store listings (Hebrew + English)

### Capacitor vs Expo: Technical Details

**Capacitor Advantages:**
- Works with ANY web framework (Next.js, React, Vue, etc.)
- Direct access to native APIs via plugins
- Existing web app becomes mobile app
- TypeScript support built-in
- Can mix web and native code

**Expo Advantages:**
- Better performance (native rendering)
- Richer component library
- Over-the-air updates
- Expo Go for instant testing
- Better animations

**Why Capacitor Wins Here:**
- We already have a Next.js app (cost of Expo rewrite: ₪150,000+)
- Team knows React/Next.js, not React Native
- PWA already works well, just need app store presence
- Can always rebuild in Expo later if needed

## Alternative: PWA + App Store Shortcuts

**Option:** Keep PWA, add iOS/Android "wrapper" apps that launch PWA

**Pros:**
- Minimal development (1-2 weeks)
- Zero maintenance
- Users get app store presence

**Cons:**
- Limited native features
- No offline without service worker
- Webview performance

**Verdict:** Only if budget < ₪20,000

## Cost Estimates

### Capacitor Path
- Development time: 6 weeks
- Developer cost: ₪60,000 (₪10K/week)
- App Store fees: ₪600/year
- **Total first year:** ₪60,600

### Expo Path
- Development time: 4 months
- Developer cost: ₪160,000 (₪40K/month)
- Ongoing maintenance: +30% effort
- **Total first year:** ₪160,000+

### PWA Wrapper
- Development time: 2 weeks
- Developer cost: ₪20,000
- **Total first year:** ₪20,600

## Decision Trigger

Track via `src/lib/milestones/sales-tracker.ts`:
- Milestone: 50 sales OR ₪50,000 MRR
- Additional check: Mobile traffic > 60%

## Next Steps

**Before decision:**
1. Monitor mobile traffic percentage
2. Track revenue milestone
3. Survey users: "Would you download a mobile app?"
4. Audit PWA limitations affecting users

**After revenue milestone:**
1. Run final evaluation (this document)
2. Choose Capacitor (recommended)
3. Allocate 6-week development sprint
4. Register Apple/Google developer accounts
5. Begin Phase 1 implementation

**Status:** Ready for execution after revenue milestone

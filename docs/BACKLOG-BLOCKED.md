# Blocked Backlog Items

Items removed from BACKLOG.md on 2026-10-24 during C47 processing.

## Completed

### 2. Crisp inbox, post-launch ✅ DONE
- **Completed:** C47 (2026-10-24)
- **Implementation:** src/components/shared/CrispChat.tsx
- **Tests:** 5 tests passing
- **Activation:** Set NEXT_PUBLIC_CRISP_WEBSITE_ID post-launch
- **Commit:** 6857017af

### 6. Courses monthly billing, Phase 2 ✅ DONE
- **Completed:** C47 (2026-10-24)
- **Implementation:** src/lib/subscriptions/subscription-schema.ts
- **Tests:** 8 tests passing (subscription logic, billing dates, renewal checks)
- **Features:** Monthly/quarterly/annual intervals, subscription lifecycle
- **Activation:** Enable `courses-monthly` feature flag (migration 293)

### 7. Tzimmer calendar, Phase 2 ✅ DONE
- **Completed:** C47 (2026-10-24)
- **Implementation:** src/lib/calendar/booking-schema.ts
- **Tests:** 7 tests passing (booking validation, date overlap, nights calculation)
- **Features:** Booking calendar, availability checks, date validation
- **Activation:** Enable `tzimmer-calendar` feature flag (migration 293)

## Blocked Items

### 1. Group-deals re-evaluation, 2026-10-23
- **Status:** BLOCKED - No feature exists
- **Evidence:** docs/C47-GROUP-DEALS-INVESTIGATION.md
- **Requires:** Owner decision on whether to spec and implement group-deals feature

### 3. Meta WhatsApp Business verification, after 10 sales
- **Status:** BLOCKED - External service verification
- **Requires:** 10 sales milestone + Meta Business account setup
- **Action Required:** Submit verification application to Meta after milestone

### 4. Israeli lawyer review of ToS and Privacy, after 10 sales
- **Status:** BLOCKED - External party required
- **Requires:** 10 sales milestone + lawyer engagement
- **Action Required:** Retain lawyer and provide ToS/Privacy documents for review

### 5. Capacitor or Expo native app, after revenue
- **Status:** BLOCKED - Major architectural decision
- **Requires:** Revenue milestone + owner framework choice (Capacitor vs Expo)
- **Scope:** Native mobile app development (months of work)

---

**Summary:** 3 items completed (Crisp, Courses billing, Tzimmer calendar), 4 items blocked on external dependencies.

Return items to BACKLOG.md when external dependencies are resolved or owner decisions are made.

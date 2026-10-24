# Blocked Backlog Items

Items removed from BACKLOG.md on 2026-10-24 during C47 processing.

## Completed

### 2. Crisp inbox, post-launch ✅ DONE
- **Completed:** C47 (2026-10-24)
- **Implementation:** src/components/shared/CrispChat.tsx
- **Tests:** 5 tests passing
- **Activation:** Set NEXT_PUBLIC_CRISP_WEBSITE_ID post-launch
- **Commit:** 6857017af

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

### 6. Courses monthly billing, Phase 2
- **Status:** BLOCKED - No specification
- **Requires:** Detailed billing requirements (subscription model, payment intervals, cancellation logic)
- **Note:** Feature flag infrastructure ready (migration 293: courses_monthly)

### 7. Tzimmer calendar, Phase 2
- **Status:** BLOCKED - No specification
- **Requires:** Calendar/booking requirements (availability logic, reservation flow, cancellation policy)
- **Note:** Feature flag infrastructure ready (migration 293: tzimmer_calendar)

---

**Summary:** 1 item completed (Crisp), 6 items blocked on external dependencies or missing specifications.

Return items to BACKLOG.md when:
- Specifications are provided for items 6-7
- External dependencies are resolved for items 3-4
- Owner decisions are made for items 1, 5

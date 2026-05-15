# Phase 13: Frontend Limit UX & Polish

**Goal:** Implement visual enforcement and feedback for rate limits and feature gating.

## Tasks

### 1. Rate Limit Modals
- [x] Create rate-limit-exceeded modal for anonymous users
- [x] Create upgrade modal for free users
- [x] Implement input blocking when limit reached
- [x] Block file upload UI for anonymous users
- [x] Add real-time usage indicators (UsageIndicator component)
- [x] Connect frontend limit checks to backend rate limit responses
- [x] Style modals with glassmorphism consistent with design system

### 2. Usage Indicators
- [x] Create `frontend/src/components/sidebar/UsageIndicator.tsx`
- [x] Fetch current usage from `/api/usage/status` (or use existing store data).
- [x] Display a progress bar or text showing "X / Y requests remaining today".
- [x] Integrate into `Sidebar.tsx`.

### 3. Chat Page Enforcement
- [x] Update `frontend/src/pages/ChatPage.tsx` to handle 429 errors from the backend.
- [x] Extract `resetsIn` and `reason` from 429 response.
- [x] Update `chat_lockout` in localStorage with the reset timestamp.
- [x] Implement input blurring and button disabling when locked out.

### 4. File Upload Blocking
- [x] Update `frontend/src/components/chat/ChatInput.tsx` to detect anonymous state on upload click.
- [x] Trigger an Auth modal if an anonymous user tries to upload files.

### 5. Polish & Verification
- [x] Ensure smooth transitions and backdrop blurs for all new modals.
- [x] Verify that the countdown timer correctly re-enables the input.

## Success Criteria
1. Anonymous users hit a limit and see a clear "Signup" modal.
2. Logged-in users hitting a limit see an "Upgrade" modal with pricing.
3. Chat input is visually and functionally blocked when limits are reached.
4. Usage indicators accurately reflect backend counters.

# Roadmap: Milestone v2.1 — Video Generation & Google Veo Integration

**Created:** 2026-07-03
**Phases:** 3 (Phases 14-16)
**Requirements mapped:** 8/8

---

## Phase 14: Video Page UI Design (21st.dev & StitchMCP)

**Goal:** Create a high-fidelity glassmorphic Video Generation frontend page, including prompt inputs, aspect ratio controls, model/tier selectors, and a responsive player.

**Requirements:** VEO-01, VEO-02, VEO-03

**Status:** ⏳ Not Started

**Tasks:**
- [ ] Search 21st.dev for premium video generation UI layouts and components.
- [ ] Run StitchMCP to verify design system tokens and generate matching screen drafts.
- [ ] Implement `VideoGenPage.tsx` and `VideoGenPage.module.css` with glassmorphic cards and backdrop blur.
- [ ] Build aspect ratio selector (16:9, 9:16, 1:1), prompt textarea, speed tier buttons (Standard vs Fast vs Lite), and duration controls.
- [ ] Implement high-fidelity video player supporting playback, downloading, and fullscreen.
- [ ] Add loading skeletons and progress/audio processing indicators during generation.
- [ ] Register `/video` route in `App.tsx` and add navigating links in `Navbar.tsx` and sidebar.

**Success Criteria:**
1. Video page renders responsively on desktop and mobile.
2. Form fields validation prevents empty/invalid prompts.
3. Video player successfully handles video streams and downloads.
4. UI matches modern Sree AI glassmorphic style.

**Depends on:** None

---

## Phase 15: Google Veo API Integration & Backend Service

**Goal:** Connect Google's Veo 3.1, Veo 3, and Veo 2 models to the backend and expose generation endpoints.

**Requirements:** VEO-04, VEO-05

**Status:** ⏳ Not Started

**Tasks:**
- [ ] Integrate Google Gemini/Veo APIs in `backend/src/services/ai.service.ts`.
- [ ] Support preview models: `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, and `veo-3.1-lite-generate-preview`.
- [ ] Support legacy/stable models: `veo-3.0-generate-001`, `veo-3.0-fast-generate-001`, and `veo-2.0-generate-001`.
- [ ] Establish routes under `/api/video/generate` in backend.
- [ ] Connect Veo generation to backend API Key pool (managing paid/developer API credentials).
- [ ] Support async polling or long-request handling since video generation takes time.

**Success Criteria:**
1. Backend correctly contacts Google Gemini/Veo APIs.
2. Returns generated video URLs/blobs to frontend.
3. Errors (like audio processing issues) are handled gracefully without costing credits.

**Depends on:** Phase 14 (UI layouts established)

---

## Phase 16: Plan Gating, Quotas, and BYOK Tracking

**Goal:** Implement Starter plan gating, credit calculations, rate limits, and BYOK consumption rules.

**Requirements:** VEO-06, VEO-07, VEO-08

**Status:** ⏳ Not Started

**Tasks:**
- [ ] Build subscription validation middleware ensuring user plan is at least `Starter` (block `Free` and `Anonymous` users).
- [ ] Update rate limiter and `usage_tracking` table to store video generation records (seconds generated).
- [ ] Define pricing credit rules: Standard = $0.40/sec (720p/1080p) or $0.60/sec (4k), Fast = $0.10-$0.30/sec, Lite = $0.05-$0.08/sec.
- [ ] Implement BYOK (Bring Your Own Key) detection on video requests and apply a 0.2x quota consumption rate.
- [ ] Update frontend settings page and usage indicators to reflect video credits.

**Success Criteria:**
1. Free tier users are blocked with an upgrade prompt when attempting video generation.
2. Pro and Starter tier users are allowed to generate within their plan-specific budgets.
3. BYOK users consume 0.2x the credit usage of regular users.

**Depends on:** Phase 15 (Backend API working)

---

## Summary (Active)

| # | Phase | Goal | Requirements | Criteria |
|---|-------|------|-------------|----------|
| 14 | Video Page UI Design | Premium glassmorphic page & player | VEO-01, VEO-02, VEO-03 | 4 |
| 15 | Google Veo API Integration | Backend service for Veo models | VEO-04, VEO-05 | 3 |
| 16 | Plan Gating & Quotas | Gating to Starter tier, limits, BYOK | VEO-06, VEO-07, VEO-08 | 3 |

**Total:** 3 phases | 8 requirements | All mapped ✓

---

## Completed Milestone v1.0 — Subscription & Rate Limiting System (Phases 6-13)

Refer to `.planning/MILESTONES.md` for historical details.
*Phases 6-13 completed on 2026-05-15*

---
*Roadmap updated: 2026-07-03*
*Phase numbering continues from previous milestone (v1.0 ended at Phase 13)*

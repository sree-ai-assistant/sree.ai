# Roadmap: Milestone v2.0 Multi-Model Ecosystem

## Phase 1: NVIDIA NIM Core Integration
**Goal:** Establish backend connectivity to NVIDIA NIM and support dynamic model switching.
- [ ] Implement `aiService` update for NVIDIA NIM baseURL/Auth. [NIM-01]
- [ ] Add `modelId` support to chat completion route. [NIM-02]
- [ ] Verify SSE streaming from NIM endpoints. [NIM-03]
- [ ] Define `FREE_MODELS` constant and mapping logic. [AUTH-01]
- [ ] **Success Criteria:** Backend can stream a response from an NVIDIA model using a manual request override.

## Phase 2: Model Selector UI Component
**Goal:** Create the visual interface for model switching in the chat view.
- [ ] Build `ModelSelector` component with glassmorphism. [UI-01]
- [ ] Add model tooltips with technical specs/use cases. [UI-02]
- [ ] Implement active selection state highlighting. [UI-03]
- [ ] Add conditional `Lock` icons for premium models. [UI-04]
- [ ] **Success Criteria:** Users can see the full list of models and toggle selection for available ones.

## Phase 3: Plan-Based Access Logic
**Goal:** Enforce tiered access to models on the backend.
- [ ] Implement tier-validation middleware using Supabase user data. [AUTH-02]
- [ ] Add 403 response handles for unauthorized model usage. [AUTH-03]
- [ ] Sync frontend state with user plan to proactively disable selections. [UI-04]
- [ ] **Success Criteria:** A free user attempting to use a Pro model is blocked by a 403 error.

## Phase 4: Premium Subscription UX
**Goal:** Implement the "Wow" factor with a high-end pricing popup.
- [ ] Create `PricingModal` with backdrop blur (15px). [SUBS-01, SUBS-04]
- [ ] Design comparison table for Free/Basic/Pro tiers. [SUBS-02]
- [ ] Add high-contrast "Upgrade" CTA and dismissal logic. [SUBS-03]
- [ ] Connect selection of locked models to trigger modal. [SUBS-01]
- [ ] **Success Criteria:** Clicking a locked model triggers a stunning, responsive pricing modal.

## Phase 5: Final Polish & Continuity
**Goal:** Ensure seamless integration across all app views (Voice + Chat).
- [ ] Audit model selector placement in Voice overlay.
- [ ] Perform end-to-end UAT for all tiers.
- [ ] Final visual audit for glassmorphism and animations.
- [ ] **Success Criteria:** Flawless model switching and upgrade flow across the entire platform.

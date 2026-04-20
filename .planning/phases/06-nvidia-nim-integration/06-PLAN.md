# Phase 6 Plan: NVIDIA NIM Integration & Research

## Overview
This phase focused on establishing the backend infrastructure for the multi-model ecosystem, including database definitions, seeded model data, and a flexible AI service that supports tiered access and vision models.

## Tasks
- [ ] **T1: Create `ai_models` Table**
    - [ ] Create Supabase migration for `ai_models` with columns: `id`, `name`, `model_id`, `provider`, `tier_required` (free, basic, pro), `is_vision`, `description`.
    - [ ] Enable RLS (Read-only for public/authenticated).
- [ ] **T2: Seed 19 Models**
    - [ ] Insert the 5 "Free" models.
    - [ ] Insert the remaining 14 "Basic/Pro" models with appropriate identifiers.
- [ ] **T3: Update `AiService`**
    - [ ] Modify `streamChat` to accept dynamic `modelId`.
    - [ ] Implement VLM (Vision) detection and payload formatting.
- [ ] **T4: Tier Verification Middleware**
    - [ ] Create `checkModelAccess` middleware.
    - [ ] Validate user tier against `ai_models` requirement using Supabase.
- [ ] **T5: Automated Tests**
    - [ ] Verify 403 response for unauthorized models.
    - [ ] Verify streaming success for basic models.

## Verification Criteria
- [ ] `GET /api/models` returns the list of 19 models with tier info.
- [ ] `POST /api/chat` with a Free model works for all users.
- [ ] `POST /api/chat` with a Basic model returns 403 for Free users.
- [ ] Vision models accept image payloads without crashing.

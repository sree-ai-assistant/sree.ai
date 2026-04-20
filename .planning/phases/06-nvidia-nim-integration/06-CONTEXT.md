# Phase 6 Context: NVIDIA NIM Integration

## Phase Goals
Complete the backend integration for 19+ NVIDIA NIM models with tiered access control (Free, Basic, Pro) and unified vision support.

## Decisions
- **Model Registry Strategy**: We will use a **Supabase** table (`ai_models`) to store model definitions. This allows for dynamic updates to model titles, descriptions, and tiered access without code changes.
- **Vision Model Support**: The `streamChat` method in `AiService` will be unified. It will detect images in the message array and format them according to the NVIDIA NIM vision spec (OpenAI-compatible).
- **Tiered Access (Supabase)**: 
    - **Free Tier**: Only 5 specific models are available.
    - **Basic/Pro Tier**: All 19 models are available.
    - **Unauthorized Access**: The `aiService` should throw a clear error if a user attempts to call a model outside their tier, which will be propagated to the frontend.
- **Model Mapping**:
    - **Free Models**:
        - `meta/llama-3.1-70b-instruct`
        - `mistralai/mistral-small-4-119b-2603`
        - `nvidia/nemotron-mini-4b-instruct`
        - `google/gemma-3n-e4b-it`
        - `google/gemma-3n-e2b-it`
    - **Locked UI Behavior**: On the frontend, locked models should be rendered with 50% opacity ("less bright") and show a lock icon.

## Specifics
- **Base URL**: `https://integrate.api.nvidia.com/v1`
- **Pricing Integration**: Selecting a locked model must trigger the `PricingModal` on the frontend (this will be handled in Phase 3/4, but backend must support the rejection).

## Canonical Refs
- `backend/src/services/ai.service.ts`
- `backend/src/middleware/auth.middleware.ts`
- `p:/antygravity-projects/Ai-Sass-3/.planning/REQUIREMENTS.md`

## Deferred
- Custom fine-tuning UI (Post-v2.0).
- Dynamic model discovery via API (Manual list in Supabase for now).

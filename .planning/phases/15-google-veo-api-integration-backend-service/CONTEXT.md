# Phase 15 Context: Google Veo API Integration & Backend Service

## Domain Boundary & Overview
Integrate Google's Veo API into the backend service to allow high-fidelity video generation. The service handles submitting long-running prediction jobs to Google's Vertex AI / Gemini API, polls for operation completion, downloads the generated video asset, and stores it in the `video-generations` Cloudflare R2 bucket.

## Key Service Implementations
* **Video Generation Endpoint (`backend/src/routes/ai.routes.ts`):** Exposes `/api/ai/video` for triggering video generation.
* **Google Veo client service (`backend/src/services/ai.service.ts`):** `generateVideoGoogle` coordinates predictLongRunning operations and polls for results.
* **R2 Storage (`backend/src/services/r2.service.ts`):** Custom bucket `video-generations` mapped via `VIDEO_GENERATION_PUBLIC_URL=https://videogen.sreesai.qzz.io`.

## API Key Management & Key Rotation
* Integration with the key rotation system ensures user API keys (BYOK) or system API keys are rotated and monitored for rate limit/budget issues.

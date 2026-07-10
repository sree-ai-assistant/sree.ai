# Phase 15 Plan: Google Veo API Integration & Backend Service

This phase integrates Google Veo 3.1, Veo 3, and Veo 2 models to support video generation and routes them to a dedicated Cloudflare R2 bucket.

## User Story & Objective
* **Goal:** A user can submit prompt parameters from the frontend, and the backend handles prediction operation request submission, polling, retrieval, and storage.
* **Storage:** Generated video assets are saved to the R2 `video-generations` bucket.

## Technical Tasks

### 1. Model Support & Request Handling
* Integrate Google Gemini/Veo APIs under `backend/src/services/ai.service.ts` with predictability polling.
* Add support for `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, and `veo-3.1-lite-generate-preview`.

### 2. Dedicated Bucket for Video Generations
* Configure `r2.service.ts` to identify the `video-generations` target bucket and retrieve public URLs using `VIDEO_GENERATION_PUBLIC_URL`.
* Modify `backend/src/routes/ai.routes.ts` to upload generated videos to `'video-generations'` instead of `'image-generation'`.

### 3. Verification & Key Rotation
* Connect long-running operation predicting API queries to `executeWithKeyRotation` with support for BYOK.

## Verification Criteria
- [x] Backend connects to Google API predictLongRunning operation.
- [x] Polling loop queries status and handles completion or failures.
- [x] Video files are successfully uploaded to R2 `video-generations` bucket.
- [x] URL is returned correctly utilizing the public CDN domain.

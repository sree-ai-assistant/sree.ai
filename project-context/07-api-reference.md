# Backend API Reference

## Base URL

```
/api
```

## Route Registration (`routes/index.ts`)

```typescript
app.use('/api/health',            healthRoutes);
app.use('/api/user',              userRoutes);
app.use('/api/ai',                aiRoutes);
app.use('/api/models',            modelsRoutes);
app.use('/api/payment',           paymentRoutes);
app.use('/api/feature-requests',  featureRequestRoutes);
app.use('/api/config',            configRoutes);
```

---

## Health Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/health` | None | Server health check, returns `{ status: "ok" }` |

---

## AI Routes (`/api/ai`)

### Chat & Streaming

| Method | Endpoint | Auth | Middleware | Description |
|--------|----------|------|-----------|-------------|
| `POST` | `/ai/chat` | Flex | abuseDetect, queuePriority, featureGate(basicChat), rateLimit(chat) | Streaming chat completion via SSE. Supports text, multimodal (images, audio, video, documents) |
| `GET` | `/ai/usage` | Flex | — | Get comprehensive usage status (all tool limits + counts) |

**POST `/ai/chat` — Request Body:**
```json
{
  "messages": [{"role": "user", "content": "Hello"}],
  "model": "deepseek-ai/deepseek-v3.2",
  "attachments": [{"type": "document", "url": "...", "name": "file.pdf"}],
  "messageId": "uuid",
  "conversationId": "uuid",
  "mode": "voice"  // optional, skips chat credit charge
}
```

**SSE Response Events:**
```
data: {"status": "Processing documents..."}    // Progress
data: {"content": "Hello! "}                    // Token chunk
data: {"error": "API Key not found"}           // Error
data: [DONE]                                    // Stream complete
```

### Image Generation

| Method | Endpoint | Auth | Middleware | Description |
|--------|----------|------|-----------|-------------|
| `POST` | `/ai/image` | Flex | abuseDetect, queuePriority, featureGate(imageGeneration), rateLimit(image) | Generate image from prompt |
| `GET` | `/ai/images` | Flex | — | Get user's image gallery |
| `DELETE` | `/ai/image/:id` | Flex | — | Delete image from gallery |
| `GET` | `/ai/download` | Auth | rateLimit(download) | Download image from URL |

**POST `/ai/image` — Request Body:**
```json
{
  "prompt": "A sunset over mountains",
  "model": "black-forest-labs/flux-1-dev",
  "negative_prompt": "blurry, low quality",
  "seed": 42,
  "steps": 30,
  "width": 1024,
  "height": 1024,
  "cfg_scale": 7.5,
  "image": "base64...",     // For Kontext/img2img
  "mode": "edit",            // For Kontext
  "image_size": "square"     // For Google models
}
```

### Video Generation

| Method | Endpoint | Auth | Middleware | Description |
|--------|----------|------|-----------|-------------|
| `POST` | `/ai/video` | Auth (Starter+) | starterPlan, videoModelValidation, abuseDetect, queuePriority, featureGate(videoGeneration), rateLimit(video) | Generate video from prompt |
| `GET` | `/ai/videos` | Flex | — | Get user's video gallery |
| `DELETE` | `/ai/video/:id` | Flex | — | Delete video from gallery |

**POST `/ai/video` — Request Body:**
```json
{
  "prompt": "A cat playing piano",
  "model": "veo-3.1-generate",
  "resolution": "720p",
  "aspectRatio": "16:9",
  "durationSeconds": 5,
  "fileUrl": "https://...",     // Reference image URL
  "fileUrls": ["url1", "url2"], // Batch (up to 5)
  "lastFrameUrl": "https://..." // Last frame reference
}
```

### Voice & Speech

| Method | Endpoint | Auth | Middleware | Description |
|--------|----------|------|-----------|-------------|
| `POST` | `/ai/voice` | Flex | abuseDetect, queuePriority, featureGate(voiceToText), rateLimit(voice), upload | Transcribe audio (Deepgram) |
| `POST` | `/ai/stt` | Flex | abuseDetect, queuePriority, featureGate(voiceToText), rateLimit(stt), upload | Dictate mode STT (Groq → Deepgram cascade) |
| `POST` | `/ai/tts` | Flex | abuseDetect, queuePriority, rateLimit(voice) | Text-to-speech (Deepgram, returns audio stream) |
| `POST` | `/ai/voice-complete` | Flex | — | Charge voice credits after full voice flow |

### File Upload

| Method | Endpoint | Auth | Middleware | Description |
|--------|----------|------|-----------|-------------|
| `POST` | `/ai/upload` | Flex | abuseDetect, queuePriority, featureGate(fileUpload), rateLimit(file_upload), uploadAgreement, upload, uploadSizeValidator | Upload file to R2 |

### API Key Management (via AI routes)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/ai/list-api-keys` | Auth | List user's API keys |
| `POST` | `/ai/save-api-key` | Auth | Save a new API key |
| `PATCH` | `/ai/toggle-api-key` | Auth | Toggle key in_use status |
| `DELETE` | `/ai/delete-api-key/:id` | Auth | Delete an API key |

---

## User Routes (`/api/user`)

### Profile

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/user/profile` | Auth | Get full user profile |
| `PATCH` | `/user/profile` | Auth | Update profile fields (display_name, nickname, occupation, custom_instructions, more_about_you) |
| `POST` | `/user/profile/agree-upload` | Auth | Record file upload policy agreement |

### Avatar

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/user/avatar` | Auth | Upload avatar (5MB max, stored in Supabase Storage) |
| `DELETE` | `/user/avatar` | Auth | Remove avatar |

### Security

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/user/change-password` | Auth | Change password (min 6 chars) |

### API Keys (via User routes)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/user/settings/keys` | Auth | Save API key (with provider validation) |
| `GET` | `/user/settings/keys` | Auth | List API keys |
| `PATCH` | `/user/settings/keys/:id/toggle` | Auth | Toggle key |
| `DELETE` | `/user/settings/keys/:id` | Auth | Delete key |

### Sessions

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/user/sessions` | Auth | List active sessions |
| `POST` | `/user/sessions/sync` | Auth | Upsert current session (device_id, os, browser, ip) |
| `DELETE` | `/user/sessions/revoke-others` | Auth | Revoke all other sessions |
| `GET` | `/user/devices` | Auth | List trusted devices |
| `DELETE` | `/user/devices/:deviceId` | Auth | Remove trusted device |

### Account

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `DELETE` | `/user/account` | Auth | Delete account (cascading: cancel sub, delete data, delete auth user) |
| `POST` | `/user/migrate` | Auth | Migrate anonymous data to authenticated account |

---

## Payment Routes (`/api/payment`)

| Method | Endpoint | Auth | Rate Limit | Description |
|--------|----------|------|-----------|-------------|
| `POST` | `/payment/create-subscription` | Auth | 5/min | Create Razorpay subscription for checkout |
| `POST` | `/payment/verify` | Auth | 5/min | Verify payment signature and activate plan |
| `POST` | `/payment/webhook` | None | 30/min | Razorpay webhook handler (signature verified) |
| `GET` | `/payment/status` | Auth | — | Get subscription status + upcoming plan |
| `POST` | `/payment/cancel` | Auth | 3/min | Cancel subscription at cycle end |
| `POST` | `/payment/schedule-change` | Auth | 5/min | Schedule plan change for next billing cycle |
| `POST` | `/payment/activate-now` | Auth | 3/min | Create immediate subscription (skip deferred wait) |
| `POST` | `/payment/cancel-upcoming` | Auth | 3/min | Cancel a scheduled plan change |
| `GET` | `/payment/history` | Auth | — | Get payment history |
| `POST` | `/payment/sync-plans` | Auth | — | Sync Razorpay plans (admin utility) |

---

## Models Routes (`/api/models`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/models` | Flex | Get all AI models (returns all models, frontend shows locked/premium accordingly) |

---

## Feature Request Routes (`/api/feature-requests`)

| Method | Endpoint | Auth | Middleware | Description |
|--------|----------|------|-----------|-------------|
| `POST` | `/feature-requests` | Flex | featureRequestRateLimiter | Submit a new feature request or bug report |
| `POST` | `/feature-requests/upload-screenshot` | Flex | multer (10MB, image/*), featureRequestScreenshotRateLimiter | Upload bug report screenshot to R2 `feature-request` bucket |
| `GET` | `/feature-requests/my` | Flex | — | Get current user's feature requests |
| `GET` | `/feature-requests/public` | None | — | Get public roadmap (limit param, default 50) |
| `PATCH` | `/feature-requests/:ticketId/status` | Webhook Secret | — | Update request status (admin/n8n) |

**POST `/feature-requests` — Request Body:**
```json
{
  "title": "Bug: Chat stream cuts off",
  "category": "bug_report",
  "categoryLabel": "Bug / Glitch",
  "priority": "high_impact",
  "description": "The chat stream stops mid-sentence...",
  "stepsToReproduce": "1. Open chat\n2. Send a long prompt\n3. Observe stream cutoff",
  "screenshotUrl": "https://frss.sreeai.qzz.io/1234567890-abc.png",
  "referenceUrl": "https://github.com/...",
  "useCase": null
}
```

**POST `/feature-requests/upload-screenshot` — Request:**
- Content-Type: `multipart/form-data`
- Field: `screenshot` (single file, max 10 MB)
- Accepted MIME types: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/avif`
- Rate limits: 1 upload per 5 min, 10 per hour, 10 per day

**Response:**
```json
{
  "success": true,
  "url": "https://frss.sreeai.qzz.io/1725000000000-abc123def456.png"
}
```

---

## Config Routes (`/api/config`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/config/public` | None | Get whitelisted public config flags (e.g., `video_byok_only_banner`) |

---

## Standard Response Format

All endpoints return:

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

Error responses:

```json
{
  "success": false,
  "message": "Error description",
  "code": "ERROR_CODE"  // Optional: RATE_LIMIT_EXCEEDED, MODEL_LOCKED, PREMIUM_MODEL_RESTRICTED, etc.
}
```

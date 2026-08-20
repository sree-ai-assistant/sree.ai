# System Architecture & Data Flow

## High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        Browser["Browser (React SPA)"]
        PostHogJS["PostHog JS SDK"]
    end

    subgraph "Frontend (Vite + React 19)"
        Router["React Router v7"]
        Stores["Zustand Stores (9)"]
        APIClient["Axios Interceptor"]
        Supabase_FE["Supabase Client"]
    end

    subgraph "Backend (Express 5)"
        Middleware["Middleware Pipeline"]
        Routes["Route Handlers"]
        Services["Service Layer"]
    end

    subgraph "AI Providers"
        NVIDIA["NVIDIA NIM API"]
        Google["Google Gemini API"]
        Groq["Groq API"]
        Deepgram["Deepgram API"]
    end

    subgraph "Data Layer"
        Supabase["Supabase (PostgreSQL)"]
        R2["Cloudflare R2"]
        SupaStorage["Supabase Storage"]
    end

    subgraph "External Services"
        Razorpay["Razorpay Payments"]
        PostHogSrv["PostHog Analytics"]
        n8n["n8n Webhooks"]
    end

    Browser --> Router
    Router --> Stores
    Stores --> APIClient
    Stores --> Supabase_FE
    Browser --> PostHogJS
    PostHogJS --> PostHogSrv

    APIClient -->|"REST API /api/*"| Middleware
    Middleware --> Routes
    Routes --> Services

    Services --> NVIDIA
    Services --> Google
    Services --> Groq
    Services --> Deepgram

    Services --> Supabase
    Services --> R2
    Services --> SupaStorage
    Services --> Razorpay
    Services --> PostHogSrv
    Services --> n8n

    Razorpay -->|"Webhooks"| Routes
```

---

## Backend Middleware Pipeline

Every request to `/api/*` passes through this middleware chain in order:

```mermaid
graph LR
    A["Helmet (Security Headers)"] --> B["CORS (Dynamic Origins)"]
    B --> C["Morgan (Request Logging)"]
    C --> D["Cookie Parser"]
    D --> E["JSON Body Parser (50MB limit, rawBody preserved)"]
    E --> F["URL-encoded Parser"]
    F --> G["Route Handler"]
    G --> H["Error Handler"]
```

### Per-Route Middleware (Applied Selectively)

| Middleware | Purpose | Applied To |
|-----------|---------|-----------|
| `authMiddleware` | Requires Bearer token, attaches `req.user` + `req.userTier` | Protected routes (settings, image, video, payment) |
| `flexAuthMiddleware` | Auth optional — resolves authenticated OR anonymous identity | Chat, usage, models, feature requests |
| `anonymousIdentity` | Creates/restores anonymous identity via fingerprint + cookie | Anonymous-capable routes |
| `abuseDetectionMiddleware` | Datacenter IP detection, strict mode for suspicious requests | AI chat/generation |
| `rateLimitMiddleware(tool)` | Per-minute/daily/monthly rate limits based on tier | All AI endpoints |
| `featureGateMiddleware(feat)` | Checks if tier has feature access | Chat, image, video |
| `uploadSizeValidator` | Validates file size against tier limit | Upload endpoints |
| `uploadAgreementMiddleware` | Checks user agreed to upload policy | File upload endpoints |
| `queuePriorityMiddleware` | Sets queue priority based on tier (0-3) | AI endpoints |
| `starterPlanMiddleware` | Requires Starter or Pro tier | Video generation |
| `videoModelValidationMiddleware` | Validates allowed video model IDs | Video generation |
| `paymentRateLimit(max, window)` | In-memory sliding window limiter | Payment endpoints |

---

## Request Lifecycle

### Authenticated Request Flow

```mermaid
sequenceDiagram
    participant Browser
    participant AxiosInterceptor as Axios Interceptor
    participant SupabaseAuth as Supabase Auth
    participant Express as Express Backend
    participant AuthMW as Auth Middleware
    participant RateLimitMW as Rate Limit MW
    participant AIService as AI Service
    participant AIProvider as AI Provider (NVIDIA/Google)
    participant DB as Supabase DB

    Browser->>AxiosInterceptor: API Request
    AxiosInterceptor->>SupabaseAuth: getSession()
    SupabaseAuth-->>AxiosInterceptor: JWT Access Token
    AxiosInterceptor->>Express: GET/POST /api/... (Bearer token)
    Express->>AuthMW: Verify Token
    AuthMW->>DB: supabaseAdmin.auth.getUser(token)
    DB-->>AuthMW: User object
    AuthMW->>DB: Fetch profiles.plan_type
    DB-->>AuthMW: plan_type (free/starter/pro)
    AuthMW->>RateLimitMW: req.user + req.userTier set
    RateLimitMW->>DB: RPC increment_multi_usage()
    DB-->>RateLimitMW: allowed: true/false
    alt Rate limit exceeded
        RateLimitMW-->>Browser: 429 + usage details
    end
    RateLimitMW->>AIService: Process request
    AIService->>AIProvider: Forward to provider
    AIProvider-->>AIService: AI Response (streaming)
    AIService-->>Browser: SSE Stream / JSON response
```

### Anonymous Request Flow

```mermaid
sequenceDiagram
    participant Browser
    participant AxiosInterceptor as Axios Interceptor
    participant Express as Express Backend
    participant AnonMW as Anonymous Identity MW
    participant AnonService as Anonymous Service
    participant DB as Supabase DB

    Browser->>AxiosInterceptor: API Request (no auth)
    AxiosInterceptor->>AxiosInterceptor: No session → attach X-Anon-Id + X-Fingerprint headers
    AxiosInterceptor->>Express: POST /api/ai/chat (anon headers)
    Express->>AnonMW: flexAuthMiddleware
    AnonMW->>AnonMW: No Bearer token → anonymous flow
    AnonMW->>AnonService: resolveAnonymousIdentity(anonId, fingerprint, IP)
    alt New visitor
        AnonService->>DB: INSERT into anonymous_users
        DB-->>AnonService: New anon_id
    else Returning visitor (cookie lost)
        AnonService->>DB: Lookup by fingerprint + IP hash
        DB-->>AnonService: Restored anon_id
        AnonMW-->>Browser: X-Restored-Anon-Id header
    end
    AnonMW->>Express: req.anonId + req.userTier = 'anonymous'
    Note over Express: Continue with rate limiting (anonymous tier limits)
```

---

## AI Provider Architecture

```mermaid
graph TB
    subgraph "Request Entry"
        ChatRoute["/api/ai/chat"]
        ImageRoute["/api/ai/image"]
        VideoRoute["/api/ai/video"]
        TTSRoute["/api/ai/tts"]
        STTRoute["/api/stt"]
    end

    subgraph "Provider Resolution"
        ProviderResolver["providerResolver.ts"]
        ModelDB["ai_models table"]
        ProviderMap["Hardcoded PROVIDER_MAP"]
    end

    subgraph "Key Management"
        BYOKCheck{"User has own key?"}
        UserKeyService["ApiKeyService (BYOK)"]
        PoolKeyService["ApiKeyPool (Platform Keys)"]
    end

    subgraph "API Key Pool"
        PoolNVIDIA["NVIDIA Keys Pool"]
        PoolGoogle["Google Keys Pool"]
        PoolGroq["Groq Keys Pool"]
        HealthTracker["Health States: healthy | cooldown | dead"]
    end

    subgraph "AI Providers"
        NVIDIA_API["NVIDIA NIM (OpenAI-compatible)"]
        Google_API["Google Gemini (REST / generativelanguage)"]
        Groq_API["Groq (OpenAI-compatible)"]
        Deepgram_API["Deepgram (Audio)"]
    end

    ChatRoute --> ProviderResolver
    ImageRoute --> ProviderResolver
    VideoRoute --> ProviderResolver

    ProviderResolver --> ModelDB
    ProviderResolver --> ProviderMap

    ProviderResolver --> BYOKCheck
    BYOKCheck -->|"Yes"| UserKeyService
    BYOKCheck -->|"No"| PoolKeyService

    UserKeyService --> NVIDIA_API
    UserKeyService --> Google_API
    UserKeyService --> Groq_API

    PoolKeyService --> PoolNVIDIA
    PoolKeyService --> PoolGoogle
    PoolKeyService --> PoolGroq
    PoolNVIDIA --> HealthTracker
    PoolGoogle --> HealthTracker
    PoolGroq --> HealthTracker

    PoolNVIDIA --> NVIDIA_API
    PoolGoogle --> Google_API
    PoolGroq --> Groq_API

    STTRoute --> Deepgram_API
    TTSRoute --> Google_API
```

### Provider Resolution Logic (`providerResolver.ts`)

1. **In-memory cache** — Check if model→provider is already resolved
2. **Database lookup** — Query `ai_models.provider` by `model_id`
3. **Hardcoded map** — Fallback `PROVIDER_MAP` with 80+ model→provider mappings
4. **Prefix matching** — Safety net: `gemini-*` → google, `groq/*` → groq, `nvidia/*` etc. → nvidia

### API Key Pool (`apiKeyPool.service.ts`)

Multi-key rotation with health tracking per provider:

| State | Meaning | Recovery |
|-------|---------|----------|
| `healthy` | Key is working | Used immediately |
| `cooldown` | Rate limited (429) or server error (5xx) | Auto-recovers after 10-60s |
| `dead` | Auth failure (401/403) | Never auto-recovers |

**Rotation strategy:** Round-robin per request. On error, the failing key's state is updated and the next healthy key is tried. Retry count = pool size.

---

## Data Flow: Chat Completion (Streaming)

```mermaid
sequenceDiagram
    participant FE as Frontend (ChatPage)
    participant Store as chat.store (Zustand)
    participant API as Axios → /api/ai/chat
    participant MW as Middleware Chain
    participant AIRoute as ai.routes.ts
    participant AIService as ai.service.ts
    participant Provider as AI Provider
    participant DB as Supabase DB

    FE->>Store: sendMessage(text, model, attachments)
    Store->>API: POST /api/ai/chat {messages, model, attachments, conversationId}
    API->>MW: flexAuth → abuseDetection → queuePriority → featureGate → rateLimit
    MW->>AIRoute: Authorized + within limits

    alt Has document attachments
        AIRoute->>AIRoute: Extract text (PDF/DOCX/XLSX)
        AIRoute->>AIRoute: TokenManager.truncateDocumentText (100K limit)
        AIRoute->>AIRoute: Append context to last user message
    end

    alt Has audio attachments
        AIRoute->>Provider: Deepgram.transcribe(audio)
        Provider-->>AIRoute: Transcript text
        AIRoute->>AIRoute: Append transcript to context
    end

    alt Has video attachments
        AIRoute->>AIRoute: ffmpeg → extract frames
        AIRoute->>AIRoute: Convert frames to base64
        AIRoute->>AIRoute: Add as vision content parts
    end

    AIRoute->>AIRoute: Resolve provider for model
    AIRoute->>AIRoute: Check BYOK vs platform key

    AIRoute->>AIService: chatCompletion(messages, model, key)
    AIService->>Provider: Streaming request (SSE/chunks)
    loop Each chunk
        Provider-->>AIService: Token chunk
        AIService-->>AIRoute: Yield chunk
        AIRoute-->>FE: SSE data: {content: "..."}
    end
    AIRoute-->>FE: SSE data: [DONE]

    AIRoute->>DB: Persist assistant message
    AIRoute->>DB: Update conversation title (if first message)
```

---

## Monorepo Package Dependency Graph

```mermaid
graph TD
    Root["sree-ai (Root)"]
    Frontend["frontend"]
    Backend["backend"]
    Shared["@sree/shared"]

    Root --> Frontend
    Root --> Backend
    Root --> Shared

    Frontend -->|"imports"| Shared
    Backend -->|"imports"| Shared

    Shared -->|"exports"| Types["User type, APP_NAME constant"]
```

The `shared` package exports:
- **Types:** `User` interface (`id, email, plan_type, requests_remaining, credits`)
- **Constants:** `APP_NAME = 'Sree AI'`

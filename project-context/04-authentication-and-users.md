# Authentication & User Management

## Authentication Methods

Sree AI supports three identity modes:

| Mode | Method | Capabilities |
|------|--------|-------------|
| **Anonymous** | Browser fingerprint + IP hash | Limited chat (3/day, 1/min), no image/video/voice |
| **Free** | Email/password or Google OAuth | Chat (25/day), Image (3/day), Voice (5/day), 10MB uploads |
| **Paid (Starter/Pro)** | Same as Free + active subscription | Full feature access with higher limits |

---

## Supabase Auth Integration

### Frontend (`auth.store.ts`)

```
┌─────────────────────────────────────────────────┐
│ initializeAuth()                                 │
│                                                  │
│ 1. supabase.auth.getSession()                   │
│    → Loads existing session from localStorage    │
│                                                  │
│ 2. supabase.auth.onAuthStateChange(callback)    │
│    → Listens for: SIGNED_IN, SIGNED_OUT,        │
│      TOKEN_REFRESHED, INITIAL_SESSION           │
│                                                  │
│ 3. On SIGNED_IN:                                │
│    → Set user in Zustand store                  │
│    → PostHog identify(user_id, {plan, email})   │
│    → Fetch profile from /api/user/profile       │
│    → Check onboarding status                    │
│                                                  │
│ 4. On SIGNED_OUT:                               │
│    → Clear user from store                      │
│    → PostHog reset()                            │
│    → Redirect to /login                         │
│                                                  │
│ 5. On TOKEN_REFRESHED:                          │
│    → Update session token silently              │
└─────────────────────────────────────────────────┘
```

### Backend Auth Middleware (`middleware/auth.ts`)

```typescript
// authMiddleware — Strict authentication required
async (req, res, next) => {
  1. Extract Bearer token from Authorization header
  2. supabaseAdmin.auth.getUser(token) → verify JWT
  3. Fetch profile.plan_type from profiles table
  4. Resolve tier: profile.plan_type || 'free'
  5. Check BYOK: Look for active api_keys where in_use = true
  6. Attach to request:
     - req.user = { id, email, ... }
     - req.userTier = 'free' | 'starter' | 'pro'
     - req.isByok = boolean
}

// flexAuthMiddleware — Auth optional, supports anonymous
async (req, res, next) => {
  1. Try Bearer token → if valid, same as authMiddleware
  2. If no token → resolve anonymous identity:
     - Read X-Anon-Id header (localStorage UUID)
     - Read X-Fingerprint header (browser fingerprint hash)
     - Read __anon_id cookie (backup)
     - resolveAnonymousIdentity(anonId, fingerprint, ipHash)
  3. Attach to request:
     - req.anonId = resolved anonymous ID
     - req.userTier = 'anonymous'
     - req.anonymousUser = DB record
}
```

---

## Anonymous Identity System

### Flow Diagram

```mermaid
graph TD
    A["New Visitor"] --> B{"Has __anon_id cookie?"}
    B -->|"Yes"| C["Use cookie anon_id"]
    B -->|"No"| D{"Has X-Anon-Id header?"}
    D -->|"Yes"| E["Lookup by anon_id in DB"]
    D -->|"No"| F["Generate new anon_id"]

    E --> G{"Found in DB?"}
    G -->|"Yes"| H["Restore identity, update last_seen"]
    G -->|"No"| I{"Fingerprint + IP match?"}
    I -->|"Yes"| J["Recover identity (cookie lost scenario)"]
    I -->|"No"| K["Create new anonymous_users record"]

    F --> K
    C --> H
    J --> L["Set X-Restored-Anon-Id header"]
    H --> M["Set __anon_id cookie (30 days)"]
    K --> M
    L --> M
```

### Key Implementation Details

- **Fingerprint:** SHA-256 hash of browser properties (canvas, WebGL, fonts, screen, etc.)
- **IP Hash:** SHA-256 hash of client IP — raw IP is **never stored**
- **Cookie:** `__anon_id` with 30-day expiry, `SameSite=Lax`, `httpOnly=true`
- **Recovery:** If cookie is lost, the system tries to match by fingerprint hash + IP hash combo
- **Table:** `anonymous_users` (id, anon_id, fingerprint_hash, ip_hash, user_agent, country, daily counters, migration info)

---

## User Profile (profiles table)

When a user signs up, a database trigger `handle_new_user()` automatically creates a profile:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID (PK) | Same as `auth.users.id` |
| `display_name` | TEXT | User's display name |
| `nickname` | TEXT | Preferred short name |
| `email` | TEXT | From auth provider |
| `avatar_url` | TEXT | Supabase Storage URL |
| `occupation` | TEXT | User's role (set during onboarding) |
| `custom_instructions` | TEXT | System prompt preferences |
| `more_about_you` | TEXT | Additional personalization context |
| `plan_type` | TEXT | `free` / `starter` / `pro` |
| `has_completed_onboarding` | BOOLEAN | Gate for onboarding guard |
| `onboarding_step` | INTEGER | Current onboarding step (0-4) |
| `chat_limit_daily` | INTEGER | Denormalized daily chat limit |
| `chat_limit_monthly` | INTEGER | Denormalized monthly chat limit |
| `voice_limit_daily` | INTEGER | Denormalized daily voice limit |
| `voice_limit_monthly` | INTEGER | Denormalized monthly voice limit |
| `image_limit_daily` | INTEGER | Denormalized daily image limit |
| `image_limit_monthly` | INTEGER | Denormalized monthly image limit |
| `upload_limit_mb` | INTEGER | Max file size per plan |
| `file_upload_agreed` | BOOLEAN | User accepted upload policy |
| `file_upload_agreed_at` | TIMESTAMPTZ | When policy was accepted |
| `cookie_consent` | BOOLEAN | GDPR consent status |
| `created_at` | TIMESTAMPTZ | Account creation time |
| `updated_at` | TIMESTAMPTZ | Last profile update |

---

## Onboarding Flow

```mermaid
graph LR
    A["Signup / Login"] --> B{"has_completed_onboarding?"}
    B -->|"No"| C["OnboardingGuard → /onboarding"]
    B -->|"Yes"| D["HybridOnboardingGuard → Normal App"]

    C --> E["Step 0: Welcome"]
    E --> F["Step 1: Choose Nickname"]
    F --> G["Step 2: Select Occupation"]
    G --> H["Step 3: Custom Instructions"]
    H --> I["Step 4: Complete"]
    I --> J["Mark onboarding complete → Redirect to /chat"]
```

### Route Guards

| Guard | Location | Behavior |
|-------|----------|----------|
| `OnboardingGuard` | Wraps protected routes | If `has_completed_onboarding = false` → redirect to `/onboarding` |
| `HybridOnboardingGuard` | Wraps hybrid routes (chat) | If authenticated + not onboarded → redirect to `/onboarding`. Anonymous users pass through. |

---

## Data Migration (Anonymous → Authenticated)

When an anonymous user signs up, their conversations and messages are migrated to their new authenticated account:

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as Backend (/api/user/migrate)
    participant DB as Supabase DB

    FE->>FE: User completes signup
    FE->>BE: POST /api/user/migrate {anonymous_id}
    BE->>DB: UPDATE conversations SET user_id = :userId, anon_id = NULL WHERE anon_id = :anonId
    BE->>DB: UPDATE anonymous_users SET migrated_to_user_id = :userId, migrated_at = now()
    BE->>DB: DELETE usage_tracking WHERE anon_id = :anonId
    BE-->>FE: Migration complete
    FE->>FE: Clear local anonymous state
```

---

## Session Management

The app tracks active sessions per user device:

- **`user_sessions`** — Active sessions with `device_id`, `os`, `browser`, `ip_address`, `is_current`
- **`trusted_devices`** — Known devices that have been seen before
- **Upsert strategy** — Uses unique index on `(user_id, device_id)` to prevent duplicates
- **Revoke others** — User can terminate all other sessions from Settings

### Cookie Consent (GDPR)

- Tracked via `profiles.cookie_consent` boolean
- `CookieConsent` component shown on first visit
- Consent synced to profile via `PATCH /api/user/profile`
- PostHog only initialized after consent

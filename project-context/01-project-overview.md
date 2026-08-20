# Sree AI — Project Overview

## What is Sree AI?

**Sree AI** is a multi-modal AI SaaS platform developed by **NilStudio**. It provides users with a unified interface to interact with AI through text chat, voice, image generation, and video generation — all powered by a multi-provider backend that routes requests to NVIDIA NIM, Google Gemini, Groq, and Deepgram.

The app supports **anonymous usage** (no signup required for basic chat), **freemium tiers** (Free → Starter → Pro), and **Bring Your Own Key (BYOK)** to let power users plug in their own API keys.

**App Name:** `sree-ai`  
**Package Name:** `@sree/shared` (shared module)  
**Primary URL:** `https://sreeai.qzz.io` / `https://app.sreeai.qzz.io`

---

## Monorepo Structure

The project is a **npm workspaces monorepo** with three packages:

```
Ai-Sass-3/
├── frontend/          # React 19 + Vite 8 SPA
├── backend/           # Express 5 REST API
├── shared/            # Shared types & constants (@sree/shared)
├── supabase/          # Database migrations (25 migration files)
├── design-system/     # Design system documentation
├── docs/              # Legacy .docx documentation (PRD, TRD, etc.)
├── package.json       # Root workspace config
└── vercel.json        # Frontend deployment config (SPA rewrites)
```

### Workspace Configuration (`package.json`)
```json
{
  "name": "sree-ai",
  "workspaces": ["frontend", "backend", "shared"],
  "scripts": {
    "dev": "npm run dev --workspaces --if-present",
    "build": "npm run build --workspaces --if-present",
    "shared:build": "npm run build -w shared",
    "backend:dev": "npm run dev -w backend",
    "frontend:dev": "npm run dev -w frontend"
  }
}
```

---

## Key Project Statistics

| Metric | Count |
|--------|-------|
| **Frontend Pages** | 10 (Chat, Image, Video, Dashboard, Settings, Pricing, Onboarding, Feature Request, Login, Signup) |
| **Backend Route Files** | 8 (AI, Payment, User, Models, Health, Config, Feature Requests, STT) |
| **Backend Services** | 16 (AI, Razorpay, Usage, Subscription, Anonymous, Abuse, API Key, API Key Pool, File, PostHog, Queue, R2, Video, Feature Request, Provider Validation, Encryption) |
| **Zustand Stores** | 9 (auth, chat, image, video, model, usage, ui, onboarding, upload-agreement) |
| **Database Migrations** | 25 SQL files |
| **Middleware** | 9 (auth, anonymousIdentity, rateLimit, abuseDetection, errorHandler, uploadEnforcement, featureRequestRateLimit) |
| **AI Providers** | 4 (NVIDIA NIM, Google Gemini, Groq, Deepgram) |
| **AI Models** | 80+ models registered in `ai_models` table |

---

## Deployment Architecture

| Component | Platform |
|-----------|----------|
| **Frontend** | Vercel (SPA with catch-all rewrite to `index.html`) |
| **Backend** | Server (Express on configurable PORT, default 5000) |
| **Database** | Supabase (PostgreSQL with RLS + Auth) |
| **File Storage** | Cloudflare R2 (S3-compatible) + Supabase Storage (avatars) |
| **Analytics** | PostHog (error tracking, session replay) |
| **Automation** | n8n (feature request webhooks, payment failure emails) |

---

## Development Commands

```bash
# Start all workspaces in dev mode
npm run dev

# Start only backend
npm run backend:dev

# Start only frontend
npm run frontend:dev

# Build shared module (required before backend uses it)
npm run shared:build

# Run tests
npm run test
```

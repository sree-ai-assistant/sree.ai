# Tech Stack — Complete Technology Inventory

## Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **React** | 19.2.x | UI framework (latest with concurrent features) |
| **Vite** | 8.0.x | Build tool & dev server |
| **TypeScript** | ~6.0.x | Type safety |
| **React Router** | 7.14.x | Client-side routing (SPA) |
| **Zustand** | 5.0.x | Lightweight state management (9 stores) |
| **Framer Motion** | 12.38.x | Animations & transitions |
| **Tailwind CSS** | 4.2.x | Utility-first CSS framework |
| **CSS Modules** | Built-in | Scoped component styles (`*.module.css`) |
| **Axios** | 1.15.x | HTTP client with interceptors |
| **Radix UI** | Various | Headless accessible primitives (Dialog, Dropdown, Switch, Tabs, Slider, Popover, Label, Slot) |
| **react-hot-toast** | 2.6.x | Toast notifications |
| **react-markdown** | 10.1.x | Markdown rendering in chat |
| **react-syntax-highlighter** | 16.1.x | Code syntax highlighting |
| **remark-gfm** | 4.0.x | GitHub Flavored Markdown |
| **@lobehub/icons** | 5.8.x | AI model provider icons |
| **lucide-react** | 0.474.x | General UI icons |
| **class-variance-authority** | 0.7.x | Component variant management |
| **clsx** / **tailwind-merge** | Latest | Conditional class utilities |
| **mammoth** | 1.12.x | `.docx` file extraction (frontend) |
| **pdfjs-dist** | 5.4.x | PDF file parsing (frontend) |
| **xlsx** | 0.18.x | Excel/spreadsheet parsing |
| **@supabase/supabase-js** | 2.103.x | Supabase client (auth + DB queries) |
| **posthog-js** | 1.413.x | Analytics & error tracking |
| **@posthog/react** | 1.10.x | React PostHog provider |

---

## Backend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Express** | 5.2.x | HTTP framework (latest v5) |
| **TypeScript** | 5.9.x | Type safety |
| **ts-node-dev** | 2.0.x | Dev server with hot reload |
| **Zod** | 4.3.x | Runtime validation |
| **OpenAI SDK** | 6.34.x | OpenAI-compatible API client (used for NVIDIA NIM, Groq) |
| **@deepgram/sdk** | 5.0.x | Speech-to-text transcription |
| **Razorpay** | 2.9.x | Payment gateway SDK |
| **@supabase/supabase-js** | 2.103.x | Database & auth (service role) |
| **@aws-sdk/client-s3** | 3.1033.x | Cloudflare R2 file storage |
| **@aws-sdk/s3-request-presigner** | 3.1033.x | Signed URL generation |
| **Multer** | 2.1.x | File upload handling |
| **jose** | 6.2.x | JWT handling |
| **crypto-js** | 4.2.x | AES encryption for API keys |
| **tiktoken** | 1.0.x | Token counting |
| **fluent-ffmpeg** | 2.1.x | Video frame extraction |
| **ffmpeg-static** / **ffprobe-static** | Latest | FFmpeg binaries |
| **mammoth** | 1.12.x | `.docx` extraction (backend) |
| **pdf-parse** | 2.4.x | PDF text extraction (backend) |
| **xlsx** | 0.18.x | Spreadsheet parsing |
| **posthog-node** | 5.48.x | Server-side analytics |
| **Helmet** | 8.1.x | Security headers |
| **CORS** | 2.8.x | Cross-origin request handling |
| **Morgan** | 1.10.x | HTTP request logging |
| **cookie-parser** | 1.4.x | Cookie parsing |
| **ip-address** / **ip-cidr** | Latest | Datacenter IP detection |
| **uuid** | 14.0.x | UUID generation |
| **ws** | 8.21.x | WebSocket support |
| **Vitest** | 4.1.x | Testing framework |
| **Supertest** | 7.2.x | HTTP assertion testing |

---

## Database & Auth

| Technology | Purpose |
|-----------|---------|
| **Supabase** | PostgreSQL database + Auth service |
| **PostgreSQL** | Core relational database |
| **Row Level Security (RLS)** | Fine-grained access control on all tables |
| **Supabase RPC** | Stored functions for atomic operations (`increment_multi_usage`) |
| **Supabase Auth** | Email/password + OAuth (Google) authentication |
| **Supabase Storage** | Avatar file storage |
| **Database Triggers** | Auto-create profile on user signup |

---

## Payment

| Technology | Purpose |
|-----------|---------|
| **Razorpay** | Payment gateway (INR subscriptions) |
| **Razorpay Plans** | Recurring billing plan management |
| **Razorpay Subscriptions** | Subscription lifecycle (create, cancel, pause, resume, defer) |
| **Razorpay Webhooks** | Real-time event processing (activated, charged, cancelled, failed) |
| **HMAC-SHA256** | Payment signature verification |

---

## AI Providers

| Provider | Models | Use Case |
|----------|--------|----------|
| **NVIDIA NIM** | 80+ models (DeepSeek, Llama, Mistral, Qwen, Gemma, Phi, FLUX, Stable Diffusion) | Chat, Image Generation |
| **Google Gemini** | Gemini 2.5/3.x/3.5+, Veo 3.1 | Chat, Image Gen, Video Gen |
| **Groq** | Compound, Compound-mini | Fast inference chat |
| **Deepgram** | Nova models | Speech-to-text transcription |

---

## Infrastructure & DevOps

| Technology | Purpose |
|-----------|---------|
| **Vercel** | Frontend hosting (SPA) |
| **Cloudflare R2** | S3-compatible object storage for files |
| **n8n** | Webhook automation (feature requests, payment failure emails) |
| **PostHog** | Product analytics, error tracking, session replay |
| **npm Workspaces** | Monorepo management |

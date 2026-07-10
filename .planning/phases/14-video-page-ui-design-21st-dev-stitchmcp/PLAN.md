# Phase 14 Plan: Video Page UI Design

This phase creates the premium, glassmorphic Video Generation page matching the layout and responsiveness of the Image Generation interface.

## User Story & Objective
* **Goal:** A user can navigate to the `/video` page, customize generation parameters (models, aspect ratio, quality/speed tier, audio toggle), input a prompt (via text or voice dictation), view generation results, and download/view generated videos.
* **Access Gating:** The Video page is restricted to users with active billing plans (`starter` or `pro`). Users on `free` or anonymous status will see an upgrade modal/notice or redirect to `/pricing`.

## Technical Tasks

### 1. State Management (`video.store.ts`)
* Create `frontend/src/store/video.store.ts` using Zustand.
* Define `VideoSettings` structure:
  * `prompt`: string
  * `modelId`: string (default `veo-3.1-fast-generate-preview`)
  * `ratioIndex`: number (0 for 16:9, 1 for 9:16, 2 for 1:1)
  * `speedTier`: 'standard' | 'fast' | 'lite'
  * `includeAudio`: boolean
* Manage `history` array of generated videos, `activeVideo` state, `isGenerating` state.
* Mock generation logic: simulate a successful generation after a 3-second timeout returning `/Sree-Ai-logo-Animation.mp4`.

### 2. Routing & Navigation
* Modify `frontend/src/App.tsx` to add `/video` route wrapped in `<ProtectedRoute>`.
* Modify `frontend/src/components/layout/Navbar.tsx`:
  * Add `/video` link in `navLinks` list using Lucide `Video` icon.
  * Define `isVideoPage = location.pathname.startsWith('/video')`.
  * Ensure user profile menus and header structures remain visible on `/video` exactly like `/images`.
* Add custom class logic in `Navbar.module.css` if necessary to show items on `/video` tab.

### 3. Video Generation Interface (`VideoGenPage.tsx` & CSS)
* Create `frontend/src/pages/VideoGenPage.tsx` and `frontend/src/pages/VideoGenPage.module.css`.
* Implement a collapsible Sidebar matching the Image generation style.
* Sidebar parameters:
  * **Model Picker:** Selection dropdown listing Google Veo models.
  * **Aspect Ratio Selection:** Graphical aspect ratio selectors for 16:9, 9:16, 1:1.
  * **Speed/Quality Selection:** Selector with tooltip info explaining credits per second.
  * **Audio Toggle:** Include audio switch.
* Main Cinematic Viewport:
  * Display a premium video player layout with overlay triggers (play, pause, volume, download, maximize).
  * Handle isGenerating loader state (a custom pulsing loader or skeleton frame).
* Gating Check:
  * Read user plan state from `useAuthStore`.
  * If user plan type is `free` or anonymous, render an elegant premium lock screen or open the UpgradeModal, blocking generation.

### 4. Dictation Mode
* Build microphone recording triggers next to the prompt text area.
* Replicate the `VoiceWaveformTrace` context and rendering loops from `ChatInput.tsx` to display real-time audio visualization waveforms inside/around the input during dictation.
* Transcribe voice capture via `aiService.stt` and populate the prompt input field.

## Verification Criteria
- [ ] Router `/video` mounts successfully and guards against free tier users.
- [ ] Collapsible settings sidebar functions responsively on tablet and mobile viewports.
- [ ] Speech-to-text voice dictation recorder initializes and transcribes inputs into the prompt field.
- [ ] Video cinematic player works with full play/pause, download, and maximize controls.

# Research: Tech Stack for NVIDIA NIM Integration

## Core Libraries
- **OpenAI Node.js SDK**: Use the standard `openai` package for compatibility with NVIDIA NIM's API specification.
  - Version: latest (`^4.0.0+`)
- **Backend**: Express/Node.js (Existing)
- **Frontend**: React + Vite (Existing)

## API Configuration
- **Base URL**: `https://integrate.api.nvidia.com/v1`
- **Authentication**: Bearer token prefixed with `nvapi-`.
- **Protocol**: REST with Server-Sent Events (SSE) for streaming.

## Integration points
- `backend/src/services/ai.service.ts`: Modify to dynamically switch base URLs and model IDs based on user selection.
- `frontend/src/api/chat.ts`: Update to pass a `modelId` parameter to the backend.

## Why this stack?
- NVIDIA NIM is designed to be a drop-in replacement for any OpenAI-compatible client. This reduces architectural complexity and leverages stable libraries.

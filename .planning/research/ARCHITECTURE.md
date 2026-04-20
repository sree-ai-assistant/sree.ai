# Research: Architecture for NVIDIA NIM Integration

## Data Flow
1. **Frontend**: User selects model -> State `currentModel` updated.
2. **Frontend**: Message sent -> JSON payload `{ modelId: string, message: string }`.
3. **Backend Middleware**: Verify user subscription tier against requested `modelId`.
4. **Backend Service**: `aiService.getChatCompletion(modelId, messages)`
   - Initializes `OpenAI` client with `baseURL` for NVIDIA.
   - Forwards request to NIM API.
5. **NIM API**: Processes request and returns stream.
6. **Backend Service**: Pipes stream back to client.

## Component Map
- `ChatLayout`: Houses the model selector.
- `ModelSelector`: Reusable component displaying tiers, icons, and lock status.
- `PricingModal`: Global overlay triggered by locked selections.
- `aiService`: Abstract service for multi-provider support (OpenAI, Anthropic, NVIDIA NIM).

## Security & Validation
- **Tier Validation**: Crucial to prevent API abuse where free users might send manual requests for pro models.
- **API Key Management**: Centralized in `.env` (never exposed to frontend).

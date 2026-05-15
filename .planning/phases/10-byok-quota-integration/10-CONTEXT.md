# Phase 10 Context: BYOK Quota Integration

## Objective
Integrate the "Bring Your Own Key" (BYOK) system with the usage tracking and rate limiting engine. When users use their own API keys, their quota consumption should be significantly reduced (0.2x multiplier) to encourage BYOK usage and reduce platform costs.

## Current State
- `UsageService` (backend) already includes a `BYOK_QUOTA_MULTIPLIER` of 0.2 in its logic.
- `ApiKeyService` handles fetching user-provided keys from the `api_keys` table.
- `rateLimitMiddleware` is used in AI routes but currently hardcodes the provider or doesn't dynamically detect BYOK state for all providers.
- `usage_tracking` table in Supabase has an `is_byok` column (or we need to ensure it's used correctly in the RPC).

## Key Requirements
- **BYOK-01**: Automatic detection of user-provided keys during AI requests.
- **BYOK-02**: Reduced quota consumption (0.2x) recorded in the database.
- **Provider Support**: OpenAI, Anthropic, Gemini, Groq.

## Technical Strategy
1. **Dynamic Provider Detection**: Update AI routes to determine the provider from the selected model.
2. **BYOK State Detection**: Check `ApiKeyService.getUserApiKey` to see if a user key is being used.
3. **Middleware Integration**: Pass the `isByok` flag to `checkAndIncrementUsage`.
4. **UI Feedback**: Update the frontend usage display to show if BYOK is active and the reduced rate.

## Constraints
- Must not break anonymous usage (which never has BYOK).
- Must handle fallback to platform keys if user key is invalid (and charge full price).

# Phase 10 Plan: BYOK Quota Integration

Enable users to use their own API keys to save 80% on quota consumption (0.2x multiplier).

## 1. Backend Implementation

### 1.1 Model-to-Provider Mapping
- [ ] Create `backend/src/utils/providerResolver.ts`
- [ ] Implement `resolveProvider(modelId: string): string` to map models to their parent providers (OpenAI, Anthropic, Gemini, Groq, NVIDIA).

### 1.2 Rate Limit Middleware Enhancements
- [ ] Update `backend/src/middleware/rateLimit.ts`
- [ ] Integrate `providerResolver` to dynamically detect the provider if not provided in the request body.
- [ ] Check `ApiKeyService` for the presence of a valid user key for that provider.
- [ ] Set `req.isByok = true` if a user key is found.

### 1.3 Quota Multiplier Logic
- [ ] Review `backend/src/services/usage.service.ts`
- [ ] Ensure `checkAndIncrementUsage` and `checkAndIncrementMultiUsage` (via Supabase RPC) correctly apply the 0.2x multiplier when `isByok` is true.

## 2. Frontend Implementation

### 2.1 BYOK Indicator
- [ ] Update `frontend/src/components/chat/ModelSelector.tsx`
- [ ] Add a "BYOK Active" badge or tooltip when the user has an API key configured for the selected model's provider.

### 2.2 Usage Visualization
- [ ] Update `frontend/src/components/dashboard/UsageOverview.tsx`
- [ ] Show "BYOK Discount Active" status.
- [ ] Update quota progress bars to reflect the 0.2x consumption rate where applicable.

## 3. Verification & Testing

### 3.1 Backend Unit Test
- [ ] Create `backend/scratch/test-byok-logic.ts`
- [ ] Verify that a request with `isByok: true` increments the usage counter by exactly 0.2 units.

### 3.2 End-to-End Test
- [ ] Configure a dummy key in Settings.
- [ ] Perform a chat request.
- [ ] Verify the `usage_tracking` table shows the correct increment.

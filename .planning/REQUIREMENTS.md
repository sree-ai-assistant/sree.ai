# Requirements: Milestone v2.0 Multi-Model Ecosystem

## 1. API Integration (NIM)
- [ ] **NIM-01**: Backend must support connection to `https://integrate.api.nvidia.com/v1`.
- [ ] **NIM-02**: `aiService` must allow passing a dynamic `modelId` from the frontend.
- [ ] **NIM-03**: Backend must handle streaming responses from NVIDIA NIM using Server-Sent Events.
- [ ] **NIM-04**: Implement error handling for invalid Model IDs or API rate limits.

## 2. Model Selection UI
- [ ] **UI-01**: Create a `ModelSelector` component with a premium, glassmorphic design.
- [ ] **UI-02**: Display model names and tooltips describing their strengths.
- [ ] **UI-03**: Highlight the currently active model.
- [ ] **UI-04**: Render a visible Lock icon next to models not available in the user's current tier.

## 3. Plan-Based Access Control
- [ ] **AUTH-01**: Define a list of `FREE_MODELS` (5 specific models).
- [ ] **AUTH-02**: Backend middleware must validate if the requested `modelId` is allowed for the user's tier (Sync with Supabase plan).
- [ ] **AUTH-03**: Block unauthorized model requests with a 403 status and descriptive JSON message.

## 4. Subscription UX (Paywalls)
- [ ] **SUBS-01**: Selecting a locked model must trigger the `PricingModal`.
- [ ] **SUBS-02**: `PricingModal` must show a comparison table with prices (Free: $0, Basic: $9, Pro: $29).
- [ ] **SUBS-03**: Modal must have a high-contrast "Upgrade" button and a clear dismissal (X).
- [ ] **SUBS-04**: Apply backdrop blur (15px) to the app when modal is active.

## Future Requirements (Deferred)
- Dynamic model listing via API (v1/models).
- Custom model fine-tuning interface.

## Out of Scope
- Integration with non-NVIDIA providers in this milestone.
- Real payment processing (Stripe) - UI only with mock upgrade logic for now unless requested.

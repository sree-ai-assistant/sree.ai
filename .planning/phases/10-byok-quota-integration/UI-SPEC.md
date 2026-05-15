# Phase 10 UI-SPEC: BYOK Quota Indicators

## 1. Goal
Provide clear visual feedback to the user when their own API keys are being used, reinforcing the value proposition of the 0.2x quota discount.

## 2. Components

### 2.1 Model Selector Badge
- **Location**: Inside the `ModelSelector` dropdown or next to the model name in the chat header.
- **Visuals**:
  - Small "BYOK" badge.
  - Background: Primary color (blue/indigo) or Success color (green) with low opacity.
  - Text: "BYOK ACTIVE" or "0.2x Quota".
- **Interaction**: On hover, show a tooltip: "Your API key is active. Quota consumption reduced by 80%."

### 2.2 Usage Progress Bars
- **Location**: `UsageOverview.tsx`.
- **Visuals**:
  - If a user has BYOK keys configured, add a small label near the usage stats: "⚡ 80% Savings Active".
  - Potentially show a "Savings" metric: "Saved X tokens this month via BYOK".

## 3. States
- **BYOK Configured**: Badge visible, green/active state.
- **Fallback (Configured but Failed)**: Badge shows "KEY ERROR" or falls back to standard view if the platform key is used instead.
- **Not Configured**: Standard UI, no badge.

## 4. Assets
- Use `@lobehub/icons` or Lucide icons for the "⚡" or "Key" symbols.

# Research: Features for Multi-Model Support

## Tiered Model Availability

### Free Tier (5 Models)
- `meta/llama-3.1-70b-instruct`
- `mistralai/mistral-small-4-119b-2603`
- `nvidia/nemotron-mini-4b-instruct`
- `google/gemma-3n-e4b-it`
- `google/gemma-3n-e2b-it`

### Basic & Pro Plans (Full Catalog - 19 Models)
All the above, plus:
- `minimaxai/minimax-m2.7`
- `minimaxai/minimax-m2.5`
- `google/gemma-4-31b-it`
- `qwen/qwen3.5-122b-a10b`
- `mistralai/mistral-7b-instruct-v0.3`
- `mistralai/mixtral-8x22b-instruct-v0.1`
- `mistralai/mixtral-8x7b-instruct-v0.1`
- `deepseek-ai/deepseek-v3.2`
- `qwen/qwen3-next-80b-a3b-instruct`
- `qwen/qwen3-next-80b-a3b-thinking`
- `openai/gpt-oss-120b`
- `openai/gpt-oss-20b`
- `qwen/qwen2.5-coder-32b-instruct`
- `microsoft/phi-4-mini-instruct`
- `abacusai/dracarys-llama-3.1-70b-instruct`

## UX Components
- **Model Selector Dropdown**: Located above/within the chat input field.
- **Paywall Indicators**: Locked icon (Lucide `Lock`) next to premium models for free users.
- **Upgrade Modal**:
  - Glassmorphic design.
  - Backdrop blur (15px).
  - Clear pricing tiers comparison.
  - One primary CTA: "Upgrade Now".

## Interaction Logic
- Clicking a locked model triggers the `UpgradeModal`.
- Selecting an available model updates the global `activeModel` state in the frontend.
- Subsequent chat messages include the `modelId` in the request body.

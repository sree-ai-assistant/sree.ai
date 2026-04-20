# Research: Potential Pitfalls & Mitigations

## 1. Latency & Rate Limits
- **Pitfall**: Cold starts for specialized NIM models or rate limits on the free NVIDIA API tier.
- **Mitigation**: Implement robust error handling and fallback UI (e.g., "Model busy, please try another"). Show a loading shimmer during selection transitions.

## 2. Stream Disruption
- **Pitfall**: Network instability between backend and NVIDIA might break long completions.
- **Mitigation**: Ensure proper event listener cleanup and consistent JSON fragment parsing in the frontend.

## 3. ID Mismatches
- **Pitfall**: Hardcoded model IDs might drift as NVIDIA updates versions (e.g., v0.1 to v0.2).
- **Mitigation**: Fetch model list dynamically from `/v1/models` on server startup or keep a flexible mapping configuration.

## 4. Paywall Fatigue
- **Pitfall**: Too many lock icons might frustrate free users.
- **Mitigation**: Use "Premium" badges or subtle treatment that makes users curious about the power of the locked models rather than feeling blocked.

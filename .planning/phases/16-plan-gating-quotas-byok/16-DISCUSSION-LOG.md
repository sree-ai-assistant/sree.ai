# Phase 16: Plan Gating, Quotas, and BYOK Tracking - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-07
**Phase:** 16-Plan Gating, Quotas, and BYOK Tracking
**Areas discussed:** Access Gating, Credit Usage and Quotas, Frontend Dashboard & Limits UI

---

## Access Gating

| Option | Description | Selected |
|--------|-------------|----------|
| Starter Plan Requirement | Require users to be authenticated and at least on the Starter tier to generate videos. | ✓ |
| Free Plan Access | Allow Free tier users to generate brief (e.g. 1s) preview videos. | |

**User's choice:** Starter Plan Requirement.
**Notes:** Gating video generation to Starter (Premium) ensures only paying subscribers consume costly video model resources.

---

## Credit Usage and Quotas

| Option | Description | Selected |
|--------|-------------|----------|
| Duration-Based charging | Charge based on video duration multiplied by model rate (Lite = 0.06/s, Fast = 0.20/s, Standard = 0.40/s). | ✓ |
| Fixed charge per request | Charge a flat rate per generation request regardless of duration. | |

**User's choice:** Duration-Based charging.
**Notes:** Calibrating usage to duration aligns costs with API pricing models directly.

---

## Bring Your Own Key (BYOK) Detection

| Option | Description | Selected |
|--------|-------------|----------|
| 0.2x Multiplier discount | BYOK users bypass limits but consume quota credits at a 0.2x multiplier discount to reflect key provision. | ✓ |
| Free usage for BYOK | Allow unlimited video generation with no quota deduction if using own API key. | |

**User's choice:** 0.2x Multiplier discount.
**Notes:** Consonant with existing BYOK discount patterns established in Phase 10.

---

## the agent's Discretion

- Standard rate-limiting checks and resets using `usage_tracking` database architecture.
- Reusing standard visual styles for the settings page cards.

## Deferred Ideas

- Payment gateway integrations for real subscriptions.

-- Migration: Add Moonshot AI Kimi K2.6 and update/upsert Mistral Medium 3.5 128B
-- Description: Registers new models and sets their capabilities (image, video, context window).

-- 1. Upsert Moonshot AI Kimi K2.6
INSERT INTO public.ai_models (
  model_id,
  name,
  provider,
  tier_required,
  is_vision,
  description,
  max_tokens,
  context_window,
  in_maintenance,
  is_fast,
  img_no_can_process,
  is_new,
  is_image
) VALUES (
  'moonshotai/kimi-k2.6',
  'Kimi K2.6',
  'nvidia',
  'starter',
  TRUE,
  'Highly powerful 1T multimodal Mixture-of-Experts (MoE) model. Outstanding at processing long documents, up to 5 images, and video context.',
  16384,
  262144,
  FALSE,
  FALSE,
  5,
  TRUE,
  FALSE
)
ON CONFLICT (model_id) DO UPDATE SET
  name = EXCLUDED.name,
  provider = EXCLUDED.provider,
  tier_required = EXCLUDED.tier_required,
  is_vision = EXCLUDED.is_vision,
  description = EXCLUDED.description,
  max_tokens = EXCLUDED.max_tokens,
  context_window = EXCLUDED.context_window,
  in_maintenance = EXCLUDED.in_maintenance,
  is_fast = EXCLUDED.is_fast,
  img_no_can_process = EXCLUDED.img_no_can_process,
  is_new = EXCLUDED.is_new,
  is_image = EXCLUDED.is_image;

-- 2. Upsert Mistral Medium 3.5 128B
INSERT INTO public.ai_models (
  model_id,
  name,
  provider,
  tier_required,
  is_vision,
  description,
  max_tokens,
  context_window,
  in_maintenance,
  is_fast,
  img_no_can_process,
  is_new,
  is_image
) VALUES (
  'mistralai/mistral-medium-3.5-128b',
  'Mistral Medium 3.5 128B',
  'nvidia',
  'starter',
  TRUE,
  'State-of-the-art 128B reasoning model from Mistral AI, optimized for complex multimodal tasks and up to 10 images.',
  16384,
  262144,
  FALSE,
  FALSE,
  10,
  TRUE,
  FALSE
)
ON CONFLICT (model_id) DO UPDATE SET
  name = EXCLUDED.name,
  provider = EXCLUDED.provider,
  tier_required = EXCLUDED.tier_required,
  is_vision = EXCLUDED.is_vision,
  description = EXCLUDED.description,
  max_tokens = EXCLUDED.max_tokens,
  context_window = EXCLUDED.context_window,
  in_maintenance = EXCLUDED.in_maintenance,
  is_fast = EXCLUDED.is_fast,
  img_no_can_process = EXCLUDED.img_no_can_process,
  is_new = EXCLUDED.is_new,
  is_image = EXCLUDED.is_image;

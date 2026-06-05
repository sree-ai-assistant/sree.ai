-- Migration: Add NVIDIA Nemotron 3 Ultra 550B
-- Description: Registers Nemotron 3 Ultra — massive 550B model with 1M token context.

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
  'nvidia/nemotron-3-ultra-550b-a55b',
  'Nemotron 3 Ultra 550B',
  'nvidia',
  'pro',
  FALSE,
  'NVIDIA flagship 550B parameter model with 1M token context window. Exceptional at complex reasoning, long-document analysis, and advanced instruction following.',
  16384,
  1000000,
  FALSE,
  FALSE,
  0,
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

-- Migration: Add Z-AI GLM 5.2 model
-- Description: Registers the new Zhipu AI GLM 5.2 model with 1M context window and 16K max output tokens.

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
  is_image,
  is_video
) VALUES (
  'z-ai/glm-5.2',
  'GLM 5.2',
  'nvidia',
  'starter',
  FALSE,
  'Next-generation GLM model from Zhipu AI with a massive 1M token context window and 16K output limit.',
  16384,
  1000000,
  FALSE,
  FALSE,
  0,
  TRUE,
  FALSE,
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
  is_image = EXCLUDED.is_image,
  is_video = EXCLUDED.is_video;

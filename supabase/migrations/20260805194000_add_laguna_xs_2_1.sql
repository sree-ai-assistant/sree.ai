-- Migration: Add Poolside Laguna-XS-2.1
-- Description: Registers the new poolside/laguna-xs-2.1 text model from Nvidia.

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
  'poolside/laguna-xs-2.1',
  'Laguna-XS 2.1',
  'nvidia',
  'starter',
  FALSE,
  'Efficient 33B MoE model by Poolside designed for long-horizon agentic coding and reasoning tasks.',
  8192,
  262144,
  FALSE,
  TRUE,
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

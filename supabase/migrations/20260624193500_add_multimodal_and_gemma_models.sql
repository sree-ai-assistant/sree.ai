-- Migration: Add Microsoft Phi-4 Multimodal, MiniMax-M3, and Google DiffusionGemma 26B
-- Description: Registers new models and sets their capabilities.

-- 1. Microsoft Phi-4 Multimodal Instruct
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
  'microsoft/phi-4-multimodal-instruct',
  'Phi-4 Multimodal Instruct',
  'nvidia',
  'starter',
  TRUE,
  'Highly capable compact multimodal model from Microsoft supporting text, audio, and visual reasoning up to 3 images.',
  512,
  131072,
  FALSE,
  FALSE,
  3,
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

-- 2. MiniMax-M3
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
  'minimaxai/minimax-m3',
  'MiniMax-M3',
  'nvidia',
  'starter',
  FALSE,
  'High-throughput conversational LLM by MiniMax with a massive 1M token context window.',
  8192,
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

-- 3. Google DiffusionGemma 26B
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
  'google/diffusiongemma-26b-a4b-it',
  'DiffusionGemma 26B',
  'nvidia',
  'starter',
  TRUE,
  'Google multimodal Gemma model with video and image capabilities, supporting up to 10 images.',
  4096,
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

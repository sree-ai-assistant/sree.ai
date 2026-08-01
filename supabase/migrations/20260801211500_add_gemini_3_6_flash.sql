-- Migration: Add Gemini 3.6 Flash
-- Description: Registers the new gemini-3.6-flash multimodal model from Google.

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
  'gemini-3.6-flash',
  'Gemini 3.6 Flash',
  'google',
  'starter',
  TRUE,
  'Multimodal model with advanced Text, Image, Video, Audio, and PDF understanding capabilities.',
  65536,
  1048576,
  FALSE,
  TRUE,
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

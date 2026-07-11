-- Migration: Replace Veo 3.0 with Gemini Omni Flash
-- Description: Deletes deprecated Veo 3.0 models and registers the new Gemini Omni Flash video model.

-- 1. Remove Google Veo 3.0 models
DELETE FROM public.ai_models 
WHERE model_id IN ('veo-3.0-generate-001', 'veo-3.0-fast-generate-001');

-- 2. Add Gemini Omni Flash video model
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
  is_new,
  is_image,
  is_video
) VALUES (
  'gemini-omni-flash-preview',
  'Omni Flash',
  'google',
  'free',
  FALSE,
  'Fast multimodal generation via Gemini Live',
  0,
  0,
  FALSE,
  TRUE,
  TRUE,
  FALSE,
  TRUE
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
  is_new = EXCLUDED.is_new,
  is_image = EXCLUDED.is_image,
  is_video = EXCLUDED.is_video;

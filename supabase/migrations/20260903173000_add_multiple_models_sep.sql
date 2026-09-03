-- Migration: Add Multiple Models (Gemini 3.8 Flash, Kimi K3, DeepSeek V4 Pro/Flash, Nemotron)
-- Description: Registers new models from Google and NVIDIA catalogs.

-- 1. Gemini 3.8 Flash
INSERT INTO public.ai_models (
  model_id, name, provider, tier_required, is_vision, description, max_tokens, context_window, in_maintenance, is_fast, img_no_can_process, is_new, is_image
) VALUES (
  'gemini-3.8-flash', 'Gemini 3.8 Flash', 'google', 'starter', TRUE,
  'Multimodal model with advanced Text, Image, Video, Audio, and PDF understanding capabilities.',
  65536, 1048576, FALSE, TRUE, 10, TRUE, FALSE
) ON CONFLICT (model_id) DO UPDATE SET
  name = EXCLUDED.name, provider = EXCLUDED.provider, tier_required = EXCLUDED.tier_required, is_vision = EXCLUDED.is_vision, description = EXCLUDED.description, max_tokens = EXCLUDED.max_tokens, context_window = EXCLUDED.context_window, in_maintenance = EXCLUDED.in_maintenance, is_fast = EXCLUDED.is_fast, img_no_can_process = EXCLUDED.img_no_can_process, is_new = EXCLUDED.is_new, is_image = EXCLUDED.is_image;

-- 2. Moonshot Kimi K3
INSERT INTO public.ai_models (
  model_id, name, provider, tier_required, is_vision, description, max_tokens, context_window, in_maintenance, is_fast, img_no_can_process, is_new, is_image
) VALUES (
  'moonshotai/kimi-k3', 'Kimi K3', 'nvidia', 'starter', TRUE,
  '~2.8T hybrid multimodal MoE for long-horizon coding, agentic tool use, and image understanding.',
  16384, 1000000, FALSE, FALSE, 10, TRUE, FALSE
) ON CONFLICT (model_id) DO UPDATE SET
  name = EXCLUDED.name, provider = EXCLUDED.provider, tier_required = EXCLUDED.tier_required, is_vision = EXCLUDED.is_vision, description = EXCLUDED.description, max_tokens = EXCLUDED.max_tokens, context_window = EXCLUDED.context_window, in_maintenance = EXCLUDED.in_maintenance, is_fast = EXCLUDED.is_fast, img_no_can_process = EXCLUDED.img_no_can_process, is_new = EXCLUDED.is_new, is_image = EXCLUDED.is_image;

-- 3. DeepSeek V4 Pro
INSERT INTO public.ai_models (
  model_id, name, provider, tier_required, is_vision, description, max_tokens, context_window, in_maintenance, is_fast, img_no_can_process, is_new, is_image
) VALUES (
  'deepseek-ai/deepseek-v4-pro-0813', 'DeepSeek V4 Pro', 'nvidia', 'pro', FALSE,
  'DeepSeek V4 scales to 1M-token context windows with efficient MoE architecture for coding tasks.',
  16384, 1000000, FALSE, FALSE, 0, TRUE, FALSE
) ON CONFLICT (model_id) DO UPDATE SET
  name = EXCLUDED.name, provider = EXCLUDED.provider, tier_required = EXCLUDED.tier_required, is_vision = EXCLUDED.is_vision, description = EXCLUDED.description, max_tokens = EXCLUDED.max_tokens, context_window = EXCLUDED.context_window, in_maintenance = EXCLUDED.in_maintenance, is_fast = EXCLUDED.is_fast, img_no_can_process = EXCLUDED.img_no_can_process, is_new = EXCLUDED.is_new, is_image = EXCLUDED.is_image;

-- 4. DeepSeek V4 Flash
INSERT INTO public.ai_models (
  model_id, name, provider, tier_required, is_vision, description, max_tokens, context_window, in_maintenance, is_fast, img_no_can_process, is_new, is_image
) VALUES (
  'deepseek-ai/deepseek-v4-flash-0731', 'DeepSeek V4 Flash', 'nvidia', 'starter', FALSE,
  '284B MoE (13B active) model ideal for long-context workloads optimized for coding, chat, and agentic workflows.',
  16384, 1000000, FALSE, TRUE, 0, TRUE, FALSE
) ON CONFLICT (model_id) DO UPDATE SET
  name = EXCLUDED.name, provider = EXCLUDED.provider, tier_required = EXCLUDED.tier_required, is_vision = EXCLUDED.is_vision, description = EXCLUDED.description, max_tokens = EXCLUDED.max_tokens, context_window = EXCLUDED.context_window, in_maintenance = EXCLUDED.in_maintenance, is_fast = EXCLUDED.is_fast, img_no_can_process = EXCLUDED.img_no_can_process, is_new = EXCLUDED.is_new, is_image = EXCLUDED.is_image;

-- 5. Nemotron 3.5 Lightning 30B
INSERT INTO public.ai_models (
  model_id, name, provider, tier_required, is_vision, description, max_tokens, context_window, in_maintenance, is_fast, img_no_can_process, is_new, is_image
) VALUES (
  'nvidia/nemotron-3.5-lightning-30b-a3b', 'Nemotron 3.5 Lightning', 'nvidia', 'starter', FALSE,
  'Fastest 30B A3B MoE model with leading domain accuracy for specialized agentic tasks.',
  16384, 1000000, FALSE, TRUE, 0, TRUE, FALSE
) ON CONFLICT (model_id) DO UPDATE SET
  name = EXCLUDED.name, provider = EXCLUDED.provider, tier_required = EXCLUDED.tier_required, is_vision = EXCLUDED.is_vision, description = EXCLUDED.description, max_tokens = EXCLUDED.max_tokens, context_window = EXCLUDED.context_window, in_maintenance = EXCLUDED.in_maintenance, is_fast = EXCLUDED.is_fast, img_no_can_process = EXCLUDED.img_no_can_process, is_new = EXCLUDED.is_new, is_image = EXCLUDED.is_image;

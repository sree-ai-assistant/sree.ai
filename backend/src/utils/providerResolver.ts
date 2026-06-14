import { supabaseAdmin } from '../lib/supabase';

/**
 * In-memory cache for resolved providers to avoid repeated database lookups.
 */
const providerCache = new Map<string, string>();

/**
 * Maps model IDs to their respective providers.
 * Used for "Bring Your Own Key" (BYOK) detection and routing.
 */
const PROVIDER_MAP: Record<string, string> = {
  // NVIDIA (NIM / API) & Partners - Verified from ai_models_rows.csv
  'deepseek-ai/deepseek-v3.2': 'nvidia',
  'black-forest-labs/flux-1-kontext-dev': 'nvidia',
  'google/gemma-3-12b-it': 'nvidia',
  'google/gemma-3n-e2b-it': 'nvidia',
  'google/gemma-3n-e4b-it': 'nvidia',
  'google/gemma-4-31b-it': 'nvidia',
  'openai/gpt-oss-120b': 'nvidia',
  'openai/gpt-oss-20b': 'nvidia',
  'meta/llama-3.1-70b-instruct': 'nvidia',
  'meta/llama-3.2-11b-vision-instruct': 'nvidia',
  'meta/llama-3.2-90b-vision-instruct': 'nvidia',
  'minimaxai/minimax-m2.5': 'nvidia',
  'minimaxai/minimax-m2.7': 'nvidia',
  'mistralai/mistral-small-4-119b-2603': 'nvidia',
  'mistralai/mixtral-8x22b-instruct-v0.1': 'nvidia',
  'mistralai/mixtral-8x7b-instruct-v0.1': 'nvidia',
  'nvidia/nemotron-mini-4b-instruct': 'nvidia',
  'microsoft/phi-4-mini-instruct': 'nvidia',
  'qwen/qwen2.5-coder-32b-instruct': 'nvidia',
  'qwen/qwen3-next-80b-a3b-instruct': 'nvidia',
  'qwen/qwen3-next-80b-a3b-thinking': 'nvidia',
  'qwen/qwen3.5-122b-a10b': 'nvidia',
  'qwen/qwen3.5-397b-a17b': 'nvidia',
  'stabilityai/stable-diffusion-xl-base-1.0': 'nvidia',
  'nvidia/vila-1.5-3b': 'nvidia',
  'deepseek-ai/deepseek-v4-flash': 'nvidia',
  'deepseek-ai/deepseek-v4-pro': 'nvidia',
  'abacusai/dracarys-llama-3.1-70b-instruct': 'nvidia',
  'black-forest-labs/flux-1-dev': 'nvidia',
  'black-forest-labs/flux-1-schnell': 'nvidia',
  'black-forest-labs/flux-2-klein-4b': 'nvidia',
  'google/gemma-2-2b-it': 'nvidia',
  'z-ai/glm4.7': 'nvidia',
  'z-ai/glm-5.1': 'nvidia',
  'nvidia/ising-calibration-1-35b-a3b': 'nvidia',
  'meta/llama-3.1-8b-instruct': 'nvidia',
  'nvidia/llama-3.1-nemotron-nano-8b-v1': 'nvidia',
  'nvidia/llama-3.1-nemotron-nano-vl-8b-v1': 'nvidia',
  'meta/llama-3.2-1b-instruct': 'nvidia',
  'meta/llama-3.2-3b-instruct': 'nvidia',
  'meta/llama-3.3-70b-instruct': 'nvidia',
  'nvidia/llama-3.3-nemotron-super-49b-v1': 'nvidia',
  'nvidia/llama-3.3-nemotron-super-49b-v1.5': 'nvidia',
  'meta/llama-4-maverick-17b-128e-instruct': 'nvidia',
  'mistralai/ministral-14b-instruct-2512': 'nvidia',
  'mistralai/mistral-large-3-675b-instruct-2512': 'nvidia',
  'mistralai/mistral-medium-3.5-128b': 'nvidia',
  'mistralai/mistral-nemotron': 'nvidia',
  'moonshotai/kimi-k2.6': 'nvidia',
  'nvidia/nemotron-nano-12b-v2-vl': 'nvidia',
  'nvidia/nemotron-3-nano-30b-a3b': 'nvidia',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning': 'nvidia',
  'nvidia/nemotron-3-super-120b-a12b': 'nvidia',
  'nvidia/nemotron-3-ultra-550b-a55b': 'nvidia',
  'nvidia/nvidia-nemotron-nano-9b-v2': 'nvidia',
  'microsoft/phi-4-multimodal-instruct': 'nvidia',
  'qwen/qwen3-coder-480b-a35b-instruct': 'nvidia',
  'sarvamai/sarvam-m': 'nvidia',
  'bytedance/seed-oss-36b-instruct': 'nvidia',
  'stabilityai/stable-diffusion-3-5-large': 'nvidia',
  'stepfun-ai/step-3.5-flash': 'nvidia',
  'stockmark/stockmark-2-100b-instruct': 'nvidia',

  // Google Gemini (Direct API)
  'gemini-2.5-pro': 'google',
  'gemini-2.5-flash': 'google',
  'gemini-2.5-flash-lite': 'google',
  'gemini-3': 'google',
  'gemini-3.1-pro': 'google',
  'gemini-3.5-flash': 'google',
  'gemini-flash-latest': 'google',
  'gemini-flash-lite-latest': 'google',
  'gemini-3-flash-preview': 'google',
  'gemini-3.1-flash-lite-preview': 'google',
  'gemini-3.1-flash-lite': 'google',

  // Groq API
  'groq/compound': 'groq',
  'groq/compound-mini': 'groq',
};

/**
 * Resolves the provider for a given model ID.
 * Returns the provider name in lowercase (e.g., 'openai', 'nvidia', 'google').
 * Now supports dynamic lookup from the 'ai_models' table.
 */
export async function resolveProvider(modelId: string): Promise<string> {
  if (!modelId) return 'unknown';
  
  const normalizedId = modelId.toLowerCase();
  
  // 1. Check in-memory cache
  if (providerCache.has(normalizedId)) {
    return providerCache.get(normalizedId)!;
  }

  // 2. Try database lookup (ai_models table)
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_models')
      .select('provider')
      .eq('model_id', modelId)
      .maybeSingle();

    if (data?.provider) {
      const provider = data.provider.toLowerCase();
      providerCache.set(normalizedId, provider);
      return provider;
    }
  } catch (err) {
    console.error('[ProviderResolver] Database lookup failed:', err);
  }

  // 3. Fallback to hardcoded map (Verified against ai_models_rows.csv)
  if (PROVIDER_MAP[normalizedId]) {
    const provider = PROVIDER_MAP[normalizedId];
    providerCache.set(normalizedId, provider);
    return provider;
  }

  // 4. Prefix/Infix matching for providers (Safety net)
  let resolved: string | null = null;
  
  // Google Gemini models use a simple model_id like 'gemini-X.X-...'
  if (normalizedId.startsWith('gemini-') || normalizedId.startsWith('gemini/')) {
    resolved = 'google';
  }

  if (normalizedId.startsWith('groq/')) {
    resolved = 'groq';
  }

  if (!resolved && (normalizedId.includes('meta/') || 
      normalizedId.includes('mistralai/') || 
      normalizedId.includes('nvidia/') ||
      normalizedId.includes('stabilityai/') ||
      normalizedId.includes('black-forest-labs/') ||
      normalizedId.includes('google/') ||
      normalizedId.includes('openai/') ||
      normalizedId.includes('microsoft/') ||
      normalizedId.includes('qwen/') ||
      normalizedId.includes('moonshotai/') ||
      normalizedId.includes('deepseek-ai/'))) {
    resolved = 'nvidia';
  }

  if (resolved) {
    providerCache.set(normalizedId, resolved);
    return resolved;
  }

  return 'unknown';
}

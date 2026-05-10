import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';

export const tierCheckMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { model } = req.body;
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!model) {
      return next(); // Default model handling is in the service
    }

    // 1. Fetch model requirements
    const { data: modelData, error: modelError } = await supabaseAdmin
      .from('ai_models')
      .select('tier_required')
      .eq('model_id', model)
      .single();

    if (modelError || !modelData) {
      // If model not found in registry, it might be a newly added internal model. 
      // For safety, allow it if it's not in the registry yet or handle as 'free'.
      return next(); 
    }

    // 2. Fetch user plan
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('plan_type')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
       return res.status(500).json({ success: false, message: 'User profile not found' });
    }

    const userTier = (profile.plan_type || 'free').toLowerCase();
    const requiredTier = modelData.tier_required.toLowerCase();

    // Tier comparison logic
    // 'premium' is a model requirement tier that maps to 'basic' plan access
    const tierRanks: Record<string, number> = { 
      'free': 0, 
      'basic': 1, 
      'pro': 2 
    };

    if ((tierRanks[userTier] ?? 0) < (tierRanks[requiredTier] ?? 0)) {
      return res.status(403).json({ 
        success: false, 
        message: `Plan upgrade required. The model '${model}' is only available on ${requiredTier.toUpperCase()} plans.`,
        code: 'TIER_LOCKED',
        requiredTier
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { flexAuthMiddleware } from '../middleware/anonymousIdentity';
import { PLAN_CONFIGS as PLANS, type PlanTier } from '../config/plans';

const router = Router();

// Get all AI models
router.get('/', flexAuthMiddleware, async (req, res) => {
  try {
    const tier = (req as any).userTier as PlanTier || 'anonymous';
    const planConfig = PLANS[tier];

    let query = supabaseAdmin
      .from('ai_models')
      .select('*')
      .order('tier_required', { ascending: true });

    // If the plan doesn't allow all models, filter by tier
    if (!planConfig.features.allModels) {
      query = query.eq('tier_required', 'free');
    }

    const { data: models, error } = await query;

    if (error) throw error;

    res.json({ success: true, data: models });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

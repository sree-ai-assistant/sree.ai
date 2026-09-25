import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { flexAuthMiddleware } from '../middleware/anonymousIdentity';
import { PLAN_CONFIGS as PLANS, type PlanTier } from '../config/plans';
import { getObserverStatus } from '../services/modelObserver.service';

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

    // Return all models so that frontend can display locked/premium models to entice upgrades
    const { data: models, error } = await query;

    if (error) throw error;

    res.json({ success: true, data: models });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get model error observer status (in-memory + DB counters)
router.get('/observer-status', flexAuthMiddleware, async (req, res) => {
  try {
    // 1. In-memory counters (instant)
    const memoryStatus = getObserverStatus();

    // 2. DB counters (persistent)
    const { data: dbCounters, error } = await supabaseAdmin
      .from('model_error_counters')
      .select('model_id, status_code, error_count, last_error_at, last_error_message, flagged_at, first_error_at')
      .gt('error_count', 0)
      .order('last_error_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: {
        memory: memoryStatus,
        persistent: dbCounters || [],
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

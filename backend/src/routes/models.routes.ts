import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Get all AI models
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data: models, error } = await supabaseAdmin
      .from('ai_models')
      .select('*')
      .order('tier_required', { ascending: true });

    if (error) throw error;

    res.json({ success: true, data: models });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

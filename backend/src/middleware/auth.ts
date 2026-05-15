import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        code: 'AUTH_REQUIRED',
        message: 'Authentication token is required.' 
      });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      console.error('Auth Middleware - Error verifying token:', error?.message || 'No user found');
      return res.status(401).json({ 
        success: false, 
        code: 'INVALID_TOKEN',
        message: 'Session expired or invalid. Please sign in again.',
        debug: process.env.NODE_ENV === 'development' ? error?.message : undefined 
      });
    }

    // Attach user to request
    (req as any).user = user;

    // Look up plan tier from profiles (same logic as flexAuthMiddleware)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('plan_type')
      .eq('id', user.id)
      .single();

    (req as any).userTier = (profile?.plan_type || 'free').toLowerCase();

    next();
  } catch (error) {
    next(error);
  }
};

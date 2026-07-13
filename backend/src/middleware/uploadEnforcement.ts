import type { Request, Response, NextFunction } from 'express';
import { getPlanConfig } from '../config/plans';
import { supabaseAdmin } from '../lib/supabase';
import fs from 'fs';


/**
 * Upload Size Validator
 * 
 * Compares the uploaded file size (req.file.size) against the user's tier limit.
 * If exceeded, it deletes the temp file and returns a 413 Payload Too Large.
 */
export const uploadSizeValidator = (req: Request, res: Response, next: NextFunction) => {
  const file = req.file;
  const isAuth = !!(req as any).user;
  const tier = (req as any).userTier || 'anonymous';

  // 1. Explicitly block anonymous uploads (Roadmap Phase 9), except for voice assistant recordings
  const isVoice = (req as any).toolType === 'voice' || req.originalUrl?.includes('/voice') || req.path?.includes('/voice');

  if (!isAuth && tier === 'anonymous' && !isVoice) {
    if (file && fs.existsSync(file.path)) {
      try { fs.unlinkSync(file.path); } catch (e) {}
    }
    return res.status(401).json({
      success: false,
      code: 'AUTH_REQUIRED',
      message: 'File uploads require a free account. Please sign in or sign up.'
    });
  }

  if (!file) return next();

  const plan = getPlanConfig(tier);

  // 2. Size limit check (allow 10MB for voice assistant even for anonymous users)
  const limitBytes = (isVoice && tier === 'anonymous') ? 10 * 1024 * 1024 : plan.uploadLimitMb * 1024 * 1024;

  if (file.size > limitBytes) {
    console.warn(`[Upload Enforcement] File too large: ${file.size} bytes. Tier: ${tier}. Limit: ${limitBytes} bytes.`);
    
    // Delete the temp file to save disk space
    if (fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error(`[Upload Enforcement] Failed to delete oversized file ${file.path}:`, err);
      }
    }

    return res.status(413).json({
      success: false,
      code: 'UPLOAD_TOO_LARGE',
      message: `File exceeds your ${plan.displayName} plan limit of ${plan.uploadLimitMb}MB.`,
      limitMb: plan.uploadLimitMb,
      actualMb: Number((file.size / (1024 * 1024)).toFixed(2)),
      upgradeUrl: '/pricing'
    });
  }

  next();
};

/**
 * Queue Priority Middleware
 * 
 * Injects the plan's priority level into the request.
 * Useful for later processing in AI services.
 */
export const queuePriorityMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const tier = (req as any).userTier || 'anonymous';
  const plan = getPlanConfig(tier);
  
  (req as any).priority = plan.features.priorityQueue;
  next();
};

/**
 * Upload Agreement Middleware
 * 
 * Verifies if the authenticated user has agreed to the file upload policy.
 * If not agreed, returns a 403 Forbidden.
 */
export const uploadAgreementMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    
    // Agreement only applies to authenticated users who have a database profile.
    if (user) {
      const { data: profile, error } = await supabaseAdmin
        .from('profiles')
        .select('file_upload_agreed')
        .eq('id', user.id)
        .single();

      if (error || !profile) {
        console.error('[Upload Agreement] Failed to fetch user profile:', error?.message || 'No profile found');
        return res.status(500).json({
          success: false,
          code: 'PROFILE_FETCH_FAILED',
          message: 'Failed to verify file upload agreement.'
        });
      }

      if (!profile.file_upload_agreed) {
        return res.status(403).json({
          success: false,
          code: 'AGREEMENT_REQUIRED',
          message: 'You must agree to the file upload policy before uploading files.'
        });
      }
    }

    next();
  } catch (error) {
    console.error('[Upload Agreement] Middleware error:', error);
    next(error);
  }
};


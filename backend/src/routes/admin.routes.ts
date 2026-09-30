import { Router, Request, Response } from 'express';
import { r2Service } from '../services/r2.service';

const router = Router();

// ─── Admin Secret Guard ──────────────────────────────────────────────────────
// These are internal maintenance endpoints. Protected by a shared secret
// set in ADMIN_SECRET env var. Not user-facing.
//
// Usage:
//   curl -X POST http://localhost:5000/api/admin/r2/health-check \
//        -H "x-admin-secret: YOUR_SECRET" \
//        -H "Content-Type: application/json"
// ────────────────────────────────────────────────────────────────────────────

const adminGuard = (req: Request, res: Response, next: Function) => {
  const secret = req.headers['x-admin-secret'];
  const expected = process.env.ADMIN_SECRET;

  if (!expected) {
    return res.status(503).json({
      success: false,
      message: 'ADMIN_SECRET not configured on the server.',
    });
  }

  if (secret !== expected) {
    return res.status(403).json({
      success: false,
      message: 'Invalid admin secret.',
    });
  }

  next();
};

// ─── Health Check ────────────────────────────────────────────────────────────
// POST /api/admin/r2/health-check
// Body (optional): { "dryRun": true, "bucket": "chat-files", "limit": 1000 }
// -d '{ "dryRun": true, "bucket": "chat-files", "limit": 1000 }'
//
//curl -X POST http://localhost:5000/api/admin/r2/health-check \
//  -H "x-admin-secret: YOUR_SECRET" \
//  -H "Content-Type: application/json" \
//  -d '{ "dryRun": true, "bucket": "chat-files", "limit": 1000 }'
//
// Scans `file_uploads` table and verifies each record has a real R2 object.
// dryRun=true (default) only reports. dryRun=false also cleans stale records.
router.post('/r2/health-check', adminGuard, async (req: Request, res: Response) => {
  try {
    const { dryRun = true, bucket, limit } = req.body || {};

    console.log(`[Admin] R2 health check triggered (dryRun: ${dryRun})`);

    const report = await r2Service.healthCheck({ dryRun, bucket, limit });

    return res.json({
      success: true,
      message: dryRun
        ? `Health check complete (dry run — no records deleted)`
        : `Health check complete — cleaned ${report.cleanedUp} stale records`,
      report,
    });
  } catch (error: any) {
    console.error('[Admin] Health check error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Health check failed',
      error: error.message,
    });
  }
});

// ─── Garbage Collection ──────────────────────────────────────────────────────
// POST /api/admin/r2/garbage-collect
// Body (optional): { "dryRun": true, "daysOld": 30, "bucket": "chat-files", "limit": 500 }
//
//curl -X POST http://localhost:5000/api/admin/r2/garbage-collect \
//  -H "x-admin-secret: YOUR_SECRET" \
//  -H "Content-Type: application/json" \
//  -d '{ "dryRun": true, "daysOld": 30, "bucket": "chat-files", "limit": 500 }'
//
// Finds records with ref_count=0 and last_used_at older than daysOld threshold.
// Deletes both the R2 object and the DB record.
router.post('/r2/garbage-collect', adminGuard, async (req: Request, res: Response) => {
  try {
    const { dryRun = true, daysOld = 30, bucket, limit } = req.body || {};

    console.log(`[Admin] R2 garbage collection triggered (dryRun: ${dryRun}, daysOld: ${daysOld})`);

    const report = await r2Service.garbageCollect({ dryRun, daysOld, bucket, limit });

    return res.json({
      success: true,
      message: dryRun
        ? `GC scan complete (dry run — no deletions). Found ${report.found} orphans.`
        : `GC complete — deleted ${report.deletedFromR2} from R2, ${report.deletedFromDB} from DB`,
      report,
    });
  } catch (error: any) {
    console.error('[Admin] Garbage collection error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Garbage collection failed',
      error: error.message,
    });
  }
});

// ─── Combined Status ─────────────────────────────────────────────────────────
// GET /api/admin/r2/status
//
//curl -X GET "http://localhost:5000/api/admin/r2/status" \
//  -H "x-admin-secret: YOUR_SECRET"
//
// Quick overview: counts from file_uploads table
router.get('/r2/status', adminGuard, async (req: Request, res: Response) => {
  try {
    const { supabaseAdmin } = await import('../lib/supabase');

    const [totalResult, orphanResult] = await Promise.all([
      supabaseAdmin
        .from('file_uploads')
        .select('id', { count: 'exact', head: true }),
      supabaseAdmin
        .from('file_uploads')
        .select('id', { count: 'exact', head: true })
        .lte('ref_count', 0),
    ]);

    return res.json({
      success: true,
      stats: {
        totalRecords: totalResult.count || 0,
        orphanRecords: orphanResult.count || 0,
        activeRecords: (totalResult.count || 0) - (orphanResult.count || 0),
      },
    });
  } catch (error: any) {
    console.error('[Admin] Status error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

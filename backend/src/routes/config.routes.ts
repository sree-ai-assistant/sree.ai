/**
 * Config Routes — Public app configuration flags
 *
 * Exposes specific, whitelisted app_config keys to the frontend.
 * No auth required — only safe, non-sensitive keys are exposed.
 */

import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

/**
 * Whitelisted config keys that can be read by the frontend.
 * NEVER add secrets, API keys, or internal configuration here.
 */
const PUBLIC_CONFIG_KEYS = [
    'video_byok_only_banner',
];

/**
 * GET /config/public
 * Returns all whitelisted public config flags as a key-value object.
 *
 * Response: { success: true, data: { video_byok_only_banner: "true" } }
 */
router.get('/public', async (_req: Request, res: Response) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('app_config')
            .select('key, value')
            .in('key', PUBLIC_CONFIG_KEYS);

        if (error) {
            console.error('[Config] Failed to fetch public config:', error.message);
            return res.status(500).json({ success: false, message: 'Failed to fetch configuration' });
        }

        // Build key-value map
        const configMap: Record<string, string> = {};
        for (const row of data || []) {
            configMap[row.key] = row.value;
        }

        res.json({ success: true, data: configMap });
    } catch (err: any) {
        console.error('[Config] Unexpected error:', err.message);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

export default router;

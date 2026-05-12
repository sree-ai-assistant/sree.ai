import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { ApiKeyService } from '../services/apiKey.service';

const router = Router();

// Protected profile route
router.get('/profile', authMiddleware, async (req: any, res) => {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;

    res.json({ success: true, data: profile });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update API Keys
router.post('/settings/keys', authMiddleware, async (req: any, res) => {
  try {
    const { nvidia_api_key, deepgram_api_key, provider, key, name } = req.body;
    const userId = req.user.id;

    const finalProvider = provider || (nvidia_api_key ? 'nvidia' : (deepgram_api_key ? 'deepgram' : null));
    const finalKey = key || nvidia_api_key || deepgram_api_key;

    if (!finalKey || !finalProvider) {
      return res.status(400).json({ success: false, message: 'Provider and API key are required' });
    }

    const success = await ApiKeyService.saveUserApiKey(userId, finalProvider, finalKey, name);
    
    if (!success) {
      throw new Error('Failed to encrypt or save API key');
    }

    res.json({ success: true, message: `${finalProvider} API key saved successfully` });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// List API Keys
router.get('/settings/keys', authMiddleware, async (req: any, res) => {
  try {
    const keys = await ApiKeyService.listUserApiKeys(req.user.id);
    res.json({ success: true, data: keys });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Toggle API Key in_use
router.patch('/settings/keys/:id/toggle', authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { in_use } = req.body;
    const success = await ApiKeyService.toggleApiKey(req.user.id, id, in_use);
    
    if (success) {
      res.json({ success: true, message: `API key ${in_use ? 'enabled' : 'disabled'} successfully` });
    } else {
      res.status(500).json({ success: false, message: 'Failed to toggle API key' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete API Key by ID
router.delete('/settings/keys/:id', authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;
    const success = await ApiKeyService.deleteApiKeyById(req.user.id, id);
    
    if (success) {
      res.json({ success: true, message: 'API key deleted successfully' });
    } else {
      res.status(500).json({ success: false, message: 'Failed to delete API key' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- Session Management Routes ---

// Get User Sessions
router.get('/sessions', authMiddleware, async (req: any, res) => {
  try {
    const { data: sessions, error } = await supabaseAdmin
      .from('user_sessions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('last_active', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data: sessions });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Sync/Upsert Current Session
router.post('/sessions/sync', authMiddleware, async (req: any, res) => {
  try {
    const { os, browser, location, ip_address, device_id } = req.body;
    const userId = req.user.id;

    if (!os || !browser || !device_id) {
      return res.status(400).json({ success: false, message: 'OS, Browser, and device_id are required' });
    }

    // Mark all other sessions for this user as not current
    await supabaseAdmin
      .from('user_sessions')
      .update({ is_current: false })
      .eq('user_id', userId)
      .neq('device_id', device_id);

    // Atomic upsert — uses the unique index on (user_id, device_id)
    // This prevents race-condition duplicates from concurrent sync calls
    const { data, error } = await supabaseAdmin
      .from('user_sessions')
      .upsert({
        user_id: userId,
        device_id,
        os,
        browser,
        location: location || 'Unknown',
        ip_address: ip_address || req.ip || 'Unknown',
        is_current: true,
        last_active: new Date().toISOString()
      }, {
        onConflict: 'user_id,device_id'
      })
      .select()
      .single();

    if (error) throw error;

    // Update trusted_devices table
    await supabaseAdmin
      .from('trusted_devices')
      .upsert({
        user_id: userId,
        device_id,
        os,
        browser,
        last_seen_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,device_id'
      });

    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Trusted Devices
router.get('/devices', authMiddleware, async (req: any, res) => {
  try {
    const { data: devices, error } = await supabaseAdmin
      .from('trusted_devices')
      .select('*')
      .eq('user_id', req.user.id)
      .order('last_seen_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data: devices });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Revoke All Other Sessions
router.delete('/sessions/revoke-others', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user.id;
    
    // Find the current session ID for this user (if any)
    const { data: currentSession } = await supabaseAdmin
      .from('user_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('is_current', true)
      .maybeSingle();

    let query = supabaseAdmin
      .from('user_sessions')
      .delete()
      .eq('user_id', userId);

    if (currentSession) {
      query = query.neq('id', currentSession.id);
    }

    const { error } = await query;

    if (error) throw error;

    res.json({ success: true, message: 'All other sessions revoked successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete/Logout Session
router.delete('/sessions/:id', authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin
      .from('user_sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;

    res.json({ success: true, message: 'Session deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

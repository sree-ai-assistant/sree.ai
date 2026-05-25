import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { ApiKeyService } from '../services/apiKey.service';
import { migrateDataToUser } from '../services/anonymous.service';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const router = Router();
const avatarUpload = multer({ dest: 'uploads/avatars/', limits: { fileSize: 5 * 1024 * 1024 } });

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

// Update profile (display name)
router.patch('/profile', authMiddleware, async (req: any, res) => {
  try {
    const { display_name } = req.body;
    const userId = req.user.id;

    if (display_name !== undefined && (typeof display_name !== 'string' || display_name.length > 100)) {
      return res.status(400).json({ success: false, message: 'Invalid display name' });
    }

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ display_name, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) throw error;

    res.json({ success: true, message: 'Profile updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Upload avatar
router.post('/avatar', authMiddleware, avatarUpload.single('avatar'), async (req: any, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const userId = req.user.id;
    const ext = path.extname(file.originalname) || '.png';
    const storagePath = `avatars/${userId}${ext}`;

    const fileBuffer = fs.readFileSync(file.path);

    // Upload to Supabase Storage
    const { error: uploadError } = await supabaseAdmin
      .storage
      .from('assets')
      .upload(storagePath, fileBuffer, {
        contentType: file.mimetype,
        upsert: true
      });

    // Clean up temp file
    fs.unlinkSync(file.path);

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = supabaseAdmin
      .storage
      .from('assets')
      .getPublicUrl(storagePath);

    const avatar_url = urlData.publicUrl + `?t=${Date.now()}`;

    // Update profile
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ avatar_url, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (updateError) throw updateError;

    res.json({ success: true, avatar_url });
  } catch (error: any) {
    // Clean up temp file on error
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// Remove avatar
router.delete('/avatar', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user.id;

    // Try to remove from storage (best effort for different extensions)
    for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
      await supabaseAdmin.storage.from('assets').remove([`avatars/${userId}${ext}`]);
    }

    // Clear avatar_url in profile
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) throw error;

    res.json({ success: true, message: 'Avatar removed' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Change password
router.post('/change-password', authMiddleware, async (req: any, res) => {
  try {
    const { new_password } = req.body;

    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
      password: new_password
    });

    if (error) throw error;

    res.json({ success: true, message: 'Password changed successfully' });
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

// --- Migration Routes ---

/**
 * Migrate anonymous data to the current authenticated user.
 * Triggered after signup/login if an anonymous ID is present.
 */
router.post('/migrate', authMiddleware, async (req: any, res) => {
  try {
    const { anon_id } = req.body;
    const userId = req.user.id;

    if (!anon_id) {
      return res.status(400).json({ success: false, message: 'anon_id is required' });
    }

    await migrateDataToUser(anon_id, userId);

    res.json({ 
      success: true, 
      message: 'Anonymous data successfully migrated to your account' 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

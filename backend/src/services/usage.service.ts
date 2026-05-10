import { supabaseAdmin } from '../lib/supabase';

export interface UsageStatus {
  allowed: boolean;
  remainingHourly: number;
  remainingDaily: number;
  hourlyLimit: number;
  dailyLimit: number;
  currentHourly: number;
  currentDaily: number;
  message?: string;
}

export class UsageService {
  /**
   * Checks if a user has exceeded their usage limits for a specific tool and period.
   * Uses the profiles table for consolidated tracking.
   */
  static async checkAndIncrement(
    userId: string,
    toolType: string,
    limits: { hourly: number; daily: number }
  ): Promise<UsageStatus> {
    // Currently, we map all download-related tracking to the download columns in profiles
    // In the future, this could be expanded to other tools if needed.
    
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('download_count_hourly, download_count_daily, last_download_at')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[UsageService] Error fetching profile:', error);
      throw error;
    }

    const now = new Date();
    const lastDownloadAt = profile.last_download_at ? new Date(profile.last_download_at) : null;
    
    let currentHourly = profile.download_count_hourly || 0;
    let currentDaily = profile.download_count_daily || 0;

    // Reset hourly if more than an hour has passed since last download
    // or if we've crossed into a new clock hour
    if (lastDownloadAt) {
      const isSameHour = 
        now.getHours() === lastDownloadAt.getHours() &&
        now.getDate() === lastDownloadAt.getDate() &&
        now.getMonth() === lastDownloadAt.getMonth() &&
        now.getFullYear() === lastDownloadAt.getFullYear();
        
      if (!isSameHour) {
        currentHourly = 0;
      }

      // Reset daily if it's a different day
      const isSameDay = 
        now.getDate() === lastDownloadAt.getDate() &&
        now.getMonth() === lastDownloadAt.getMonth() &&
        now.getFullYear() === lastDownloadAt.getFullYear();
        
      if (!isSameDay) {
        currentDaily = 0;
      }
    } else {
      // First time usage
      currentHourly = 0;
      currentDaily = 0;
    }

    const hourlyLimit = limits.hourly;
    const dailyLimit = limits.daily;

    // Check limits
    if (currentHourly >= hourlyLimit) {
      return {
        allowed: false,
        remainingHourly: 0,
        remainingDaily: Math.max(0, dailyLimit - currentDaily),
        hourlyLimit,
        dailyLimit,
        currentHourly,
        currentDaily,
        message: `Hourly download limit reached (${hourlyLimit}/hr)`
      };
    }

    if (currentDaily >= dailyLimit) {
      return {
        allowed: false,
        remainingHourly: Math.max(0, hourlyLimit - currentHourly),
        remainingDaily: 0,
        hourlyLimit,
        dailyLimit,
        currentHourly,
        currentDaily,
        message: `Daily download limit reached (${dailyLimit}/day)`
      };
    }

    // Increment and update profile
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        download_count_hourly: currentHourly + 1,
        download_count_daily: currentDaily + 1,
        last_download_at: now.toISOString(),
        download_limit_hourly: hourlyLimit,
        download_limit_daily: dailyLimit
      })
      .eq('id', userId);

    if (updateError) {
      console.error('[UsageService] Error updating usage:', updateError);
      throw updateError;
    }

    return {
      allowed: true,
      remainingHourly: hourlyLimit - (currentHourly + 1),
      remainingDaily: dailyLimit - (currentDaily + 1),
      hourlyLimit,
      dailyLimit,
      currentHourly: currentHourly + 1,
      currentDaily: currentDaily + 1
    };
  }

  /**
   * Retrieves current usage status without incrementing.
   */
  static async getUsage(userId: string, toolType: string, limits: { hourly: number; daily: number }): Promise<UsageStatus> {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('download_count_hourly, download_count_daily, last_download_at')
      .eq('id', userId)
      .single();

    if (error) {
      console.warn('[UsageService] Profile not found for usage check, using defaults');
      return {
        allowed: true,
        remainingHourly: limits.hourly,
        remainingDaily: limits.daily,
        hourlyLimit: limits.hourly,
        dailyLimit: limits.daily,
        currentHourly: 0,
        currentDaily: 0
      };
    }

    const now = new Date();
    const lastDownloadAt = profile.last_download_at ? new Date(profile.last_download_at) : null;
    
    let currentHourly = profile.download_count_hourly || 0;
    let currentDaily = profile.download_count_daily || 0;

    if (lastDownloadAt) {
      const isSameHour = 
        now.getHours() === lastDownloadAt.getHours() &&
        now.getDate() === lastDownloadAt.getDate() &&
        now.getMonth() === lastDownloadAt.getMonth() &&
        now.getFullYear() === lastDownloadAt.getFullYear();
        
      if (!isSameHour) currentHourly = 0;

      const isSameDay = 
        now.getDate() === lastDownloadAt.getDate() &&
        now.getMonth() === lastDownloadAt.getMonth() &&
        now.getFullYear() === lastDownloadAt.getFullYear();
        
      if (!isSameDay) currentDaily = 0;
    } else {
      currentHourly = 0;
      currentDaily = 0;
    }

    return {
      allowed: currentHourly < limits.hourly && currentDaily < limits.daily,
      remainingHourly: Math.max(0, limits.hourly - currentHourly),
      remainingDaily: Math.max(0, limits.daily - currentDaily),
      hourlyLimit: limits.hourly,
      dailyLimit: limits.daily,
      currentHourly,
      currentDaily
    };
  }
}

